var APP_VERSION = "0.1.0";

var SHEETS = {
  CUSTOMERS: "Customers",
  SERVICES: "Services",
  APPOINTMENTS: "Appointments",
  STATUS_HISTORY: "AppointmentStatusHistory",
  LOGS: "Logs",
  CONFIG: "Config"
};

var STATUS = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  CHECKED_IN: "CHECKED_IN",
  COMPLETED: "COMPLETED",
  CANCELED: "CANCELED",
  NO_SHOW: "NO_SHOW"
};

var SHEET_HEADERS = {};
SHEET_HEADERS[SHEETS.CUSTOMERS] = ["customerId", "fullName", "phone", "email", "consentStatus", "active", "createdAt", "updatedAt"];
SHEET_HEADERS[SHEETS.SERVICES] = ["serviceId", "name", "durationMin", "price", "category", "active", "createdAt", "updatedAt"];
SHEET_HEADERS[SHEETS.APPOINTMENTS] = ["appointmentId", "customerId", "serviceId", "staffId", "date", "startTime", "endTime", "status", "sourceChannel", "notes", "createdAt", "updatedAt"];
SHEET_HEADERS[SHEETS.STATUS_HISTORY] = ["historyId", "appointmentId", "fromStatus", "toStatus", "changedBy", "reason", "changedAt"];
SHEET_HEADERS[SHEETS.LOGS] = ["logId", "level", "action", "entityType", "entityId", "actor", "detailsJson", "createdAt"];
SHEET_HEADERS[SHEETS.CONFIG] = ["key", "value"];
