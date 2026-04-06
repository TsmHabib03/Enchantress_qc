(function () {
  var refreshButton = document.getElementById("staff-refresh");
  var dateInput = document.getElementById("staff-dashboard-date");
  var tbody = document.getElementById("staff-appointments-body");
  var toast = document.getElementById("staff-toast");
  var accessStatus = document.getElementById("staff-access-status");

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
      window.sessionStorage.setItem("enchantressStaffRedirectReason", reason);
    } catch (error) {
      // Ignore storage errors.
    }
    window.location.replace("index.html#booking-panel");
  }

  function redirectToAdmin() {
    window.location.replace("admin.html");
  }

  function setAccessStatus(message) {
    if (!accessStatus) {
      return;
    }
    accessStatus.textContent = message;
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

  function todayDate() {
    return formatDateForTimezone(new Date(), window.APP_CONFIG && window.APP_CONFIG.TIMEZONE);
  }

  function showToast(type, text) {
    if (!toast) {
      return;
    }
    toast.className = "alert mt-3";
    toast.classList.add(type === "error" ? "alert-danger" : "alert-success");
    toast.textContent = text;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function nextStatusesFor(currentStatus) {
    var status = normalizeRole(currentStatus);
    if (status === "CONFIRMED") {
      return ["CHECKED_IN", "NO_SHOW"];
    }
    if (status === "CHECKED_IN") {
      return ["COMPLETED"];
    }
    return [];
  }

  function renderAppointments(appointments) {
    if (!tbody) {
      return;
    }

    tbody.innerHTML = "";

    if (!appointments || appointments.length === 0) {
      var emptyRow = document.createElement("tr");
      emptyRow.innerHTML = "<td colspan='7' class='text-center text-muted py-3'>No assigned appointments for this date.</td>";
      tbody.appendChild(emptyRow);
      return;
    }

    appointments.forEach(function (row) {
      var nextStatuses = nextStatusesFor(row.status);
      var selectOptions = ["<option value=''>Select</option>"];

      nextStatuses.forEach(function (status) {
        selectOptions.push("<option value='" + escapeHtml(status) + "'>" + escapeHtml(status) + "</option>");
      });

      var disabled = nextStatuses.length === 0 ? " disabled" : "";
      var tr = document.createElement("tr");
      tr.setAttribute("data-appointment-id", escapeHtml(row.appointmentId));

      tr.innerHTML =
        "<td>" + escapeHtml(row.startTime) + "</td>" +
        "<td>" + escapeHtml(row.customerName) + "</td>" +
        "<td>" + escapeHtml(row.serviceName) + "</td>" +
        "<td><span class='badge text-bg-light'>" + escapeHtml(row.status) + "</span></td>" +
        "<td><select class='form-select form-select-sm js-staff-status'" + disabled + ">" + selectOptions.join("") + "</select></td>" +
        "<td><textarea class='form-control form-control-sm js-staff-notes' rows='1' placeholder='Optional notes'>" + escapeHtml(row.sessionNotes || "") + "</textarea></td>" +
        "<td><button class='btn btn-sm btn-outline-primary js-staff-save' type='button'" + disabled + ">Save</button></td>";

      tbody.appendChild(tr);
    });
  }

  async function refresh(silent) {
    try {
      var date = dateInput && dateInput.value ? dateInput.value : todayDate();
      var results = await Promise.all([
        window.apiClient.get("/reports/summary?date=" + encodeURIComponent(date)),
        window.apiClient.get("/appointments/list?date=" + encodeURIComponent(date))
      ]);

      var report = results[0];
      var listing = results[1];

      document.getElementById("staff-metric-appointments").textContent = report.totalAppointments;
      document.getElementById("staff-metric-completed").textContent = report.completedAppointments;
      document.getElementById("staff-metric-revenue").textContent = "$" + Number(report.estimatedRevenue || 0).toFixed(2);
      renderAppointments(listing.appointments || []);

      if (!silent) {
        showToast("success", "Staff dashboard refreshed.");
      }
    } catch (error) {
      showToast("error", error.message);
    }
  }

  function enforceStaffAccess() {
    var session = getSession();
    if (!session || !session.user) {
      redirectToLanding("auth_required");
      return false;
    }

    var role = normalizeRole(session.user.role);
    if (role === "ADMIN") {
      redirectToAdmin();
      return false;
    }

    if (role !== "STAFF") {
      redirectToLanding("role_forbidden");
      return false;
    }

    setAccessStatus("Staff access granted. You can update status only for your assigned appointments.");
    return true;
  }

  async function handleSaveClick(event) {
    var target = event.target;
    if (!target || !target.classList.contains("js-staff-save")) {
      return;
    }

    var row = target.closest("tr");
    if (!row) {
      return;
    }

    var appointmentId = row.getAttribute("data-appointment-id");
    var statusSelect = row.querySelector(".js-staff-status");
    var notesInput = row.querySelector(".js-staff-notes");

    var toStatus = statusSelect ? String(statusSelect.value || "").trim() : "";
    var sessionNotes = notesInput ? String(notesInput.value || "").trim() : "";

    if (!appointmentId || !toStatus) {
      showToast("error", "Select a next status before saving.");
      return;
    }

    target.disabled = true;
    if (statusSelect) {
      statusSelect.disabled = true;
    }

    try {
      await window.apiClient.post("/appointments/status/update", {
        appointmentId: appointmentId,
        toStatus: toStatus,
        sessionNotes: sessionNotes,
        reason: "Updated from staff dashboard"
      });

      showToast("success", "Appointment status updated.");
      await refresh(true);
    } catch (error) {
      showToast("error", error.message);
      target.disabled = false;
      if (statusSelect) {
        statusSelect.disabled = false;
      }
    }
  }

  if (!enforceStaffAccess()) {
    return;
  }

  if (dateInput) {
    dateInput.value = todayDate();
    dateInput.addEventListener("change", function () {
      refresh(true);
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", function () {
      refresh(false);
    });
  }

  if (tbody) {
    tbody.addEventListener("click", handleSaveClick);
  }

  window.addEventListener("enchantress:session-changed", function () {
    if (!enforceStaffAccess()) {
      return;
    }
    refresh(true);
  });

  refresh(true);
})();
