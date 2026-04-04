function getSpreadsheet_() {
  var id = getRequiredProperty_("SPREADSHEET_ID");
  return SpreadsheetApp.openById(id);
}

var dateTimezoneCache_ = null;

function getDateTimezone_() {
  if (dateTimezoneCache_) {
    return dateTimezoneCache_;
  }

  try {
    dateTimezoneCache_ = getSpreadsheet_().getSpreadsheetTimeZone() || "Asia/Manila";
  } catch (error) {
    dateTimezoneCache_ = "Asia/Manila";
  }

  return dateTimezoneCache_;
}

function normalizeDateValue_(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, getDateTimezone_(), "yyyy-MM-dd");
  }

  var text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  var parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, getDateTimezone_(), "yyyy-MM-dd");
  }

  return text;
}

function matchesDate_(sheetDateValue, requestedDate) {
  if (!requestedDate) {
    return true;
  }
  return normalizeDateValue_(sheetDateValue) === normalizeDateValue_(requestedDate);
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

  seedConfigDefaults_();
}

function seedConfigDefaults_() {
  var rows = getSheetRows_(SHEETS.CONFIG);
  var config = {};
  rows.forEach(function (row) {
    config[String(row.key || "")] = String(row.value || "");
  });

  var defaults = {
    ENABLE_RBAC: "true"
  };

  Object.keys(defaults).forEach(function (key) {
    if (!config[key]) {
      appendSheetRow_(SHEETS.CONFIG, {
        key: key,
        value: defaults[key]
      });
    }
  });
}

function getConfigValue_(key, fallback) {
  var rows = getSheetRows_(SHEETS.CONFIG);
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i].key) === String(key)) {
      return String(rows[i].value || "");
    }
  }
  return fallback;
}

function isRbacEnabled_() {
  return String(getConfigValue_("ENABLE_RBAC", "true")).toLowerCase() !== "false";
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
    saveService_(svc, { userId: "system", role: "ADMIN" });
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
  return ensureCustomerForSession_(customer, null);
}

function ensureCustomerForSession_(customer, session) {
  requireFields_(customer, ["fullName", "phone"]);

  var safeName = sanitizeForSheet_(customer.fullName);
  var safePhone = sanitizeForSheet_(customer.phone);
  var safeEmail = normalizeEmail_(customer.email || (session ? session.email : ""));
  var linkedUserId = session && session.role === "CUSTOMER" ? session.userId : sanitizeForSheet_(customer.linkedUserId || "");

  var customers = getSheetRows_(SHEETS.CUSTOMERS);

  for (var i = 0; i < customers.length; i += 1) {
    var row = customers[i];
    if (String(row.active) === "false") {
      continue;
    }

    var byLinkedUser = linkedUserId && String(row.linkedUserId) === String(linkedUserId);
    var byPhone = String(row.phone) === String(safePhone);
    var byEmail = safeEmail && normalizeEmail_(row.email) === safeEmail;

    if (byLinkedUser || byPhone || byEmail) {
      if (linkedUserId && !row.linkedUserId) {
        updateRowById_(SHEETS.CUSTOMERS, "customerId", row.customerId, {
          linkedUserId: linkedUserId,
          ownershipModel: "PERSONAL",
          updatedAt: nowIso_()
        });
      }
      if (safeEmail && !row.email) {
        updateRowById_(SHEETS.CUSTOMERS, "customerId", row.customerId, {
          email: safeEmail,
          updatedAt: nowIso_()
        });
      }
      return customers[i].customerId;
    }
  }

  var id = generateId_("CUS");
  var ts = nowIso_();
  appendSheetRow_(SHEETS.CUSTOMERS, {
    customerId: id,
    fullName: safeName,
    phone: safePhone,
    email: safeEmail,
    consentStatus: customer.consentStatus || "UNKNOWN",
    active: true,
    linkedUserId: linkedUserId || "",
    managedBy: session && session.role === "STAFF" ? session.userId : "",
    ownershipModel: linkedUserId ? "PERSONAL" : "SALON",
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

function saveService_(service, session) {
  requireFields_(service, ["name", "durationMin", "price", "category"]);
  var id = service.serviceId || generateId_("SVC");
  var ts = nowIso_();

  var createdByUserId = (session && session.userId) || "system";
  var maintainedByJson = service.maintainedByJson || "[]";

  appendSheetRow_(SHEETS.SERVICES, {
    serviceId: id,
    name: sanitizeForSheet_(service.name),
    durationMin: Number(service.durationMin),
    price: Number(service.price),
    category: sanitizeForSheet_(service.category),
    active: service.active === false ? false : true,
    createdByUserId: createdByUserId,
    maintainedByJson: maintainedByJson,
    createdAt: ts,
    updatedAt: ts
  });

  return id;
}

function upsertServiceAsAdmin_(service, session) {
  requireRole_(session, ["ADMIN"]);
  requireFields_(service, ["name", "durationMin", "price", "category"]);

  if (!service.serviceId) {
    var createdId = saveService_(service, session);
    logEvent_("INFO", "SERVICE_CREATE", "Service", createdId, session.email, {
      name: service.name,
      category: service.category
    });
    return { serviceId: createdId, created: true };
  }

  var existing = getServiceById_(service.serviceId);
  if (!existing) {
    throw new Error("Service not found");
  }

  updateRowById_(SHEETS.SERVICES, "serviceId", service.serviceId, {
    name: sanitizeForSheet_(service.name),
    durationMin: Number(service.durationMin),
    price: Number(service.price),
    category: sanitizeForSheet_(service.category),
    active: service.active === false ? false : true,
    maintainedByJson: service.maintainedByJson || existing.maintainedByJson || "[]",
    updatedAt: nowIso_()
  });

  logEvent_("INFO", "SERVICE_UPDATE", "Service", service.serviceId, session.email, {
    name: service.name,
    category: service.category
  });

  return { serviceId: service.serviceId, created: false };
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

function getCustomerById_(customerId) {
  var customers = getSheetRows_(SHEETS.CUSTOMERS);
  for (var i = 0; i < customers.length; i += 1) {
    if (String(customers[i].customerId) === String(customerId) && String(customers[i].active) !== "false") {
      return customers[i];
    }
  }
  return null;
}

function getUserById_(userId) {
  if (!userId) {
    return null;
  }
  var users = getSheetRows_(SHEETS.USERS);
  for (var i = 0; i < users.length; i += 1) {
    if (String(users[i].userId) === String(userId) && String(users[i].active) !== "false") {
      return users[i];
    }
  }
  return null;
}

function isAppointmentVisibleToSession_(session, appointmentRow, customerRow) {
  if (!session) {
    return false;
  }

  var role = normalizeRole_(session.role);
  if (role === "ADMIN") {
    return true;
  }

  if (role === "STAFF") {
    return String(appointmentRow.assignedStaffId || appointmentRow.staffId || "") === String(session.userId);
  }

  if (role === "CUSTOMER") {
    if (String(appointmentRow.createdByUserId || "") === String(session.userId)) {
      return true;
    }
    return customerRow && String(customerRow.linkedUserId || "") === String(session.userId);
  }

  return false;
}

function listAppointmentsByDate_(date, session) {
  var rows = getSheetRows_(SHEETS.APPOINTMENTS);
  var customers = getSheetRows_(SHEETS.CUSTOMERS);
  var services = getSheetRows_(SHEETS.SERVICES);
  var users = getSheetRows_(SHEETS.USERS);

  var customerById = {};
  customers.forEach(function (c) {
    customerById[c.customerId] = c;
  });

  var serviceById = {};
  services.forEach(function (s) {
    serviceById[s.serviceId] = s;
  });

  var userById = {};
  users.forEach(function (u) {
    userById[u.userId] = u;
  });

  return rows
    .filter(function (x) {
      if (!matchesDate_(x.date, date)) {
        return false;
      }
      if (!isRbacEnabled_()) {
        return true;
      }
      if (!session) {
        return false;
      }
      var customer = customerById[x.customerId] || null;
      return isAppointmentVisibleToSession_(session, x, customer);
    })
    .map(function (x) {
      var customer = customerById[x.customerId] || {};
      var service = serviceById[x.serviceId] || {};
      var staffUser = userById[x.assignedStaffId] || userById[x.staffId] || {};
      return {
        appointmentId: x.appointmentId,
        customerId: x.customerId,
        serviceId: x.serviceId,
        date: normalizeDateValue_(x.date),
        startTime: x.startTime,
        endTime: x.endTime,
        status: x.status,
        customerName: customer.fullName || "Unknown",
        serviceName: service.name || "Unknown",
        staffName: staffUser.fullName || x.assignedStaffId || x.staffId || "",
        assignedStaffId: x.assignedStaffId || x.staffId || "",
        notes: x.notes || "",
        sessionNotes: x.sessionNotes || ""
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
    return matchesDate_(a.date, date) && String(a.status) !== STATUS.CANCELED;
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
  return createAppointmentWithCustomerForSession_(payload, null);
}

function createAppointmentWithCustomerForSession_(payload, session) {
  if (isRbacEnabled_()) {
    if (!session) {
      throw new Error("Authentication required for booking");
    }
    requireRole_(session, ["ADMIN", "STAFF", "CUSTOMER"]);
  }

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

  var bookingCustomer = {
    fullName: payload.customer.fullName,
    phone: payload.customer.phone,
    email: payload.customer.email || "",
    consentStatus: payload.customer.consentStatus || "UNKNOWN"
  };

  if (session && session.role === "CUSTOMER") {
    bookingCustomer.email = session.email;
  }

  var customerId = ensureCustomerForSession_(bookingCustomer, session);
  var id = generateId_("APT");
  var ts = nowIso_();
  var actorRole = normalizeRole_(session && session.role ? session.role : "CUSTOMER");
  var assignedStaffId = sanitizeForSheet_(payload.assignedStaffId || payload.staffId || "");

  if (assignedStaffId) {
    var assignedStaff = getUserById_(assignedStaffId);
    if (!assignedStaff || normalizeRole_(assignedStaff.role) !== "STAFF") {
      throw new Error("Assigned staff is invalid or inactive");
    }
  }

  appendSheetRow_(SHEETS.APPOINTMENTS, {
    appointmentId: id,
    customerId: customerId,
    serviceId: payload.serviceId,
    staffId: assignedStaffId,
    assignedStaffId: assignedStaffId,
    date: payload.date,
    startTime: payload.startTime,
    endTime: endTime,
    status: STATUS.CONFIRMED,
    sourceChannel: payload.sourceChannel || "WEB_AUTH",
    notes: sanitizeForSheet_(payload.notes || ""),
    sessionNotes: "",
    createdByUserId: session ? session.userId : "",
    createdByRole: actorRole,
    voidedAt: "",
    voidedByUserId: "",
    createdAt: ts,
    updatedAt: ts
  });

  appendSheetRow_(SHEETS.STATUS_HISTORY, {
    historyId: generateId_("HIS"),
    appointmentId: id,
    fromStatus: STATUS.PENDING,
    toStatus: STATUS.CONFIRMED,
    changedBy: session ? session.email : "system",
    changedByUserId: session ? session.userId : "system",
    changedByRole: actorRole,
    reason: "Appointment created",
    changedAt: ts
  });

  logEvent_("INFO", "APPOINTMENT_CREATE", "Appointment", id, session ? session.email : payload.customer.fullName, {
    date: payload.date,
    startTime: payload.startTime,
    serviceId: payload.serviceId
  });

  return {
    appointmentId: id,
    customerId: customerId,
    assignedStaffId: assignedStaffId,
    status: STATUS.CONFIRMED,
    date: payload.date,
    startTime: payload.startTime,
    endTime: endTime
  };
}

function findAppointmentById_(appointmentId) {
  var rows = getSheetRows_(SHEETS.APPOINTMENTS);
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i].appointmentId) === String(appointmentId)) {
      return rows[i];
    }
  }
  return null;
}

function assignAppointmentStaffAsAdmin_(payload, session) {
  requireRole_(session, ["ADMIN"]);
  requireFields_(payload, ["appointmentId", "staffUserId"]);

  var appointment = findAppointmentById_(payload.appointmentId);
  if (!appointment) {
    throw new Error("Appointment not found");
  }

  var staff = getUserById_(payload.staffUserId);
  if (!staff || normalizeRole_(staff.role) !== "STAFF") {
    throw new Error("Staff user not found or invalid");
  }

  updateRowById_(SHEETS.APPOINTMENTS, "appointmentId", payload.appointmentId, {
    assignedStaffId: staff.userId,
    staffId: staff.userId,
    updatedAt: nowIso_()
  });

  logEvent_("INFO", "APPOINTMENT_ASSIGN_STAFF", "Appointment", payload.appointmentId, session.email, {
    staffUserId: staff.userId
  });

  return {
    appointmentId: payload.appointmentId,
    assignedStaffId: staff.userId
  };
}

function updateAppointmentStatus_(payload, session) {
  requireFields_(payload, ["appointmentId", "toStatus"]);
  requireRole_(session, ["ADMIN", "STAFF", "CUSTOMER"]);

  var appointment = findAppointmentById_(payload.appointmentId);
  if (!appointment) {
    throw new Error("Appointment not found");
  }

  var toStatus = String(payload.toStatus || "").toUpperCase();
  var fromStatus = String(appointment.status || STATUS.PENDING).toUpperCase();
  var role = normalizeRole_(session.role);
  var customer = getCustomerById_(appointment.customerId);

  if (!isAppointmentVisibleToSession_(session, appointment, customer)) {
    throw new Error("Appointment is outside your access scope");
  }

  if (role === "STAFF") {
    var staffAllowed = [STATUS.CHECKED_IN, STATUS.COMPLETED, STATUS.NO_SHOW];
    if (staffAllowed.indexOf(toStatus) < 0) {
      throw new Error("Staff can only mark started, completed, or no-show");
    }
  }

  if (role === "CUSTOMER" && toStatus !== STATUS.CANCELED) {
    throw new Error("Customers can only cancel their own appointments");
  }

  assertValidStatusTransition_(fromStatus, toStatus);

  var updates = {
    status: toStatus,
    updatedAt: nowIso_()
  };

  if (payload.sessionNotes !== undefined) {
    updates.sessionNotes = sanitizeForSheet_(payload.sessionNotes || "");
  }
  if (payload.notes !== undefined) {
    updates.notes = sanitizeForSheet_(payload.notes || "");
  }
  if (role === "ADMIN" && payload.voidTransaction === true && toStatus === STATUS.CANCELED) {
    updates.voidedAt = nowIso_();
    updates.voidedByUserId = session.userId;
  }

  updateRowById_(SHEETS.APPOINTMENTS, "appointmentId", payload.appointmentId, updates);

  appendSheetRow_(SHEETS.STATUS_HISTORY, {
    historyId: generateId_("HIS"),
    appointmentId: payload.appointmentId,
    fromStatus: fromStatus,
    toStatus: toStatus,
    changedBy: session.email,
    changedByUserId: session.userId,
    changedByRole: role,
    reason: sanitizeForSheet_(payload.reason || "Status updated"),
    changedAt: nowIso_()
  });

  logEvent_("INFO", "APPOINTMENT_STATUS_UPDATE", "Appointment", payload.appointmentId, session.email, {
    fromStatus: fromStatus,
    toStatus: toStatus,
    voidTransaction: role === "ADMIN" && payload.voidTransaction === true
  });

  return {
    appointmentId: payload.appointmentId,
    fromStatus: fromStatus,
    toStatus: toStatus
  };
}

function listCustomersForAdmin_(session) {
  requireRole_(session, ["ADMIN"]);

  return getSheetRows_(SHEETS.CUSTOMERS)
    .filter(function (row) {
      return String(row.active) !== "false";
    })
    .map(function (row) {
      return {
        customerId: row.customerId,
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
        linkedUserId: row.linkedUserId || "",
        managedBy: row.managedBy || "",
        ownershipModel: row.ownershipModel || "SALON"
      };
    });
}

function getDailySummary_(date, session) {
  if (isRbacEnabled_()) {
    requireRole_(session, ["ADMIN", "STAFF"]);
  }

  var appointments = listAppointmentsByDate_(date, session);
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
