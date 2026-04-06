(function () {
  function parseSession() {
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

  function normalizePath(pathname) {
    var path = String(pathname || "").toLowerCase();
    if (!path || path === "/") {
      return "/index.html";
    }
    if (path.length > 1 && path.charAt(path.length - 1) === "/") {
      path = path.slice(0, -1);
    }
    return path;
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

  var session = parseSession();
  if (!session || !session.user) {
    return;
  }

  var role = normalizeRole(session.user.role);
  var path = normalizePath(window.location.pathname);
  var isIndex = path === "/index.html";
  var isAdmin = path === "/admin" || path === "/admin.html";
  var isStaff = path === "/staff" || path === "/staff.html";

  if (isIndex && role === "ADMIN") {
    window.location.replace("admin.html");
    return;
  }

  if (isIndex && role === "STAFF") {
    window.location.replace("staff.html");
    return;
  }

  if (isAdmin && role === "STAFF") {
    window.location.replace("staff.html");
    return;
  }

  if (isStaff && role === "ADMIN") {
    window.location.replace("admin.html");
  }
})();
