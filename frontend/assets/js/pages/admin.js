(function () {
  var refreshButton = document.getElementById("refresh");
  var dateInput = document.getElementById("dashboard-date");
  var tbody = document.getElementById("appointments-body");
  var usersBody = document.getElementById("users-body");
  var createStaffForm = document.getElementById("create-staff-form");
  var toast = document.getElementById("admin-toast");
  var accessStatus = document.getElementById("admin-access-status");
  var roleCards = Array.prototype.slice.call(document.querySelectorAll("[data-admin-role]"));
  var adminOnlySections = Array.prototype.slice.call(document.querySelectorAll("[data-admin-only]"));
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
    window.location.replace("staff.html");
  }

  function applyRoleCards(role) {
    roleCards.forEach(function (card) {
      var cardRole = card.getAttribute("data-admin-role");
      var visible = cardRole === role || (role === "ADMIN" && cardRole === "STAFF");
      card.classList.toggle("d-none", !visible);
    });
  }

  function toggleAdminOnlySections(role) {
    var isAdmin = role === "ADMIN";
    adminOnlySections.forEach(function (section) {
      section.classList.toggle("d-none", !isAdmin);
    });
  }

  function setAccessStatus(role) {
    if (!accessStatus) {
      return;
    }

    if (role === "STAFF") {
      accessStatus.textContent = "Staff access granted. You can see your assigned appointments and dashboard metrics.";
      return;
    }

    if (role === "ADMIN") {
      accessStatus.textContent = "Admin access granted. You can manage staff onboarding, role assignment, and appointment staff assignment.";
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
          var options = ["<option value=''>Choose staff</option>"];

          staffOptions.forEach(function (staff) {
            var staffId = escapeHtml(staff.userId);
            var selected = selectedId === String(staff.userId) ? " selected" : "";
            options.push("<option value='" + staffId + "'" + selected + ">" + escapeHtml(staff.fullName) + "</option>");
          });

          assignCell =
            "<select class='form-select form-select-sm js-assign-staff' data-appointment-id='" +
            escapeHtml(row.appointmentId) +
            "' data-current-value='" +
            escapeHtml(selectedId) +
            "'>" +
            options.join("") +
            "</select>";
        }
      }

      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(row.startTime) + "</td>" +
        "<td>" + escapeHtml(row.customerName) + "</td>" +
        "<td>" + escapeHtml(row.serviceName) + "</td>" +
        "<td>" + escapeHtml(row.staffName || "Unassigned") + "</td>" +
        "<td>" + assignCell + "</td>" +
        "<td><span class='badge text-bg-light'>" + escapeHtml(row.status) + "</span></td>";
      tbody.appendChild(tr);
    });
  }

  function renderUsers(users) {
    if (!usersBody) {
      return;
    }

    usersBody.innerHTML = "";

    if (!users || users.length === 0) {
      var emptyRow = document.createElement("tr");
      emptyRow.innerHTML = "<td colspan='5' class='text-center text-muted py-3'>No users found.</td>";
      usersBody.appendChild(emptyRow);
      return;
    }

    var session = getSession();
    var sessionUserId = session && session.user ? String(session.user.userId || "") : "";

    users.forEach(function (user) {
      var tr = document.createElement("tr");
      var userId = String(user.userId || "");
      var role = normalizeRole(user.role);
      var isSelf = sessionUserId && sessionUserId === userId;

      tr.innerHTML =
        "<td>" +
        escapeHtml(user.fullName) +
        (isSelf ? " <span class='text-muted'>(You)</span>" : "") +
        "</td>" +
        "<td>" + escapeHtml(user.email) + "</td>" +
        "<td>" + escapeHtml(user.department || "-") + "</td>" +
        "<td>" +
        "<select class='form-select form-select-sm js-role-select' data-user-id='" +
        escapeHtml(userId) +
        "'>" +
        "<option value='CUSTOMER'" + (role === "CUSTOMER" ? " selected" : "") + ">CUSTOMER</option>" +
        "<option value='STAFF'" + (role === "STAFF" ? " selected" : "") + ">STAFF</option>" +
        "<option value='ADMIN'" + (role === "ADMIN" ? " selected" : "") + ">ADMIN</option>" +
        "</select>" +
        "</td>" +
        "<td><button class='btn btn-sm btn-outline-primary js-save-role' type='button' data-user-id='" +
        escapeHtml(userId) +
        "'>Save</button></td>";

      usersBody.appendChild(tr);
    });
  }

  async function refresh() {
    try {
      var date = dateInput && dateInput.value ? dateInput.value : todayDate();

      var requests = [
        window.apiClient.get("/reports/summary?date=" + encodeURIComponent(date)),
        window.apiClient.get("/appointments/list?date=" + encodeURIComponent(date))
      ];

      if (currentRole === "ADMIN") {
        requests.push(window.apiClient.get("/staff/list"));
        requests.push(window.apiClient.get("/users/list"));
      }

      var results = await Promise.all(requests);
      var report = results[0];
      var listing = results[1];

      if (currentRole === "ADMIN") {
        staffOptions = (results[2] && results[2].staff) || [];
        renderUsers((results[3] && results[3].users) || []);
      } else {
        staffOptions = [];
      }

      document.getElementById("metric-appointments").textContent = report.totalAppointments;
      document.getElementById("metric-completed").textContent = report.completedAppointments;
      document.getElementById("metric-revenue").textContent = "$" + Number(report.estimatedRevenue || 0).toFixed(2);
      renderAppointments(listing.appointments || []);
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

  async function handleCreateStaffSubmit(event) {
    event.preventDefault();

    if (currentRole !== "ADMIN") {
      return;
    }

    if (!createStaffForm || !createStaffForm.checkValidity()) {
      if (createStaffForm) {
        createStaffForm.reportValidity();
      }
      return;
    }

    var payload = {
      fullName: createStaffForm.fullName.value.trim(),
      email: createStaffForm.email.value.trim(),
      phone: createStaffForm.phone.value.trim(),
      password: createStaffForm.password.value,
      department: createStaffForm.department.value.trim()
    };

    try {
      await window.apiClient.post("/staff/create", payload, { retries: 0 });
      createStaffForm.reset();
      showToast("success", "Staff account created successfully.");
      await refresh();
    } catch (error) {
      showToast("error", error.message);
    }
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

    if (!appointmentId || !staffUserId || staffUserId === currentValue) {
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

  async function handleUserRoleSaveClick(event) {
    var target = event.target;
    if (!target || !target.classList.contains("js-save-role")) {
      return;
    }

    if (currentRole !== "ADMIN") {
      return;
    }

    var userId = target.getAttribute("data-user-id");
    var row = target.closest("tr");
    var select = row ? row.querySelector(".js-role-select") : null;
    var role = select ? normalizeRole(select.value) : "";

    if (!userId || !role) {
      return;
    }

    target.disabled = true;
    try {
      await window.apiClient.post("/users/role/update", {
        userId: userId,
        role: role
      });
      showToast("success", "User role updated.");
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

  applyRoleCards(currentRole);
  toggleAdminOnlySections(currentRole);
  setAccessStatus(currentRole);

  if (createStaffForm) {
    createStaffForm.addEventListener("submit", handleCreateStaffSubmit);
  }
  if (tbody) {
    tbody.addEventListener("change", handleAppointmentAssignChange);
  }
  if (usersBody) {
    usersBody.addEventListener("click", handleUserRoleSaveClick);
  }

  window.addEventListener("enchantress:session-changed", function () {
    var nextRole = enforceAdminAccess();
    if (!nextRole) {
      return;
    }
    currentRole = nextRole;
    applyRoleCards(currentRole);
    toggleAdminOnlySections(currentRole);
    setAccessStatus(currentRole);
  });

  refresh();
})();
