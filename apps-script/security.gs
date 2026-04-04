function parseGatewayEnvelope_(e) {
  var bodyText = "";
  if (e && e.postData && e.postData.contents) {
    bodyText = e.postData.contents;
  } else if (e && e.parameter && e.parameter.payload) {
    bodyText = e.parameter.payload;
  }

  if (!bodyText) {
    throw new Error("Missing gateway envelope payload");
  }

  var envelope = JSON.parse(bodyText);
  return envelope;
}

function verifyGatewayEnvelope_(envelope) {
  if (!envelope || !envelope.signature || !envelope.timestamp || !envelope.nonce) {
    throw new Error("Missing envelope security fields");
  }

  var now = Date.now();
  var ts = Number(envelope.timestamp);
  if (!isFinite(ts)) {
    throw new Error("Invalid timestamp");
  }

  var maxSkewMs = 5 * 60 * 1000;
  if (Math.abs(now - ts) > maxSkewMs) {
    throw new Error("Expired request timestamp");
  }

  var secret = getRequiredProperty_("SHARED_SECRET");
  var payloadText = JSON.stringify(envelope.payload || {});
  var base = String(envelope.timestamp) + "." + envelope.nonce + "." + payloadText;
  var expected = toHex_(Utilities.computeHmacSha256Signature(base, secret));

  if (expected !== envelope.signature) {
    throw new Error("Invalid signature");
  }

  var p = envelope.payload || {};
  envelope.method = p.method;
  envelope.path = p.path;
  envelope.query = p.query;
  envelope.body = p.body;
  envelope.headers = p.headers || {};
}

function getSessionTokenSecret_() {
  return PropertiesService.getScriptProperties().getProperty("AUTH_TOKEN_SECRET") || getRequiredProperty_("SHARED_SECRET");
}

function getSessionTtlMs_() {
  var minutes = Number(PropertiesService.getScriptProperties().getProperty("SESSION_TTL_MINUTES") || "720");
  if (!isFinite(minutes) || minutes <= 0) {
    minutes = 720;
  }
  return minutes * 60 * 1000;
}

function getAuthorizationHeader_(envelope) {
  var headers = envelope && envelope.headers ? envelope.headers : {};
  return String(headers.Authorization || headers.authorization || "").trim();
}

function parseAndVerifySessionToken_(token) {
  var parts = String(token || "").split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid session token format");
  }

  var payloadJson = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  var providedSig = String(parts[1] || "");
  var expectedSig = toHex_(Utilities.computeHmacSha256Signature(payloadJson, getSessionTokenSecret_()));

  if (providedSig !== expectedSig) {
    throw new Error("Invalid session token signature");
  }

  var payload = JSON.parse(payloadJson);
  if (!payload || !payload.uid || !payload.email || !payload.role || !payload.iat || !payload.exp) {
    throw new Error("Invalid session token payload");
  }

  var now = Date.now();
  if (Number(payload.exp) < now) {
    throw new Error("Session expired");
  }

  if (now - Number(payload.iat) > getSessionTtlMs_()) {
    throw new Error("Session stale");
  }

  return payload;
}

function getCurrentSession_(envelope) {
  var authorization = getAuthorizationHeader_(envelope);
  if (!authorization || !/^Bearer\s+/i.test(authorization)) {
    return null;
  }

  var token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return null;
  }

  var payload = parseAndVerifySessionToken_(token);
  var users = getSheetRows_(SHEETS.USERS);
  var user = null;

  for (var i = 0; i < users.length; i += 1) {
    var row = users[i];
    if (String(row.userId) === String(payload.uid) && String(row.active) !== "false") {
      user = row;
      break;
    }
  }

  if (!user) {
    throw new Error("User not found or inactive");
  }

  var email = normalizeEmail_(user.email);
  if (email !== normalizeEmail_(payload.email)) {
    throw new Error("Session user mismatch");
  }

  return {
    userId: user.userId,
    email: email,
    role: normalizeRole_(user.role || payload.role),
    fullName: user.fullName || ""
  };
}

function requireAuthenticatedSession_(envelope) {
  var session = getCurrentSession_(envelope);
  if (!session) {
    throw new Error("Authentication required");
  }
  return session;
}

function requireRole_(session, allowedRoles) {
  if (!session) {
    throw new Error("Authentication required");
  }
  var role = normalizeRole_(session && session.role);
  if (allowedRoles.indexOf(role) < 0) {
    throw new Error("Insufficient permissions");
  }
}

function isAuthorizedAdmin_() {
  var email = Session.getActiveUser().getEmail() || "";
  var raw = PropertiesService.getScriptProperties().getProperty("ADMIN_EMAILS") || "";
  var allowed = raw
    .split(",")
    .map(function (x) {
      return x.trim().toLowerCase();
    })
    .filter(function (x) {
      return x;
    });

  if (!email || allowed.length === 0) {
    return false;
  }

  return allowed.indexOf(String(email).toLowerCase()) >= 0;
}

function getRequiredProperty_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error("Missing script property: " + key);
  }
  return value;
}

function toHex_(bytes) {
  var out = [];
  for (var i = 0; i < bytes.length; i += 1) {
    var b = bytes[i];
    var s = (b & 0xff).toString(16);
    out.push(s.length === 1 ? "0" + s : s);
  }
  return out.join("");
}
