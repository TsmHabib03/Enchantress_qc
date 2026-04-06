(function () {
  var modal = document.getElementById("auth-modal");
  var openButton = document.getElementById("open-auth-modal");
  var logoutButton = document.getElementById("logout-button");
  var closeButton = document.getElementById("auth-close");
  var loginForm = document.getElementById("login-form");
  var registerForm = document.getElementById("register-form");
  var loginSubmitButton = document.getElementById("login-submit-button");
  var loginLoader = document.getElementById("auth-login-loader");
  var tabButtons = Array.prototype.slice.call(document.querySelectorAll(".auth-tab"));
  var authToast = document.getElementById("auth-toast");
  var authStatus = document.getElementById("auth-status");
  var sessionCache = null;
  var isLoginSubmitting = false;
  var SESSION_KEY = "enchantressSession";

  function getCurrentPageName() {
    var path = String(window.location.pathname || "");
    var segments = path.split("/");
    var last = segments[segments.length - 1] || "index.html";
    return last.toLowerCase();
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

  function getRoleLandingPage(role) {
    var normalized = normalizeRole(role);
    if (normalized === "ADMIN") {
      return "/admin";
    }
    if (normalized === "STAFF") {
      return "/staff";
    }
    return "";
  }

  function applyRoleRedirect(session) {
    if (!session || !session.user) {
      return;
    }

    var targetPage = getRoleLandingPage(session.user.role);
    if (!targetPage) {
      return;
    }

    var currentPage = getCurrentPageName();
    if (currentPage !== "index.html") {
      return;
    }

    window.location.replace(targetPage);
  }

  function setLoginLoading(isLoading) {
    isLoginSubmitting = !!isLoading;

    if (loginSubmitButton) {
      if (!loginSubmitButton.getAttribute("data-default-text")) {
        loginSubmitButton.setAttribute("data-default-text", loginSubmitButton.textContent || "Login");
      }

      loginSubmitButton.disabled = isLoginSubmitting;
      loginSubmitButton.classList.toggle("is-loading", isLoginSubmitting);
      loginSubmitButton.textContent = isLoginSubmitting
        ? "Signing in..."
        : loginSubmitButton.getAttribute("data-default-text") || "Login";
    }

    if (loginLoader) {
      loginLoader.classList.toggle("d-none", !isLoginSubmitting);
    }

    if (closeButton) {
      closeButton.disabled = isLoginSubmitting;
    }
  }

  function showToast(type, message) {
    if (!authToast) {
      return;
    }
    authToast.className = "alert mt-3";
    authToast.classList.add(type === "error" ? "alert-danger" : "alert-success");
    authToast.textContent = message;
  }

  function parseStoredSession() {
    try {
      var raw = window.localStorage.getItem(SESSION_KEY);
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

  function dispatchSessionChange() {
    var event;

    try {
      event = new CustomEvent("enchantress:session-changed", {
        detail: {
          session: sessionCache,
          user: sessionCache ? sessionCache.user : null
        }
      });
    } catch (error) {
      event = document.createEvent("CustomEvent");
      event.initCustomEvent("enchantress:session-changed", false, false, {
        session: sessionCache,
        user: sessionCache ? sessionCache.user : null
      });
    }

    window.dispatchEvent(event);
  }

  function syncAuthStatusLabel() {
    if (!authStatus) {
      return;
    }
    if (!sessionCache || !sessionCache.user) {
      authStatus.classList.add("d-none");
      authStatus.textContent = "";
      return;
    }
    authStatus.classList.remove("d-none");
    authStatus.textContent = "Logged in as " + sessionCache.user.fullName + " (" + sessionCache.user.role + ")";
  }

  function syncAuthButtons() {
    var isLoggedIn = !!(sessionCache && sessionCache.user);

    if (openButton) {
      openButton.classList.toggle("d-none", isLoggedIn);
    }
    if (logoutButton) {
      logoutButton.classList.toggle("d-none", !isLoggedIn);
    }
  }

  function openModal() {
    if (!modal) {
      return;
    }
    modal.classList.remove("d-none");
    document.body.style.overflow = "hidden";
    if (authToast) {
      authToast.className = "alert mt-3 d-none";
      authToast.textContent = "";
    }
  }

  function closeModal() {
    if (!modal) {
      return;
    }
    if (isLoginSubmitting) {
      return;
    }
    modal.classList.add("d-none");
    document.body.style.overflow = "auto";
  }

  function activateTab(tabName) {
    tabButtons.forEach(function (button) {
      var active = button.getAttribute("data-auth-tab") === tabName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (loginForm) {
      loginForm.classList.toggle("d-none", tabName !== "login");
    }
    if (registerForm) {
      registerForm.classList.toggle("d-none", tabName !== "register");
    }
  }

  function persistSession(data) {
    var session = {
      token: data.token,
      user: data.user,
      issuedAt: Date.now()
    };

    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    sessionCache = session;
    syncAuthStatusLabel();
    syncAuthButtons();
    dispatchSessionChange();
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (isLoginSubmitting) {
      return;
    }

    if (!loginForm.checkValidity()) {
      loginForm.reportValidity();
      return;
    }

    var payload = {
      email: loginForm.email.value.trim(),
      password: loginForm.password.value
    };

    setLoginLoading(true);

    try {
      var data = await window.apiClient.post("/auth/login", payload, { retries: 0 });
      persistSession(data);

      var session = window.authSession && typeof window.authSession.getSession === "function"
        ? window.authSession.getSession()
        : parseStoredSession();
      var role = String(
        (session && session.user && session.user.role) ||
          (data && data.user && data.user.role) ||
          ""
      );
      role = normalizeRole(role);
      var redirectTarget = getRoleLandingPage(role);

      if (redirectTarget && getCurrentPageName() === "index.html") {
        window.location.replace(redirectTarget);
        return;
      }

      if (role === "CUSTOMER") {
        try {
          var claim = await window.apiClient.post("/auth/claim-initial-admin", {}, { retries: 0 });
          if (claim && claim.claimed && claim.token && claim.user) {
            persistSession(claim);
            window.location.replace("/admin");
            return;
          }
        } catch (claimError) {
          // Ignore when initial admin was already claimed.
        }
      }

      showToast("success", "Login successful.");
      setTimeout(closeModal, 450);
    } catch (error) {
      showToast("error", error.userMessage || error.message || "Login failed.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();

    if (!registerForm.checkValidity()) {
      registerForm.reportValidity();
      return;
    }

    var payload = {
      fullName: registerForm.fullName.value.trim(),
      phone: registerForm.phone.value.trim(),
      email: registerForm.email.value.trim(),
      password: registerForm.password.value,
      role: "CUSTOMER"
    };

    try {
      await window.apiClient.post("/auth/register", payload, { retries: 0 });
      showToast("success", "Registration successful. Please login.");
      registerForm.reset();
      activateTab("login");
    } catch (error) {
      showToast("error", error.message);
    }
  }

  function restoreSession() {
    sessionCache = parseStoredSession();
    syncAuthStatusLabel();
    syncAuthButtons();
    dispatchSessionChange();
    applyRoleRedirect(sessionCache);
  }

  window.authSession = {
    getSession: function () {
      if (!sessionCache) {
        sessionCache = parseStoredSession();
      }
      return sessionCache;
    },
    getUser: function () {
      var session = this.getSession();
      return session ? session.user : null;
    },
    getRole: function () {
      var user = this.getUser();
      return user ? normalizeRole(user.role) : "GUEST";
    },
    isAuthenticated: function () {
      return !!this.getSession();
    },
    openModal: openModal,
    closeModal: closeModal,
    clearSession: function () {
      sessionCache = null;
      window.localStorage.removeItem(SESSION_KEY);
      syncAuthStatusLabel();
      syncAuthButtons();
      closeModal();
      dispatchSessionChange();
    }
  };

  if (openButton) {
    openButton.addEventListener("click", openModal);
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", function () {
      window.authSession.clearSession();
    });
  }

  window.addEventListener("enchantress:session-changed", function (event) {
    var detail = event && event.detail ? event.detail : null;
    var session = detail ? detail.session : null;
    applyRoleRedirect(session);
  });

  if (closeButton) {
    closeButton.addEventListener("click", closeModal);
  }

  if (modal) {
    modal.addEventListener("click", function (event) {
      if (isLoginSubmitting) {
        return;
      }
      if (event.target && event.target.classList.contains("auth-modal-backdrop")) {
        closeModal();
      }
    });
  }

  tabButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      if (isLoginSubmitting) {
        return;
      }
      activateTab(button.getAttribute("data-auth-tab"));
    });
  });

  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  if (registerForm) {
    registerForm.addEventListener("submit", handleRegister);
  }

  activateTab("login");
  restoreSession();
})();
