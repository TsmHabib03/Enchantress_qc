(function () {
  var refreshButton = document.getElementById("refresh");
  var tbody = document.getElementById("appointments-body");
  var toast = document.getElementById("admin-toast");

  function showToast(type, text) {
    toast.className = "alert mt-3";
    toast.classList.add(type === "error" ? "alert-danger" : "alert-success");
    toast.textContent = text;
  }

  function todayDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function renderAppointments(appointments) {
    tbody.innerHTML = "";
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
      var date = todayDate();
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

  refreshButton.addEventListener("click", refresh);
  refresh();
})();
