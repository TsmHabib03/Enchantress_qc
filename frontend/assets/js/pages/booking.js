(function () {
  var form = document.getElementById("booking-form");
  var serviceSelect = document.getElementById("serviceId");
  var dateInput = document.getElementById("date");
  var slotList = document.getElementById("slot-list");
  var toast = document.getElementById("toast");
  var categoryButtons = Array.prototype.slice.call(document.querySelectorAll(".service-toggle"));
  var filterNote = document.getElementById("service-filter-note");
  var allServices = [];
  var activeCategory = "softgel";

  var categoryLabels = {
    softgel: "Softgel Nails",
    laser: "Laser Hair Removal",
    skin: "Skin Rejuvenation",
    hair: "Hair Services",
    studio: "Self-Shoot Studio"
  };

  function showToast(type, text) {
    toast.className = "alert mt-3";
    toast.classList.add(type === "error" ? "alert-danger" : "alert-success");
    toast.textContent = text;
  }

  function formatDate(date) {
    return new Date(date).toISOString().slice(0, 10);
  }

  function resolveCategory(service) {
    var raw = String(service.category || service.name || "").toLowerCase();

    if (raw.indexOf("laser") >= 0 || raw.indexOf("hair removal") >= 0) {
      return "laser";
    }
    if (raw.indexOf("skin") >= 0 || raw.indexOf("facial") >= 0 || raw.indexOf("rejuvenation") >= 0) {
      return "skin";
    }
    if (raw.indexOf("hair") >= 0 || raw.indexOf("styling") >= 0 || raw.indexOf("treatment") >= 0) {
      return "hair";
    }
    if (raw.indexOf("studio") >= 0 || raw.indexOf("self-shoot") >= 0 || raw.indexOf("shoot") >= 0) {
      return "studio";
    }
    if (raw.indexOf("nail") >= 0 || raw.indexOf("manicure") >= 0 || raw.indexOf("pedicure") >= 0 || raw.indexOf("softgel") >= 0) {
      return "softgel";
    }

    return "softgel";
  }

  function filteredServices() {
    return allServices.filter(function (service) {
      return service.uiCategory === activeCategory;
    });
  }

  function renderServices() {
    var services = filteredServices();
    serviceSelect.innerHTML = "";

    if (services.length === 0) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "No services in this category";
      serviceSelect.appendChild(empty);
      filterNote.textContent = "No available services under " + categoryLabels[activeCategory] + ".";
      slotList.innerHTML = "";
      return;
    }

    services.forEach(function (service) {
      var option = document.createElement("option");
      option.value = service.serviceId;
      option.textContent = service.name + " (" + service.durationMin + " min)";
      serviceSelect.appendChild(option);
    });

    filterNote.textContent = "Showing " + services.length + " service(s) in " + categoryLabels[activeCategory] + ".";
  }

  function setActiveCategory(category) {
    activeCategory = category;
    categoryButtons.forEach(function (button) {
      var isActive = button.getAttribute("data-category") === category;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function onCategoryToggle(event) {
    var button = event.currentTarget;
    var category = button.getAttribute("data-category");
    setActiveCategory(category);
    renderServices();
    loadSlots();
  }

  async function loadServices() {
    var data = await window.apiClient.get("/services/list");
    var services = data.services || [];
    allServices = services.map(function (service) {
      return Object.assign({}, service, {
        uiCategory: resolveCategory(service)
      });
    });

    renderServices();
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
    categoryButtons.forEach(function (button) {
      button.addEventListener("click", onCategoryToggle);
    });

    try {
      setActiveCategory(activeCategory);
      await loadServices();
      await loadSlots();
    } catch (error) {
      showToast("error", error.message);
    }
  }

  init();
})();
