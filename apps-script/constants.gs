var APP_VERSION = "0.2.0";

var SHEETS = {
  CUSTOMERS: "Customers",
  SERVICES: "Services",
  APPOINTMENTS: "Appointments",
  USERS: "Users",
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
SHEET_HEADERS[SHEETS.CUSTOMERS] = [
  "customerId",
  "fullName",
  "phone",
  "email",
  "consentStatus",
  "active",
  "linkedUserId",
  "managedBy",
  "ownershipModel",
  "createdAt",
  "updatedAt"
];
SHEET_HEADERS[SHEETS.SERVICES] = [
  "serviceId",
  "name",
  "durationMin",
  "price",
  "category",
  "active",
  "createdByUserId",
  "maintainedByJson",
  "createdAt",
  "updatedAt"
];
SHEET_HEADERS[SHEETS.APPOINTMENTS] = [
  "appointmentId",
  "customerId",
  "serviceId",
  "staffId",
  "assignedStaffId",
  "date",
  "startTime",
  "endTime",
  "status",
  "sourceChannel",
  "notes",
  "sessionNotes",
  "createdByUserId",
  "createdByRole",
  "voidedAt",
  "voidedByUserId",
  "createdAt",
  "updatedAt"
];
SHEET_HEADERS[SHEETS.USERS] = [
  "userId",
  "fullName",
  "email",
  "phone",
  "passwordHash",
  "role",
  "active",
  "createdAt",
  "updatedAt",
  "lastLoginAt",
  "deletedAt",
  "department"
];
SHEET_HEADERS[SHEETS.STATUS_HISTORY] = [
  "historyId",
  "appointmentId",
  "fromStatus",
  "toStatus",
  "changedBy",
  "changedByUserId",
  "changedByRole",
  "reason",
  "changedAt"
];
SHEET_HEADERS[SHEETS.LOGS] = ["logId", "level", "action", "entityType", "entityId", "actor", "detailsJson", "createdAt"];
SHEET_HEADERS[SHEETS.CONFIG] = ["key", "value"];
