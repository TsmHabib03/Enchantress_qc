function routeGatewayEnvelope_(e) {
  try {
    var envelope = parseGatewayEnvelope_(e);
    verifyGatewayEnvelope_(envelope);

    var method = (envelope.method || "GET").toUpperCase();
    var path = normalizePath_(envelope.path || "/health");
    var query = envelope.query || {};
    var body = envelope.body || {};

    if (path === "/health") {
      return jsonSuccess_({ status: "ok", version: APP_VERSION });
    }

    if (path === "/setup/init" && method === "POST") {
      ensureSchema_();
      seedDefaultServices_();
      return jsonSuccess_({ initialized: true });
    }

    if (path === "/services/list" && method === "GET") {
      return jsonSuccess_({ services: listActiveServices_() });
    }

    if (path === "/appointments/slots" && method === "GET") {
      var serviceId = query.serviceId;
      var date = query.date;
      var slots = listAvailableSlots_(serviceId, date);
      return jsonSuccess_({ slots: slots });
    }

    if (path === "/appointments/create" && method === "POST") {
      var appointment = createAppointmentWithCustomer_(body);
      return jsonSuccess_(appointment);
    }

    if (path === "/appointments/list" && method === "GET") {
      var dateFilter = query.date;
      return jsonSuccess_({ appointments: listAppointmentsByDate_(dateFilter) });
    }

    if (path === "/reports/summary" && method === "GET") {
      var reportDate = query.date;
      return jsonSuccess_(getDailySummary_(reportDate));
    }

    return jsonError_(404, "NOT_FOUND", "Route not found: " + path);
  } catch (error) {
    logEvent_("ERROR", "API_ERROR", "Route", "n/a", "system", {
      message: error.message,
      stack: error.stack
    });
    return jsonError_(500, "INTERNAL_ERROR", error.message || "Unexpected error");
  }
}

function normalizePath_(path) {
  var trimmed = String(path || "").trim();
  if (trimmed === "") {
    return "/";
  }
  if (trimmed.charAt(0) !== "/") {
    return "/" + trimmed;
  }
  return trimmed;
}

function jsonSuccess_(data) {
  return jsonResponse_(200, {
    success: true,
    data: data,
    error: null,
    meta: {
      timestamp: new Date().toISOString(),
      version: APP_VERSION
    }
  });
}

function jsonError_(statusCode, code, message) {
  return jsonResponse_(statusCode, {
    success: false,
    data: null,
    error: {
      code: code,
      message: message
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: APP_VERSION
    }
  });
}

function jsonResponse_(statusCode, payload) {
  var out = ContentService.createTextOutput(JSON.stringify(payload));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
