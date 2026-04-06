(function () {
  var refreshButton = document.getElementById("refresh");
  var dateInput = document.getElementById("dashboard-date");
  var tbody = document.getElementById("appointments-body");
  var customersBody = document.getElementById("customers-body");
  var toast = document.getElementById("admin-toast");
  var accessStatus = document.getElementById("admin-access-status");
  var currentRole = null;
  var staffOptions = [];

  function getSessionFallback() {
    try {
      var raw = window.localStorage.getItem("enchantressSession");
      if (!raw) {
        return null;
      }
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.user || !parsed.token) {
        return null;
      }
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function getSession() {
    if (window.authSession && typeof window.authSession.getSession === "function") {
      return window.authSession.getSession();
    }
    return getSessionFallback();
  }

  function normalizeRole(role) {
    return String(role || "").toUpperCase();
  }

  function redirectToLanding(reason) {
    try {
      window.sessionStorage.setItem("enchantressAdminRedirectReason", reason);
    } catch (error) {
      // Ignore storage errors.
    }
    window.location.replace("index.html#booking-panel");
  }

  function redirectToStaff() {
    window.location.replace("/staff");
  }

  function setAccessStatus(role) {
    if (!accessStatus) {
      return;
    }

    if (role === "ADMIN") {
      accessStatus.textContent = "Admin access granted. You can monitor customers and assign them to registered staff.";
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDateForTimezone(date, timezone) {
    try {
      var formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone || "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
      var parts = formatter.formatToParts(date);
      var year = "";
      var month = "";
      var day = "";

      parts.forEach(function (part) {
        if (part.type === "year") {
          year = part.value;
        } else if (part.type === "month") {
          month = part.value;
        } else if (part.type === "day") {
          day = part.value;
        }
      });

      if (year && month && day) {
        return year + "-" + month + "-" + day;
      }
    } catch (error) {
      // Fallback handled below.
    }

    return new Date(date).toISOString().slice(0, 10);
  }

  function showToast(type, text) {
    if (!toast) {
      return;
    }
    toast.className = "alert mt-3";
    toast.classList.add(type === "error" ? "alert-danger" : "alert-success");
    toast.textContent = text;
  }

  function todayDate() {
    return formatDateForTimezone(new Date(), window.APP_CONFIG && window.APP_CONFIG.TIMEZONE);
  }

  function getStaffNameById(staffId) {
    var normalizedId = String(staffId || "").trim();
    if (!normalizedId) {
      return "Unassigned";
    }

    for (var i = 0; i < staffOptions.length; i += 1) {
      if (String(staffOptions[i].userId) === normalizedId) {
        return staffOptions[i].fullName || "Unassigned";
      }
    }

    return "Unknown staff";
  }

  function buildStaffSelectOptions(selectedId) {
    var normalizedSelected = String(selectedId || "");
    var options = ["<option value=''>Choose staff</option>"];

    staffOptions.forEach(function (staff) {
      var staffId = escapeHtml(staff.userId);
      var selected = normalizedSelected === String(staff.userId) ? " selected" : "";
      options.push("<option value='" + staffId + "'" + selected + ">" + escapeHtml(staff.fullName) + "</option>");
    });

    return options.join("");
  }

  function renderAppointments(appointments) {
    tbody.innerHTML = "";

    if (!appointments || appointments.length === 0) {
      var emptyRow = document.createElement("tr");
      emptyRow.innerHTML = "<td colspan='6' class='text-center text-muted py-3'>No appointments found for this date.</td>";
      tbody.appendChild(emptyRow);
      return;
    }

    appointments.forEach(function (row) {
      var assignCell = "<span class='text-muted'>-</span>";

      if (currentRole === "ADMIN") {
        if (!staffOptions.length) {
          assignCell = "<span class='text-muted'>No staff</span>";
        } else {
          var selectedId = String(row.assignedStaffId || "");
          assignCell =
            "<select class='form-select form-select-sm js-assign-staff' data-appointment-id='" +
            escapeHtml(row.appointmentId) +
            "' data-current-value='" +
            escapeHtml(selectedId) +
            "'>" +
            buildStaffSelectOptions(selectedId) +
            "</select>";
        }
      }

      var resolvedStaffName = row.staffName || getStaffNameById(row.assignedStaffId || row.staffId);

      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(row.startTime) + "</td>" +
        "<td>" + escapeHtml(row.customerName) + "</td>" +
        "<td>" + escapeHtml(row.serviceName) + "</td>" +
        "<td>" + escapeHtml(resolvedStaffName) + "</td>" +
        "<td>" + assignCell + "</td>" +
        "<td><span class='badge text-bg-light'>" + escapeHtml(row.status) + "</span></td>";
      tbody.appendChild(tr);
    });
  }

  function renderCustomers(customers) {
    if (!customersBody) {
      return;
    }

    customersBody.innerHTML = "";

    if (!customers || customers.length === 0) {
      var emptyRow = document.createElement("tr");
      emptyRow.innerHTML = "<td colspan='6' class='text-center text-muted py-3'>No customers found.</td>";
      customersBody.appendChild(emptyRow);
      return;
    }

    customers.forEach(function (customer) {
      var tr = document.createElement("tr");
      var customerId = String(customer.customerId || "");
      var selectedStaffId = String(customer.managedBy || "");
      var currentStaffName = getStaffNameById(selectedStaffId);
      var assignCell = "<span class='text-muted'>No staff</span>";

      if (staffOptions.length) {
        assignCell =
          "<select class='form-select form-select-sm js-assign-customer-staff' data-customer-id='" +
          escapeHtml(customerId) +
          "' data-current-value='" +
          escapeHtml(selectedStaffId) +
          "'>" +
          buildStaffSelectOptions(selectedStaffId) +
          "</select>";
      }

      tr.innerHTML =
        "<td>" + escapeHtml(customer.fullName || "-") + "</td>" +
        "<td>" + escapeHtml(customer.phone || "-") + "</td>" +
        "<td>" + escapeHtml(customer.email || "-") + "</td>" +
        "<td>" + escapeHtml(currentStaffName) + "</td>" +
        "<td>" + assignCell + "</td>" +
        "<td><span class='badge text-bg-light'>" + escapeHtml(customer.ownershipModel || "SALON") + "</span></td>";

      customersBody.appendChild(tr);
    });
  }

  async function refresh() {
    try {
      var date = dateInput && dateInput.value ? dateInput.value : todayDate();

      var results = await Promise.all([
        window.apiClient.get("/reports/summary?date=" + encodeURIComponent(date)),
        window.apiClient.get("/appointments/list?date=" + encodeURIComponent(date)),
        window.apiClient.get("/staff/list"),
        window.apiClient.get("/customers/list")
      ]);

      var report = results[0];
      var listing = results[1];
      var staffListing = results[2];
      var customerListing = results[3];

      staffOptions = (staffListing && staffListing.staff) || [];

      document.getElementById("metric-appointments").textContent = report.totalAppointments;
      document.getElementById("metric-completed").textContent = report.completedAppointments;
      document.getElementById("metric-revenue").textContent = "$" + Number(report.estimatedRevenue || 0).toFixed(2);
      renderAppointments(listing.appointments || []);
      renderCustomers((customerListing && customerListing.customers) || []);
      showToast("success", "Dashboard refreshed");
    } catch (error) {
      showToast("error", error.message);
    }
  }

  function enforceAdminAccess() {
    var session = getSession();
    if (!session || !session.user) {
      redirectToLanding("auth_required");
      return null;
    }

    var role = normalizeRole(session.user.role);
    if (role === "STAFF") {
      redirectToStaff();
      return null;
    }

    if (role !== "ADMIN") {
      redirectToLanding("role_forbidden");
      return null;
    }

    return role;
  }

  async function handleAppointmentAssignChange(event) {
    var target = event.target;
    if (!target || !target.classList.contains("js-assign-staff")) {
      return;
    }

    if (currentRole !== "ADMIN") {
      return;
    }

    var appointmentId = target.getAttribute("data-appointment-id");
    var staffUserId = String(target.value || "").trim();
    var currentValue = String(target.getAttribute("data-current-value") || "");

    if (!appointmentId || staffUserId === currentValue) {
      return;
    }

    if (!staffUserId) {
      target.value = currentValue;
      showToast("error", "Please choose a registered staff member.");
      return;
    }

    target.disabled = true;
    try {
      await window.apiClient.post("/appointments/assign-staff", {
        appointmentId: appointmentId,
        staffUserId: staffUserId
      });
      showToast("success", "Staff assigned successfully.");
      await refresh();
    } catch (error) {
      target.disabled = false;
      showToast("error", error.message);
    }
  }

  async function handleCustomerAssignChange(event) {
    var target = event.target;
    if (!target || !target.classList.contains("js-assign-customer-staff")) {
      return;
    }

    if (currentRole !== "ADMIN") {
      return;
    }

    var customerId = target.getAttribute("data-customer-id");
    var staffUserId = String(target.value || "").trim();
    var currentValue = String(target.getAttribute("data-current-value") || "");

    if (!customerId || staffUserId === currentValue) {
      return;
    }

    if (!staffUserId) {
      target.value = currentValue;
      showToast("error", "Please choose a registered staff member.");
      return;
    }

    target.disabled = true;
    try {
      await window.apiClient.post("/customers/assign-staff", {
        customerId: customerId,
        staffUserId: staffUserId
      });
      showToast("success", "Customer ownership updated.");
      await refresh();
    } catch (error) {
      target.disabled = false;
      showToast("error", error.message);
    }
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", refresh);
  }

  if (dateInput) {
    dateInput.value = todayDate();
    dateInput.addEventListener("change", refresh);
  }

  var role = enforceAdminAccess();
  if (!role) {
    return;
  }

  currentRole = role;
  setAccessStatus(currentRole);

  if (tbody) {
    tbody.addEventListener("change", handleAppointmentAssignChange);
  }
  if (customersBody) {
    customersBody.addEventListener("change", handleCustomerAssignChange);
  }

  window.addEventListener("enchantress:session-changed", function () {
    var nextRole = enforceAdminAccess();
    if (!nextRole) {
      return;
    }
    currentRole = nextRole;
    setAccessStatus(currentRole);
    refresh();
  });

  refresh();
})();
