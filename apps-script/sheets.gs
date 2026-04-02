function getSpreadsheet_() {
  var id = getRequiredProperty_("SPREADSHEET_ID");
  return SpreadsheetApp.openById(id);
}

function ensureSchema_() {
  var ss = getSpreadsheet_();
  Object.keys(SHEETS).forEach(function (k) {
    var name = SHEETS[k];
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }

    var headers = SHEET_HEADERS[name] || [];
    if (headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  });
}

function seedDefaultServices_() {
  var existing = listActiveServices_();
  if (existing.length > 0) {
    return;
  }

  var defaults = [
    { name: "Classic Manicure", durationMin: 45, price: 20, category: "Manicure" },
    { name: "Gel Manicure", durationMin: 60, price: 30, category: "Manicure" },
    { name: "Spa Pedicure", durationMin: 60, price: 35, category: "Pedicure" }
  ];

  defaults.forEach(function (svc) {
    saveService_(svc);
  });
}

function getSheetRows_(sheetName) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("Missing sheet: " + sheetName);
  }

  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return [];
  }

  var headers = values[0];
  return values.slice(1).map(function (row) {
    var obj = {};
    headers.forEach(function (h, idx) {
      obj[h] = row[idx];
    });
    return obj;
  });
}

function appendSheetRow_(sheetName, obj) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  var headers = SHEET_HEADERS[sheetName] || [];
  var row = headers.map(function (h) {
    return obj[h] !== undefined ? obj[h] : "";
  });
  sheet.appendRow(row);
}

function updateRowById_(sheetName, idField, idValue, updates) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = headers.indexOf(idField);

  if (idIdx < 0) {
    throw new Error("ID field not found: " + idField);
  }

  for (var r = 1; r < data.length; r += 1) {
    if (String(data[r][idIdx]) === String(idValue)) {
      headers.forEach(function (h, c) {
        if (updates[h] !== undefined) {
          data[r][c] = updates[h];
        }
      });
      sheet.getRange(r + 1, 1, 1, headers.length).setValues([data[r]]);
      return;
    }
  }

  throw new Error("Record not found: " + idValue);
}

function generateId_(prefix) {
  return prefix + "_" + Utilities.getUuid().replace(/-/g, "").slice(0, 12);
}

function nowIso_() {
  return new Date().toISOString();
}

function ensureCustomer_(customer) {
  requireFields_(customer, ["fullName", "phone"]);
  var customers = getSheetRows_(SHEETS.CUSTOMERS);

  for (var i = 0; i < customers.length; i += 1) {
    if (String(customers[i].phone) === String(customer.phone) && String(customers[i].active) !== "false") {
      return customers[i].customerId;
    }
  }

  var id = generateId_("CUS");
  var ts = nowIso_();
  appendSheetRow_(SHEETS.CUSTOMERS, {
    customerId: id,
    fullName: customer.fullName,
    phone: customer.phone,
    email: customer.email || "",
    consentStatus: customer.consentStatus || "UNKNOWN",
    active: true,
    createdAt: ts,
    updatedAt: ts
  });

  return id;
}

function getServiceById_(serviceId) {
  var services = getSheetRows_(SHEETS.SERVICES);
  for (var i = 0; i < services.length; i += 1) {
    if (String(services[i].serviceId) === String(serviceId) && String(services[i].active) !== "false") {
      return services[i];
    }
  }
  return null;
}

function saveService_(service) {
  requireFields_(service, ["name", "durationMin", "price", "category"]);
  var id = service.serviceId || generateId_("SVC");
  var ts = nowIso_();

  appendSheetRow_(SHEETS.SERVICES, {
    serviceId: id,
    name: service.name,
    durationMin: Number(service.durationMin),
    price: Number(service.price),
    category: service.category,
    active: service.active === false ? false : true,
    createdAt: ts,
    updatedAt: ts
  });

  return id;
}

function listActiveServices_() {
  return getSheetRows_(SHEETS.SERVICES).filter(function (s) {
    return String(s.active) !== "false";
  });
}

function computeEndTime_(startTime, durationMin) {
  var parts = String(startTime).split(":");
  var h = Number(parts[0]);
  var m = Number(parts[1]);
  var total = h * 60 + m + Number(durationMin);
  var outH = Math.floor(total / 60) % 24;
  var outM = total % 60;
  return (outH < 10 ? "0" : "") + outH + ":" + (outM < 10 ? "0" : "") + outM;
}

function overlaps_(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function listAppointmentsByDate_(date) {
  var rows = getSheetRows_(SHEETS.APPOINTMENTS);
  var customers = getSheetRows_(SHEETS.CUSTOMERS);
  var services = getSheetRows_(SHEETS.SERVICES);

  var customerById = {};
  customers.forEach(function (c) {
    customerById[c.customerId] = c;
  });

  var serviceById = {};
  services.forEach(function (s) {
    serviceById[s.serviceId] = s;
  });

  return rows
    .filter(function (x) {
      return String(x.date) === String(date);
    })
    .map(function (x) {
      var customer = customerById[x.customerId] || {};
      var service = serviceById[x.serviceId] || {};
      return {
        appointmentId: x.appointmentId,
        date: x.date,
        startTime: x.startTime,
        endTime: x.endTime,
        status: x.status,
        customerName: customer.fullName || "Unknown",
        serviceName: service.name || "Unknown",
        staffName: x.staffId || ""
      };
    })
    .sort(function (a, b) {
      return String(a.startTime).localeCompare(String(b.startTime));
    });
}

function listAvailableSlots_(serviceId, date) {
  if (!serviceId || !date) {
    throw new Error("serviceId and date are required");
  }

  var service = getServiceById_(serviceId);
  if (!service) {
    throw new Error("Service not found or inactive");
  }

  var appointments = getSheetRows_(SHEETS.APPOINTMENTS).filter(function (a) {
    return String(a.date) === String(date) && String(a.status) !== STATUS.CANCELED;
  });

  var duration = Number(service.durationMin);
  var slots = [];
  var openMinutes = 9 * 60;
  var closeMinutes = 20 * 60;
  var step = 30;

  for (var start = openMinutes; start + duration <= closeMinutes; start += step) {
    var startTime = (Math.floor(start / 60) < 10 ? "0" : "") + Math.floor(start / 60) + ":" + (start % 60 < 10 ? "0" : "") + (start % 60);
    var endTime = computeEndTime_(startTime, duration);
    var available = true;

    for (var i = 0; i < appointments.length; i += 1) {
      var row = appointments[i];
      if (overlaps_(startTime, endTime, String(row.startTime), String(row.endTime))) {
        available = false;
        break;
      }
    }

    slots.push({ startTime: startTime, endTime: endTime, available: available });
  }

  return slots;
}

function createAppointmentWithCustomer_(payload) {
  validateAppointmentInput_(payload);

  var service = getServiceById_(payload.serviceId);
  if (!service) {
    throw new Error("Service not found or inactive");
  }

  var duration = Number(service.durationMin);
  var endTime = computeEndTime_(payload.startTime, duration);
  var slots = listAvailableSlots_(payload.serviceId, payload.date);

  var requested = slots.filter(function (s) {
    return s.startTime === payload.startTime;
  })[0];

  if (!requested) {
    throw new Error("Requested slot is outside booking hours");
  }
  if (!requested.available) {
    throw new Error("Requested slot is not available");
  }

  var customerId = ensureCustomer_(payload.customer);
  var id = generateId_("APT");
  var ts = nowIso_();

  appendSheetRow_(SHEETS.APPOINTMENTS, {
    appointmentId: id,
    customerId: customerId,
    serviceId: payload.serviceId,
    staffId: payload.staffId || "",
    date: payload.date,
    startTime: payload.startTime,
    endTime: endTime,
    status: STATUS.CONFIRMED,
    sourceChannel: payload.sourceChannel || "WEB",
    notes: payload.notes || "",
    createdAt: ts,
    updatedAt: ts
  });

  appendSheetRow_(SHEETS.STATUS_HISTORY, {
    historyId: generateId_("HIS"),
    appointmentId: id,
    fromStatus: STATUS.PENDING,
    toStatus: STATUS.CONFIRMED,
    changedBy: "system",
    reason: "Appointment created",
    changedAt: ts
  });

  logEvent_("INFO", "APPOINTMENT_CREATE", "Appointment", id, payload.customer.fullName, {
    date: payload.date,
    startTime: payload.startTime,
    serviceId: payload.serviceId
  });

  return {
    appointmentId: id,
    customerId: customerId,
    status: STATUS.CONFIRMED,
    date: payload.date,
    startTime: payload.startTime,
    endTime: endTime
  };
}

function getDailySummary_(date) {
  var appointments = getSheetRows_(SHEETS.APPOINTMENTS).filter(function (a) {
    return String(a.date) === String(date);
  });
  var services = getSheetRows_(SHEETS.SERVICES);
  var servicePrice = {};

  services.forEach(function (s) {
    servicePrice[s.serviceId] = Number(s.price || 0);
  });

  var completed = 0;
  var estimatedRevenue = 0;

  appointments.forEach(function (a) {
    if (a.status === STATUS.COMPLETED || a.status === STATUS.CONFIRMED || a.status === STATUS.CHECKED_IN) {
      estimatedRevenue += servicePrice[a.serviceId] || 0;
    }
    if (a.status === STATUS.COMPLETED) {
      completed += 1;
    }
  });

  return {
    date: date,
    totalAppointments: appointments.length,
    completedAppointments: completed,
    estimatedRevenue: estimatedRevenue
  };
}

function logEvent_(level, action, entityType, entityId, actor, details) {
  appendSheetRow_(SHEETS.LOGS, {
    logId: generateId_("LOG"),
    level: level,
    action: action,
    entityType: entityType,
    entityId: entityId,
    actor: actor || "system",
    detailsJson: JSON.stringify(details || {}),
    createdAt: nowIso_()
  });
}
