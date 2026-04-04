(function () {
  var refreshButton = document.getElementById("refresh");
  var dateInput = document.getElementById("dashboard-date");
  var tbody = document.getElementById("appointments-body");
  var toast = document.getElementById("admin-toast");
  var accessStatus = document.getElementById("admin-access-status");
  var roleCards = Array.prototype.slice.call(document.querySelectorAll("[data-admin-role]"));

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

  function applyRoleCards(role) {
    roleCards.forEach(function (card) {
      var cardRole = card.getAttribute("data-admin-role");
      var visible = cardRole === role || (role === "ADMIN" && cardRole === "STAFF");
      card.classList.toggle("d-none", !visible);
    });
  }

  function setAccessStatus(role) {
    if (!accessStatus) {
      return;
    }

    if (role === "STAFF") {
      accessStatus.textContent = "Staff access granted. You can view dashboard data, and staff actions are visible as backend-pending placeholders.";
      return;
    }

    if (role === "ADMIN") {
      accessStatus.textContent = "Admin access granted. Staff and admin action groups are visible with backend-pending labels.";
    }
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
      emptyRow.innerHTML = "<td colspan='5' class='text-center text-muted py-3'>No appointments found for this date.</td>";
      tbody.appendChild(emptyRow);
      return;
    }

    appointments.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + row.startTime + "</td>" +
        "<td>" + row.customerName + "</td>" +
        "<td>" + row.serviceName + "</td>" +
        "<td>" + (row.staffName || "Unassigned") + "</td>" +
        "<td><span class='badge text-bg-light'>" + row.status + "</span></td>";
      tbody.appendChild(tr);
    });
  }

  async function refresh() {
    try {
      var date = dateInput && dateInput.value ? dateInput.value : todayDate();
      var report = await window.apiClient.get("/reports/summary?date=" + encodeURIComponent(date));
      var listing = await window.apiClient.get("/appointments/list?date=" + encodeURIComponent(date));

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
    if (role !== "STAFF" && role !== "ADMIN") {
      redirectToLanding("role_forbidden");
      return null;
    }

    return role;
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

  applyRoleCards(role);
  setAccessStatus(role);
  refresh();
})();
