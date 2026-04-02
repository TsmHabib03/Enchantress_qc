function requireFields_(obj, fields) {
  fields.forEach(function (name) {
    if (!obj || obj[name] === undefined || obj[name] === null || String(obj[name]).trim() === "") {
      throw new Error("Missing required field: " + name);
    }
  });
}

function validateAppointmentInput_(payload) {
  requireFields_(payload, ["customer", "serviceId", "date", "startTime"]);
  requireFields_(payload.customer, ["fullName", "phone"]);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    throw new Error("Invalid date format, expected YYYY-MM-DD");
  }
  if (!/^\d{2}:\d{2}$/.test(payload.startTime)) {
    throw new Error("Invalid startTime format, expected HH:MM");
  }
}

function assertValidStatusTransition_(fromStatus, toStatus) {
  var allowed = {};
  allowed[STATUS.PENDING] = [STATUS.CONFIRMED, STATUS.CANCELED];
  allowed[STATUS.CONFIRMED] = [STATUS.CHECKED_IN, STATUS.CANCELED, STATUS.NO_SHOW];
  allowed[STATUS.CHECKED_IN] = [STATUS.COMPLETED, STATUS.CANCELED];
  allowed[STATUS.COMPLETED] = [];
  allowed[STATUS.CANCELED] = [];
  allowed[STATUS.NO_SHOW] = [];

  var next = allowed[fromStatus] || [];
  if (next.indexOf(toStatus) < 0) {
    throw new Error("Invalid status transition from " + fromStatus + " to " + toStatus);
  }
}
