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
    return path;
  }

  var session = parseSession();
  if (!session || !session.user) {
    return;
  }

  var role = String(session.user.role || "").trim().toUpperCase();
  var path = normalizePath(window.location.pathname);
  var isIndex = path === "/index.html";
  var isAdmin = path === "/admin" || path === "/admin.html";
  var isStaff = path === "/staff" || path === "/staff.html";

  if (isIndex && role === "ADMIN") {
    window.location.replace("/admin");
    return;
  }

  if (isIndex && role === "STAFF") {
    window.location.replace("/staff");
    return;
  }

  if (isAdmin && role === "STAFF") {
    window.location.replace("/staff");
    return;
  }

  if (isStaff && role === "ADMIN") {
    window.location.replace("/admin");
  }
})();
