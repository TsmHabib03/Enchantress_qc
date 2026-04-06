(function () {
  var form = document.getElementById("booking-form");
  if (!form) {
    return;
  }

  var serviceSelect = document.getElementById("serviceId");
  var dateInput = document.getElementById("date");
  var slotList = document.getElementById("slot-list");
  var toast = document.getElementById("toast");
  var startTimeInput = document.getElementById("startTime");
  var emailInput = document.getElementById("email");
  var submitButton = form.querySelector("button[type='submit']");
  var fullNameInput = document.getElementById("fullName");
  var phoneInput = document.getElementById("phone");
  var categoryButtons = Array.prototype.slice.call(document.querySelectorAll(".service-toggle"));
  var filterNote = document.getElementById("service-filter-note");
  var slotSummary = document.getElementById("slot-summary");
  var slotExpandBtn = document.getElementById("slot-expand-btn");
  var slotBusyToggle = document.getElementById("slot-busy-toggle");
  var confirmationModal = document.getElementById("confirmation-modal");
  var confirmationRef = document.getElementById("confirmation-ref");
  var honeypotInput = document.getElementById("company");
  var challengeTokenInput = document.getElementById("challengeToken");
  var protectionStatus = document.getElementById("booking-protection-status");
  var bookingAuthGuestPanel = document.getElementById("booking-auth-guest-panel");
  var bookingAuthContent = document.getElementById("booking-auth-content");
  var slotsAuthGuestPanel = document.getElementById("slots-auth-guest-panel");
  var slotsAuthContent = document.getElementById("slots-auth-content");
  var openAuthFromBookingButton = document.getElementById("open-auth-from-booking");
  var roleCenterNote = document.getElementById("role-center-note");
  var rolePanels = Array.prototype.slice.call(document.querySelectorAll("[data-role-panel]"));
  var allServices = [];
  var activeCategory = "all";
  var slotsCache = {};
  var slotsDebounceTimer = null;
  var isSubmitting = false;
  var showAllSlots = false;
  var includeBusySlots = false;
  var lastRenderedSlots = [];
  var submitCooldownUntil = 0;
  var submitGateArmedAt = Date.now();
  var pendingSubmitAfterAuth = false;
  var recentFingerprints = {};

  var BOOKING_AUTH_REQUIRED = !(window.APP_CONFIG && window.APP_CONFIG.BOOKING_AUTH_REQUIRED === false);
  var BOOKING_VIEW_REQUIRES_AUTH = !(window.APP_CONFIG && window.APP_CONFIG.BOOKING_VIEW_REQUIRES_AUTH === false);
  var MIN_INTERACTION_MS = Number(window.APP_CONFIG && window.APP_CONFIG.BOOKING_MIN_INTERACTION_MS) || 3500;
  var SUBMIT_COOLDOWN_MS = Number(window.APP_CONFIG && window.APP_CONFIG.BOOKING_SUBMIT_COOLDOWN_MS) || 12000;
  var DUPLICATE_WINDOW_MS = Number(window.APP_CONFIG && window.APP_CONFIG.BOOKING_DUPLICATE_WINDOW_MS) || 60000;
  var CHALLENGE_ENABLED = !!(window.APP_CONFIG && window.APP_CONFIG.CHALLENGE_ENABLED);
  var CHALLENGE_HEADER_NAME = (window.APP_CONFIG && window.APP_CONFIG.CHALLENGE_HEADER_NAME) || "X-Turnstile-Token";

  var categoryLabels = {
    all: "All Services",
    softgel: "Softgel Nails",
    laser: "Laser Hair Removal",
    skin: "Skin Rejuvenation",
    hair: "Hair Services",
    studio: "Self-Shoot Studio"
  };

  function showToast(type, text) {
    if (!toast) {
      return;
    }
    toast.className = "alert mt-3";
    toast.classList.add(type === "error" ? "alert-danger" : "alert-success");
    toast.textContent = text;
  }

  function getFallbackSession() {
    try {
      var raw = window.localStorage.getItem("enchantressSession");
      if (!raw) {
        return null;
      }
      var session = JSON.parse(raw);
      if (!session || !session.user || !session.token) {
        return null;
      }
      return session;
    } catch (error) {
      return null;
    }
  }

  function getSession() {
    if (window.authSession && typeof window.authSession.getSession === "function") {
      return window.authSession.getSession();
    }
    return getFallbackSession();
  }

  function getUser() {
    var session = getSession();
    return session && session.user ? session.user : null;
  }

  function normalizeRole(role) {
    var normalized = String(role || "").trim().toUpperCase();
    if (!normalized) {
      return "GUEST";
    }
    if (normalized === "ADMIN" || normalized.indexOf("ADMIN") === 0) {
      return "ADMIN";
    }
    if (normalized === "STAFF" || normalized.indexOf("STAFF") === 0) {
      return "STAFF";
    }
    if (normalized === "CUSTOMER" || normalized.indexOf("CUSTOMER") === 0) {
      return "CUSTOMER";
    }
    return normalized;
  }

  function getRole() {
    var user = getUser();
    return user ? normalizeRole(user.role) : "GUEST";
  }

  function isAuthenticated() {
    return !!getSession();
  }

  function roleLandingTarget(role) {
    var normalized = normalizeRole(role);
    if (normalized === "ADMIN") {
      return "admin.html";
    }
    if (normalized === "STAFF") {
      return "staff.html";
    }
    return "";
  }

  function isLandingPagePath() {
    var path = String(window.location.pathname || "").toLowerCase();
    return !path || path === "/" || path === "/index.html";
  }

  function redirectPrivilegedRoleIfNeeded() {
    if (!isLandingPagePath()) {
      return false;
    }

    var target = roleLandingTarget(getRole());
    if (!target) {
      return false;
    }

    window.location.replace(target);
    return true;
  }

  function openAuthModal() {
    if (window.authSession && typeof window.authSession.openModal === "function") {
      window.authSession.openModal();
      return;
    }

    var openButton = document.getElementById("open-auth-modal");
    if (openButton) {
      openButton.click();
    }
  }

  function syncRolePanels() {
    var role = getRole();

    rolePanels.forEach(function (panel) {
      var targetRole = panel.getAttribute("data-role-panel");
      panel.classList.toggle("d-none", targetRole !== role);
    });

    if (!roleCenterNote) {
      return;
    }

    if (role === "GUEST") {
      roleCenterNote.textContent = "Sign in to unlock your role panel. Staff and admin actions are visible now and will be connected in the backend phase.";
    } else if (role === "CUSTOMER") {
      roleCenterNote.textContent = "Customer session active. You can now confirm your appointment submission.";
    } else if (role === "STAFF") {
      roleCenterNote.textContent = "Staff session active. Staff workflow cards are visible now and backend actions will follow in phase 2.";
    } else if (role === "ADMIN") {
      roleCenterNote.textContent = "Admin session active. Operational authority cards are visible now and backend controls will follow in phase 2.";
    }
  }

  function prefillProfileFromSession() {
    var user = getUser();
    if (!user) {
      return;
    }

    if (fullNameInput && !fullNameInput.value.trim()) {
      fullNameInput.value = user.fullName || "";
    }
    if (phoneInput && !phoneInput.value.trim()) {
      phoneInput.value = user.phone || "";
    }
    if (emailInput && !emailInput.value.trim()) {
      emailInput.value = user.email || "";
    }
  }

  function cooldownRemainingMs() {
    return Math.max(0, submitCooldownUntil - Date.now());
  }

  function clearExpiredFingerprints() {
    var now = Date.now();
    Object.keys(recentFingerprints).forEach(function (key) {
      if (now - recentFingerprints[key] > DUPLICATE_WINDOW_MS) {
        delete recentFingerprints[key];
      }
    });
  }

  function buildPayloadFingerprint(payload) {
    return [
      payload.customer.fullName,
      payload.customer.phone,
      payload.customer.email,
      payload.serviceId,
      payload.date,
      payload.startTime
    ]
      .join("|")
      .toLowerCase();
  }

  function challengeTokenValue() {
    if (challengeTokenInput && challengeTokenInput.value.trim()) {
      return challengeTokenInput.value.trim();
    }
    if (window.__ENCHANTRESS_TURNSTILE_TOKEN) {
      return String(window.__ENCHANTRESS_TURNSTILE_TOKEN).trim();
    }
    return "";
  }

  function updateProtectionStatus() {
    if (!protectionStatus) {
      return;
    }

    var role = getRole();
    var cooldown = cooldownRemainingMs();

    if (cooldown > 0) {
      protectionStatus.textContent = "Submit cooldown active. Please wait " + Math.ceil(cooldown / 1000) + " second(s).";
      return;
    }

    if (BOOKING_VIEW_REQUIRES_AUTH && role === "GUEST") {
      protectionStatus.textContent = "Login required to view Appointment Details and slots.";
      return;
    }

    if (BOOKING_AUTH_REQUIRED && role === "GUEST") {
      protectionStatus.textContent = "Security policy active: login is required before confirming booking.";
      return;
    }

    protectionStatus.textContent = "Security policy is active: account gate, cooldown, duplicate guard, and anti-bot checks.";
  }

  function showConfirmationModal(appointmentId) {
    if (!confirmationModal || !confirmationRef) {
      return;
    }
    confirmationRef.textContent = appointmentId;
    confirmationModal.classList.remove("d-none");
    document.body.style.overflow = "hidden";
  }

  function updateBookingVisibility() {
    var lockedForGuest = BOOKING_VIEW_REQUIRES_AUTH && !isAuthenticated();

    if (bookingAuthGuestPanel) {
      bookingAuthGuestPanel.classList.toggle("d-none", !lockedForGuest);
    }
    if (bookingAuthContent) {
      bookingAuthContent.classList.toggle("d-none", lockedForGuest);
    }
    if (slotsAuthGuestPanel) {
      slotsAuthGuestPanel.classList.toggle("d-none", !lockedForGuest);
    }
    if (slotsAuthContent) {
      slotsAuthContent.classList.toggle("d-none", lockedForGuest);
    }

    if (!lockedForGuest) {
      return;
    }

    if (slotList) {
      slotList.innerHTML = "";
    }
    if (slotSummary) {
      slotSummary.textContent = "Login required to view available slots.";
    }
    if (slotExpandBtn) {
      slotExpandBtn.classList.add("d-none");
    }
    if (slotBusyToggle) {
      slotBusyToggle.classList.add("d-none");
    }
  }

  function closeConfirmationModal() {
    if (!confirmationModal) {
      return;
    }
    confirmationModal.classList.add("d-none");
    document.body.style.overflow = "auto";
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

    if (isBusy) {
      submitButton.textContent = "Confirming...";
      return;
    }

    var cooldown = cooldownRemainingMs();
    if (cooldown > 0) {
      submitButton.textContent = "Wait " + Math.ceil(cooldown / 1000) + "s";
      submitButton.disabled = true;
      return;
    }

    if ((BOOKING_VIEW_REQUIRES_AUTH || BOOKING_AUTH_REQUIRED) && !isAuthenticated()) {
      submitButton.textContent = "Login to Confirm Booking";
      submitButton.disabled = false;
      return;
    }

    submitButton.textContent = "Confirm Booking";
  }

  function setSubmitCooldown() {
    submitCooldownUntil = Date.now() + SUBMIT_COOLDOWN_MS;
    updateProtectionStatus();
  }

  function updateSlotToolbar(total, availableCount, busyCount, displayedCount) {
    if (!slotSummary || !slotExpandBtn || !slotBusyToggle) {
      return;
    }

    if (!total) {
      slotSummary.textContent = "No slots found for this date.";
      slotExpandBtn.classList.add("d-none");
      slotBusyToggle.classList.add("d-none");
      return;
    }

    slotSummary.textContent =
      availableCount +
      " available" +
      (busyCount ? " | " + busyCount + " busy" : "") +
      " | showing " +
      displayedCount +
      "/" +
      (includeBusySlots ? total : availableCount);

    var canExpand = displayedCount < (includeBusySlots ? total : availableCount);
    var showExpandControl = showAllSlots || canExpand;
    slotExpandBtn.classList.toggle("d-none", !showExpandControl);
    slotExpandBtn.textContent = showAllSlots ? "Show less" : "Show more";
    slotBusyToggle.classList.remove("d-none");
    slotBusyToggle.textContent = includeBusySlots ? "Hide busy" : "Include busy";
  }

  function renderSlots(slots) {
    lastRenderedSlots = slots.slice();
    slotList.innerHTML = "";
    var firstAvailable = null;
    var availableSlots = slots.filter(function (slot) {
      return slot.available;
    });
    var busySlots = slots.filter(function (slot) {
      return !slot.available;
    });

    var slotsToShow = includeBusySlots ? slots.slice() : availableSlots.slice();
    var visibleSlots = showAllSlots ? slotsToShow : slotsToShow.slice(0, 8);

    visibleSlots.forEach(function (slot) {
      var item = document.createElement("li");
      item.className = "slot-item";
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
        item.innerHTML = "<span class='slot-pill slot-pill-busy'>" + slot.startTime + "</span>";
      }
      slotList.appendChild(item);
    });

    if (slotsToShow.length === 0) {
      var emptyItem = document.createElement("li");
      emptyItem.className = "slot-empty";
      emptyItem.textContent = "No open slots for this date. Try another day or include busy slots.";
      slotList.appendChild(emptyItem);
    }

    updateSlotToolbar(slots.length, availableSlots.length, busySlots.length, visibleSlots.length);

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

  function formatDate(date) {
    return formatDateForTimezone(new Date(date), window.APP_CONFIG && window.APP_CONFIG.TIMEZONE);
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
    if (BOOKING_VIEW_REQUIRES_AUTH && !isAuthenticated()) {
      if (slotSummary) {
        slotSummary.textContent = "Login required to view available slots.";
      }
      if (slotList) {
        slotList.innerHTML = "";
      }
      if (slotExpandBtn) {
        slotExpandBtn.classList.add("d-none");
      }
      if (slotBusyToggle) {
        slotBusyToggle.classList.add("d-none");
      }
      return;
    }

    if (!serviceSelect.value || !dateInput.value) {
      slotList.innerHTML = "";
      if (slotSummary) {
        slotSummary.textContent = "Select a service and date to see open times.";
      }
      if (slotExpandBtn) {
        slotExpandBtn.classList.add("d-none");
      }
      if (slotBusyToggle) {
        slotBusyToggle.classList.add("d-none");
      }
      return;
    }

    showAllSlots = false;

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

  function bookingPayload() {
    return {
      customer: {
        fullName: fullNameInput.value.trim(),
        phone: phoneInput.value.trim(),
        email: emailInput.value.trim()
      },
      serviceId: serviceSelect.value,
      date: dateInput.value,
      startTime: startTimeInput.value
    };
  }

  function consumeAdminRedirectNotice() {
    try {
      var reason = window.sessionStorage.getItem("enchantressAdminRedirectReason");
      if (!reason) {
        return;
      }

      window.sessionStorage.removeItem("enchantressAdminRedirectReason");

      if (reason === "auth_required") {
        showToast("error", "Please login before opening the admin dashboard.");
      } else if (reason === "role_forbidden") {
        showToast("error", "Only staff or admin accounts can access the admin dashboard.");
      }
    } catch (error) {
      // Ignore storage access issues.
    }
  }

  function runSubmitGuards(payload) {
    if (honeypotInput && honeypotInput.value.trim()) {
      throw new Error("Validation failed. Please refresh and try again.");
    }

    if ((BOOKING_VIEW_REQUIRES_AUTH || BOOKING_AUTH_REQUIRED) && !isAuthenticated()) {
      pendingSubmitAfterAuth = true;
      openAuthModal();
      throw new Error("Please login or register to unlock Appointment Details and book.");
    }

    var cooldown = cooldownRemainingMs();
    if (cooldown > 0) {
      throw new Error("Please wait " + Math.ceil(cooldown / 1000) + " second(s) before submitting again.");
    }

    var dwell = Date.now() - submitGateArmedAt;
    if (dwell < MIN_INTERACTION_MS) {
      var secondsLeft = Math.ceil((MIN_INTERACTION_MS - dwell) / 1000);
      throw new Error("Please review your booking details for " + secondsLeft + " more second(s) before submitting.");
    }

    clearExpiredFingerprints();

    var fingerprint = buildPayloadFingerprint(payload);
    var lastSeen = recentFingerprints[fingerprint] || 0;
    if (Date.now() - lastSeen < DUPLICATE_WINDOW_MS) {
      throw new Error("Duplicate booking detected. Please wait before sending the same request again.");
    }

    return fingerprint;
  }

  function challengeHeaders() {
    var token = challengeTokenValue();

    if (CHALLENGE_ENABLED && !token) {
      throw new Error("Security challenge is required before booking. Please complete the verification step.");
    }

    if (!token) {
      return null;
    }

    var headers = {};
    headers[CHALLENGE_HEADER_NAME] = token;
    return headers;
  }

  async function submitBookingInternal() {
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

    var payload = bookingPayload();

    try {
      var fingerprint = runSubmitGuards(payload);

      var requestHeaders = challengeHeaders();
      recentFingerprints[fingerprint] = Date.now();
      setSubmitting(true);
      setSubmitCooldown();

      var options = { retries: 0 };
      if (requestHeaders) {
        options.headers = requestHeaders;
      }

      var data = await window.apiClient.post("/appointments/create", payload, options);
      showConfirmationModal(data.appointmentId);
      slotsCache = {};
      await loadSlots();
      form.reset();
      prefillProfileFromSession();
      dateInput.value = formatDate(Date.now());
      startTimeInput.value = "";
      submitGateArmedAt = Date.now();
      showToast("success", "Booking confirmed successfully.");
    } catch (error) {
      showToast("error", error.userMessage || error.message || "Booking failed.");
    } finally {
      setSubmitting(false);
      updateProtectionStatus();
    }
  }

  async function submitBooking(event) {
    event.preventDefault();
    await submitBookingInternal();
  }

  function handleSessionChange() {
    if (redirectPrivilegedRoleIfNeeded()) {
      return;
    }

    syncRolePanels();
    updateBookingVisibility();
    prefillProfileFromSession();
    setSubmitting(false);
    updateProtectionStatus();

    if (pendingSubmitAfterAuth && isAuthenticated()) {
      pendingSubmitAfterAuth = false;
      submitBookingInternal();
      return;
    }

    if (isAuthenticated()) {
      loadSlots().catch(function (error) {
        showToast("error", error.message);
      });
    }
  }

  async function init() {
    if (redirectPrivilegedRoleIfNeeded()) {
      return;
    }

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
    if (slotExpandBtn) {
      slotExpandBtn.addEventListener("click", function () {
        showAllSlots = !showAllSlots;
        renderSlots(lastRenderedSlots);
      });
    }
    if (slotBusyToggle) {
      slotBusyToggle.addEventListener("click", function () {
        includeBusySlots = !includeBusySlots;
        showAllSlots = false;
        renderSlots(lastRenderedSlots);
      });
    }

    var confirmationCloseBtn = document.querySelector(".confirmation-close-btn");
    if (confirmationCloseBtn) {
      confirmationCloseBtn.addEventListener("click", closeConfirmationModal);
    }
    if (openAuthFromBookingButton) {
      openAuthFromBookingButton.addEventListener("click", openAuthModal);
    }

    window.addEventListener("enchantress:session-changed", handleSessionChange);
    window.setInterval(function () {
      if (!isSubmitting) {
        setSubmitting(false);
      }
      updateProtectionStatus();
    }, 500);

    consumeAdminRedirectNotice();
    syncRolePanels();
    updateBookingVisibility();
    prefillProfileFromSession();
    setSubmitting(false);
    updateProtectionStatus();

    if (BOOKING_VIEW_REQUIRES_AUTH && !isAuthenticated() && window.location.hash === "#booking-panel") {
      openAuthModal();
    }

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
