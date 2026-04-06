function sanitizeForSheet_(value) {
  if (value === null || value === undefined) {
    return "";
  }

  var text = String(value).trim();
  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

  if (/^[=+\-@]/.test(text)) {
    text = "'" + text;
  }

  return text;
}

function normalizeEmail_(email) {
  return sanitizeForSheet_(email).toLowerCase();
}

function normalizeRole_(role) {
  var value = sanitizeForSheet_(role).toUpperCase();
  if (value === "ADMIN" || value.indexOf("ADMIN") === 0) {
    return "ADMIN";
  }
  if (value === "STAFF" || value.indexOf("STAFF") === 0) {
    return "STAFF";
  }
  if (value === "CUSTOMER" || value.indexOf("CUSTOMER") === 0) {
    return "CUSTOMER";
  }
  return "CUSTOMER";
}

function hashPassword_(password) {
  var salt = PropertiesService.getScriptProperties().getProperty("AUTH_SALT") || "enchantress_auth_salt";
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(password) + "::" + salt,
    Utilities.Charset.UTF_8
  );
  return toHex_(digest);
}

function generateSessionToken_(userId, role, email) {
  var payload = {
    uid: userId,
    role: role,
    email: email,
    iat: Date.now(),
    exp: Date.now() + getSessionTtlMs_(),
    nonce: Utilities.getUuid().replace(/-/g, "")
  };

  var payloadJson = JSON.stringify(payload);
  var sig = toHex_(Utilities.computeHmacSha256Signature(payloadJson, getSessionTokenSecret_()));
  return Utilities.base64EncodeWebSafe(payloadJson) + "." + sig;
}

function registerUser_(payload) {
  ensureSchema_();
  requireFields_(payload, ["fullName", "phone", "email", "password"]);

  var fullName = sanitizeForSheet_(payload.fullName);
  var phone = sanitizeForSheet_(payload.phone);
  var email = normalizeEmail_(payload.email);
  var password = String(payload.password || "");

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("Invalid email format");
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  var users = getSheetRows_(SHEETS.USERS);
  var alreadyExists = users.some(function (user) {
    return normalizeEmail_(user.email) === email && String(user.active) !== "false";
  });

  if (alreadyExists) {
    throw new Error("Email already registered");
  }

  var desiredRole = normalizeRole_(payload.role || "CUSTOMER");
  var role = desiredRole;
  if ((desiredRole === "ADMIN" || desiredRole === "STAFF") && !isAuthorizedAdmin_()) {
    role = "CUSTOMER";
  }

  var userId = generateId_("USR");
  var ts = nowIso_();

  appendSheetRow_(SHEETS.USERS, {
    userId: userId,
    fullName: fullName,
    email: email,
    phone: phone,
    passwordHash: hashPassword_(password),
    role: role,
    active: true,
    createdAt: ts,
    updatedAt: ts,
    lastLoginAt: "",
    deletedAt: "",
    department: sanitizeForSheet_(payload.department || "")
  });

  logEvent_("INFO", "AUTH_REGISTER", "User", userId, email, {
    role: role
  });

  return {
    userId: userId,
    fullName: fullName,
    email: email,
    role: role
  };
}

function loginUser_(payload) {
  ensureSchema_();
  requireFields_(payload, ["email", "password"]);

  var email = normalizeEmail_(payload.email);
  var passwordHash = hashPassword_(String(payload.password || ""));

  var users = getSheetRows_(SHEETS.USERS);
  var user = null;

  for (var i = 0; i < users.length; i += 1) {
    var row = users[i];
    if (normalizeEmail_(row.email) === email && String(row.active) !== "false") {
      user = row;
      break;
    }
  }

  if (!user || String(user.passwordHash) !== passwordHash) {
    throw new Error("Invalid email or password");
  }

  var role = normalizeRole_(user.role || "CUSTOMER");
  var autoPromoteReason = "";

  if (role === "CUSTOMER") {
    if (!hasActiveAdminUser_()) {
      role = "ADMIN";
      autoPromoteReason = "initial_admin_bootstrap";
    } else if (isEmailInAdminAllowlist_(email)) {
      role = "ADMIN";
      autoPromoteReason = "admin_allowlist";
    }
  }

  if (autoPromoteReason) {
    updateRowById_(SHEETS.USERS, "userId", user.userId, {
      role: "ADMIN",
      updatedAt: nowIso_()
    });
    user.role = "ADMIN";

    logEvent_("INFO", "AUTH_AUTO_PROMOTE_ADMIN", "User", user.userId, email, {
      reason: autoPromoteReason,
      previousRole: "CUSTOMER",
      newRole: "ADMIN"
    });
  }

  var token = generateSessionToken_(user.userId, role, user.email);
  var ts = nowIso_();

  updateRowById_(SHEETS.USERS, "userId", user.userId, {
    updatedAt: ts,
    lastLoginAt: ts
  });

  logEvent_("INFO", "AUTH_LOGIN", "User", user.userId, email, {
    role: role
  });

  return {
    token: token,
    user: {
      userId: user.userId,
      fullName: user.fullName,
      email: user.email,
      role: role
    }
  };
}

function isEmailInAdminAllowlist_(email) {
  var target = normalizeEmail_(email || "");
  if (!target) {
    return false;
  }

  var raw = PropertiesService.getScriptProperties().getProperty("ADMIN_EMAILS") || "";
  var allowed = raw
    .split(",")
    .map(function (value) {
      return normalizeEmail_(value || "");
    })
    .filter(function (value) {
      return value;
    });

  return allowed.indexOf(target) >= 0;
}

function hasActiveAdminUser_() {
  var users = getSheetRows_(SHEETS.USERS);
  for (var i = 0; i < users.length; i += 1) {
    if (String(users[i].active) !== "false" && normalizeRole_(users[i].role || "") === "ADMIN") {
      return true;
    }
  }
  return false;
}

function claimInitialAdminForSession_(session) {
  ensureSchema_();
  requireRole_(session, ["CUSTOMER"]);

  if (hasActiveAdminUser_()) {
    throw new Error("Initial admin already exists");
  }

  var user = getUserById_(session.userId);
  if (!user) {
    throw new Error("User not found or inactive");
  }

  var ts = nowIso_();
  var email = normalizeEmail_(user.email);

  updateRowById_(SHEETS.USERS, "userId", user.userId, {
    role: "ADMIN",
    updatedAt: ts
  });

  logEvent_("INFO", "AUTH_CLAIM_INITIAL_ADMIN", "User", user.userId, email, {
    fromRole: normalizeRole_(user.role || "CUSTOMER"),
    toRole: "ADMIN"
  });

  return {
    claimed: true,
    token: generateSessionToken_(user.userId, "ADMIN", email),
    user: {
      userId: user.userId,
      fullName: user.fullName,
      email: email,
      role: "ADMIN"
    }
  };
}

function bootstrapAdminUser_(payload) {
  ensureSchema_();
  requireFields_(payload, ["fullName", "phone", "email", "password", "bootstrapToken"]);

  var expectedToken = PropertiesService.getScriptProperties().getProperty("BOOTSTRAP_ADMIN_TOKEN");
  if (!expectedToken) {
    throw new Error("Missing script property: BOOTSTRAP_ADMIN_TOKEN");
  }

  var providedToken = String(payload.bootstrapToken || "");
  if (providedToken !== String(expectedToken)) {
    throw new Error("Invalid bootstrap token");
  }

  var allowWhenAdminExists = String(payload.allowWhenAdminExists || "").toLowerCase() === "true";
  if (hasActiveAdminUser_() && !allowWhenAdminExists) {
    throw new Error("An active admin already exists");
  }

  var fullName = sanitizeForSheet_(payload.fullName);
  var phone = sanitizeForSheet_(payload.phone);
  var email = normalizeEmail_(payload.email);
  var password = String(payload.password || "");
  var department = sanitizeForSheet_(payload.department || "");

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("Invalid email format");
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  var existing = getUserByEmail_(email);
  var ts = nowIso_();

  if (existing) {
    updateRowById_(SHEETS.USERS, "userId", existing.userId, {
      fullName: fullName,
      phone: phone,
      passwordHash: hashPassword_(password),
      role: "ADMIN",
      active: true,
      deletedAt: "",
      department: department,
      updatedAt: ts
    });

    logEvent_("INFO", "ADMIN_BOOTSTRAP", "User", existing.userId, email, {
      action: "promote_or_reset",
      role: "ADMIN"
    });

    return {
      created: false,
      userId: existing.userId,
      fullName: fullName,
      email: email,
      role: "ADMIN"
    };
  }

  var userId = generateId_("USR");
  appendSheetRow_(SHEETS.USERS, {
    userId: userId,
    fullName: fullName,
    email: email,
    phone: phone,
    passwordHash: hashPassword_(password),
    role: "ADMIN",
    active: true,
    createdAt: ts,
    updatedAt: ts,
    lastLoginAt: "",
    deletedAt: "",
    department: department
  });

  logEvent_("INFO", "ADMIN_BOOTSTRAP", "User", userId, email, {
    action: "create",
    role: "ADMIN"
  });

  return {
    created: true,
    userId: userId,
    fullName: fullName,
    email: email,
    role: "ADMIN"
  };
}
