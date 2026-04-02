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
