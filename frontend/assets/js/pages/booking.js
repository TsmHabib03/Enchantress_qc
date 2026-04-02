(function () {
  var form = document.getElementById("booking-form");
  var serviceSelect = document.getElementById("serviceId");
  var dateInput = document.getElementById("date");
  var slotList = document.getElementById("slot-list");
  var toast = document.getElementById("toast");
  var startTimeInput = document.getElementById("startTime");
  var emailInput = document.getElementById("email");
  var submitButton = form.querySelector("button[type='submit']");
  var categoryButtons = Array.prototype.slice.call(document.querySelectorAll(".service-toggle"));
  var filterNote = document.getElementById("service-filter-note");
  var allServices = [];
  var activeCategory = "all";
  var slotsCache = {};
  var slotsDebounceTimer = null;
  var isSubmitting = false;

  var categoryLabels = {
    all: "All Services",
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

  function setSelectedStartTime(timeText) {
    startTimeInput.value = timeText;
    var buttons = Array.prototype.slice.call(slotList.querySelectorAll(".slot-select"));
    buttons.forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-time") === timeText);
    });
  }

  function setSubmitting(isBusy) {
    isSubmitting = isBusy;
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? "Confirming..." : "Confirm Booking";
  }

  function renderSlots(slots) {
    slotList.innerHTML = "";
    var firstAvailable = null;

    slots.forEach(function (slot) {
      var item = document.createElement("li");
      item.className = "list-group-item";
      if (slot.available) {
        if (!firstAvailable) {
          firstAvailable = slot.startTime;
        }
        item.innerHTML =
          "<button type='button' class='btn btn-sm btn-outline-primary slot-select' data-time='" +
          slot.startTime +
          "'>" +
          slot.startTime +
          "</button> <small>available</small>";
      } else {
        item.innerHTML = "<strong>" + slot.startTime + "</strong> <small>busy</small>";
      }
      slotList.appendChild(item);
    });

    if (slots.length === 0) {
      var emptyItem = document.createElement("li");
      emptyItem.className = "list-group-item";
      emptyItem.textContent = "No slots available for the selected date.";
      slotList.appendChild(emptyItem);
    }

    var slotButtons = Array.prototype.slice.call(slotList.querySelectorAll(".slot-select"));
    slotButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        setSelectedStartTime(btn.getAttribute("data-time"));
      });
    });

    if (startTimeInput.value) {
      setSelectedStartTime(startTimeInput.value);
    } else if (firstAvailable) {
      setSelectedStartTime(firstAvailable);
    }
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
    if (activeCategory === "all") {
      return allServices.slice();
    }

    return allServices.filter(function (service) {
      return service.uiCategory === activeCategory;
    });
  }

  function renderServices() {
    var services = filteredServices();
    serviceSelect.innerHTML = "";

    if (services.length === 0 && activeCategory !== "all") {
      setActiveCategory("all");
      services = filteredServices();
    }

    if (services.length === 0) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "No services in this category";
      serviceSelect.appendChild(empty);
      filterNote.textContent = "No services are configured yet. Please add services first.";
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
      slotList.innerHTML = "";
      return;
    }

    var cacheKey = serviceSelect.value + "|" + dateInput.value;
    if (slotsCache[cacheKey]) {
      renderSlots(slotsCache[cacheKey]);
      return;
    }

    var data = await window.apiClient.get(
      "/appointments/slots?serviceId=" + encodeURIComponent(serviceSelect.value) + "&date=" + encodeURIComponent(dateInput.value),
      { retries: 0 }
    );

    slotsCache[cacheKey] = data.slots || [];
    renderSlots(slotsCache[cacheKey]);
  }

  function loadSlotsDebounced() {
    if (slotsDebounceTimer) {
      clearTimeout(slotsDebounceTimer);
    }
    slotsDebounceTimer = setTimeout(function () {
      loadSlots().catch(function (error) {
        showToast("error", error.message);
      });
    }, 180);
  }

  async function submitBooking(event) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      showToast("error", "Please complete all required fields before booking.");
      return;
    }

    if (!serviceSelect.value) {
      showToast("error", "Please select a valid service before booking.");
      return;
    }

    var payload = {
      customer: {
        fullName: document.getElementById("fullName").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        email: emailInput.value.trim()
      },
      serviceId: serviceSelect.value,
      date: dateInput.value,
      startTime: startTimeInput.value
    };

    try {
      setSubmitting(true);
      var data = await window.apiClient.post("/appointments/create", payload, { retries: 0 });
      showToast("success", "Booking confirmed. Ref: " + data.appointmentId);
      slotsCache = {};
      await loadSlots();
      form.reset();
      dateInput.value = formatDate(Date.now());
      startTimeInput.value = "";
      setSubmitting(false);
    } catch (error) {
      setSubmitting(false);
      showToast("error", error.message);
    }
  }

  async function init() {
    dateInput.value = formatDate(Date.now());
    form.addEventListener("submit", submitBooking);
    dateInput.addEventListener("change", function () {
      slotsCache = {};
      loadSlotsDebounced();
    });
    serviceSelect.addEventListener("change", function () {
      loadSlotsDebounced();
    });
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
