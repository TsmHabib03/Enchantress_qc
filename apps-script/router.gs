function routeGatewayEnvelope_(e) {
  try {
    var envelope = parseGatewayEnvelope_(e);
    verifyGatewayEnvelope_(envelope);

    var path = normalizePath_(envelope.path || "/health");
    var query = envelope.query || {};
    var body = envelope.body || {};
    var method = String(envelope.method || "").toUpperCase();
    var hasBody = body && Object.keys(body).length > 0;

    if (!method) {
      method = hasBody ? "POST" : "GET";
    }

    function optionalSession() {
      try {
        return getCurrentSession_(envelope);
      } catch (err) {
        return null;
      }
    }

    function requiredSession() {
      return requireAuthenticatedSession_(envelope);
    }

    if (path === "/health") {
      return jsonSuccess_({ status: "ok", version: APP_VERSION });
    }

    if (path === "/setup/init" && method === "POST") {
      ensureSchema_();
      seedDefaultServices_();
      return jsonSuccess_({ initialized: true });
    }

    if (path === "/setup/bootstrap-admin" && method === "POST") {
      return jsonSuccess_(bootstrapAdminUser_(body));
    }

    if (path === "/services/list" && method === "GET") {
      return jsonSuccess_({ services: listActiveServices_() });
    }

    if (path === "/services/upsert" && method === "POST") {
      var svcSession = requiredSession();
      return jsonSuccess_(upsertServiceAsAdmin_(body, svcSession));
    }

    if (path === "/appointments/slots" && method === "GET") {
      if (isRbacEnabled_()) {
        requiredSession();
      }
      var serviceId = query.serviceId;
      var date = query.date;
      var slots = listAvailableSlots_(serviceId, date);
      return jsonSuccess_({ slots: slots });
    }

    if (path === "/appointments/create" && method === "POST") {
      var createSession = isRbacEnabled_() ? requiredSession() : optionalSession();
      var appointment = createAppointmentWithCustomerForSession_(body, createSession);
      return jsonSuccess_(appointment);
    }

    if (path === "/auth/register" && method === "POST") {
      return jsonSuccess_(registerUser_(body));
    }

    if (path === "/auth/login" && method === "POST") {
      return jsonSuccess_(loginUser_(body));
    }

    if (path === "/auth/claim-initial-admin" && method === "POST") {
      var claimSession = requiredSession();
      return jsonSuccess_(claimInitialAdminForSession_(claimSession));
    }

    if (path === "/appointments/list" && method === "GET") {
      var dateFilter = query.date;
      var listSession = isRbacEnabled_() ? requiredSession() : optionalSession();
      return jsonSuccess_({ appointments: listAppointmentsByDate_(dateFilter, listSession) });
    }

    if (path === "/appointments/status/update" && method === "POST") {
      var statusSession = requiredSession();
      return jsonSuccess_(updateAppointmentStatus_(body, statusSession));
    }

    if (path === "/appointments/assign-staff" && method === "POST") {
      var assignSession = requiredSession();
      return jsonSuccess_(assignAppointmentStaffAsAdmin_(body, assignSession));
    }

    if (path === "/staff/list" && method === "GET") {
      var staffSession = requiredSession();
      return jsonSuccess_({ staff: listStaffUsers_(staffSession) });
    }

    if (path === "/staff/create" && method === "POST") {
      var createStaffSession = requiredSession();
      return jsonSuccess_(createStaffUserAsAdmin_(body, createStaffSession));
    }

    if (path === "/users/list" && method === "GET") {
      var usersSession = requiredSession();
      var includeInactive = String(query.includeInactive || "").toLowerCase() === "true";
      return jsonSuccess_({ users: listUsersForAdmin_(usersSession, includeInactive) });
    }

    if (path === "/users/role/update" && method === "POST") {
      var roleSession = requiredSession();
      return jsonSuccess_(updateUserRoleAsAdmin_(body, roleSession));
    }

    if (path === "/customers/list" && method === "GET") {
      var customersSession = requiredSession();
      return jsonSuccess_({ customers: listCustomersForAdmin_(customersSession) });
    }

    if (path === "/customers/assign-staff" && method === "POST") {
      var customerAssignSession = requiredSession();
      return jsonSuccess_(assignCustomerStaffAsAdmin_(body, customerAssignSession));
    }

    if (path === "/reports/summary" && method === "GET") {
      var reportDate = query.date;
      var reportSession = isRbacEnabled_() ? requiredSession() : optionalSession();
      return jsonSuccess_(getDailySummary_(reportDate, reportSession));
    }

    return jsonError_(404, "NOT_FOUND", "Route not found: " + path);
  } catch (error) {
    logEvent_("ERROR", "API_ERROR", "Route", "n/a", "system", {
      message: error.message,
      stack: error.stack
    });
    return jsonError_(mapErrorToStatus_(error), mapErrorToCode_(error), error.message || "Unexpected error");
  }
}

function mapErrorToStatus_(error) {
  var message = String((error && error.message) || "").toLowerCase();
  if (message.indexOf("authentication required") >= 0 || message.indexOf("session") >= 0 || message.indexOf("token") >= 0) {
    return 401;
  }
  if (message.indexOf("permission") >= 0 || message.indexOf("outside your access scope") >= 0) {
    return 403;
  }
  if (message.indexOf("missing required field") >= 0 || message.indexOf("invalid") >= 0) {
    return 400;
  }
  if (message.indexOf("not found") >= 0) {
    return 404;
  }
  return 500;
}

function mapErrorToCode_(error) {
  var status = mapErrorToStatus_(error);
  if (status === 400) {
    return "BAD_REQUEST";
  }
  if (status === 401) {
    return "UNAUTHORIZED";
  }
  if (status === 403) {
    return "FORBIDDEN";
  }
  if (status === 404) {
    return "NOT_FOUND";
  }
  return "INTERNAL_ERROR";
}

function normalizePath_(path) {
  var trimmed = String(path || "").trim();
  if (trimmed === "") {
    return "/";
  }

  var normalized = trimmed;

  if (normalized.charAt(0) !== "/") {
    normalized = "/" + normalized;
  }

  // Normalize route variations coming from proxies or differing clients.
  normalized = normalized.replace(/\/+/g, "/");

  if (normalized.length > 1 && normalized.charAt(normalized.length - 1) === "/") {
    normalized = normalized.slice(0, -1);
  }

  if (normalized === "/api") {
    return "/";
  }
  if (normalized.indexOf("/api/") === 0) {
    normalized = normalized.slice(4);
    if (normalized === "") {
      normalized = "/";
    }
  }

  return normalized;
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
