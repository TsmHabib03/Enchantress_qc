(function () {
  var form = document.getElementById("booking-form");
  var serviceSelect = document.getElementById("serviceId");
  var dateInput = document.getElementById("date");
  var slotList = document.getElementById("slot-list");
  var toast = document.getElementById("toast");

  function showToast(type, text) {
    toast.className = "alert mt-3";
    toast.classList.add(type === "error" ? "alert-danger" : "alert-success");
    toast.textContent = text;
  }

  function formatDate(date) {
    return new Date(date).toISOString().slice(0, 10);
  }

  async function loadServices() {
    var data = await window.apiClient.get("/services/list");
    serviceSelect.innerHTML = "";

    if (!data.services || data.services.length === 0) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "No services available";
      serviceSelect.appendChild(empty);
      return;
    }

    data.services.forEach(function (service) {
      var option = document.createElement("option");
      option.value = service.serviceId;
      option.textContent = service.name + " (" + service.durationMin + " min)";
      serviceSelect.appendChild(option);
    });
  }

  async function loadSlots() {
    if (!serviceSelect.value || !dateInput.value) {
      return;
    }

    var data = await window.apiClient.get(
      "/appointments/slots?serviceId=" + encodeURIComponent(serviceSelect.value) + "&date=" + encodeURIComponent(dateInput.value)
    );

    slotList.innerHTML = "";
    (data.slots || []).forEach(function (slot) {
      var item = document.createElement("li");
      item.className = "list-group-item";
      item.innerHTML = "<strong>" + slot.startTime + "</strong> <small>" + (slot.available ? "available" : "busy") + "</small>";
      slotList.appendChild(item);
    });
  }

  async function submitBooking(event) {
    event.preventDefault();

    var payload = {
      customer: {
        fullName: document.getElementById("fullName").value.trim(),
        phone: document.getElementById("phone").value.trim()
      },
      serviceId: serviceSelect.value,
      date: dateInput.value,
      startTime: document.getElementById("startTime").value
    };

    try {
      var data = await window.apiClient.post("/appointments/create", payload);
      showToast("success", "Booking confirmed. Ref: " + data.appointmentId);
      await loadSlots();
      form.reset();
      dateInput.value = formatDate(Date.now());
    } catch (error) {
      showToast("error", error.message);
    }
  }

  async function init() {
    dateInput.value = formatDate(Date.now());
    form.addEventListener("submit", submitBooking);
    dateInput.addEventListener("change", loadSlots);
    serviceSelect.addEventListener("change", loadSlots);

    try {
      await loadServices();
      await loadSlots();
    } catch (error) {
      showToast("error", error.message);
    }
  }

  init();
})();
