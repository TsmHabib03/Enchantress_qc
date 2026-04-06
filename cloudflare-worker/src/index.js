const limiterStore = new Map();
const DEFAULT_FRONTEND_URL = "https://production.enchantress-qc-frontend.pages.dev/";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://production.enchantress-qc-frontend.pages.dev",
  "https://*.enchantress-qc-frontend.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];
const DEFAULT_MAX_REQUEST_BYTES = 64 * 1024;

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = resolveRoutePath(url.pathname);

      if (request.method === "OPTIONS") {
        if (!isOriginAllowed(request.headers.get("Origin"), env)) {
          return corsResponse(new Response(null, { status: 403 }), request, env);
        }
        return corsResponse(new Response(null, { status: 204 }), request, env);
      }

      if (!isOriginAllowed(request.headers.get("Origin"), env)) {
        return corsJson(
          {
            success: false,
            error: {
              code: "ORIGIN_NOT_ALLOWED",
              message: "Request origin is not allowed"
            }
          },
          403,
          request,
          env
        );
      }

      if (path === "/") {
        const frontendRedirect = getFrontendRedirectTarget(env.FRONTEND_URL, url);
        if (frontendRedirect) {
          return Response.redirect(frontendRedirect, 302);
        }

        return corsJson(
          {
            success: true,
            data: {
              message: "Worker is running",
              hint: "Use /api/health or /health"
            }
          },
          200,
          request,
          env
        );
      }

      const method = request.method.toUpperCase();
      const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
      const maxRequestBytes = getMaxRequestBytes(env);

      let body = null;
      if (method !== "GET" && method !== "HEAD") {
        const contentTypeError = getJsonContentTypeError(request);
        if (contentTypeError) {
          return corsJson(
            {
              success: false,
              error: {
                code: "UNSUPPORTED_CONTENT_TYPE",
                message: contentTypeError
              }
            },
            415,
            request,
            env
          );
        }

        body = await parseJsonBody(request, maxRequestBytes);
        if (!body) {
          return corsJson({ success: false, error: { code: "BAD_REQUEST", message: "Invalid JSON body" } }, 400, request, env);
        }

        if (typeof body !== "object" || Array.isArray(body)) {
          return corsJson(
            {
              success: false,
              error: {
                code: "BAD_REQUEST",
                message: "JSON body must be an object"
              }
            },
            400,
            request,
            env
          );
        }

        try {
          validateUntrustedInput(body, "body", 0);
        } catch (validationError) {
          return corsJson(
            {
              success: false,
              error: {
                code: "BAD_REQUEST",
                message: validationError && validationError.message ? validationError.message : "Invalid request payload"
              }
            },
            400,
            request,
            env
          );
        }
      }

      if (path !== "/health") {
        const policy = getRatePolicy(path, method);
        const rateKey = await buildRateLimitKey(ip, path, body);
        const rate = checkRateLimit(rateKey, policy.maxRequests, policy.windowMs);
        if (!rate.allowed) {
          return corsJson(
            {
              success: false,
              error: {
                code: "RATE_LIMITED",
                message: "Too many requests, retry later"
              },
              meta: { retryAfterSeconds: rate.retryAfterSeconds }
            },
            429,
            request,
            env
          );
        }
      }

      if (isTurnstileRequiredForPath(path, method, env)) {
        if (!env.TURNSTILE_SECRET_KEY) {
          return corsJson(
            {
              success: false,
              error: {
                code: "WORKER_CONFIG_ERROR",
                message: "TURNSTILE_SECRET_KEY is required when turnstile enforcement is enabled"
              }
            },
            500,
            request,
            env
          );
        }

        const turnstileToken = request.headers.get("X-Turnstile-Token");
        const verified = await verifyTurnstile(turnstileToken, ip, env);
        if (!verified) {
          return corsJson({ success: false, error: { code: "BOT_CHECK_FAILED", message: "Challenge failed" } }, 403, request, env);
        }
      }

      const query = {};
      url.searchParams.forEach((value, key) => {
        query[key] = value;
      });
      try {
        validateUntrustedInput(query, "query", 0);
      } catch (queryValidationError) {
        return corsJson(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: queryValidationError && queryValidationError.message
                ? queryValidationError.message
                : "Invalid query parameters"
            }
          },
          400,
          request,
          env
        );
      }

      const payload = {
        method,
        path,
        query,
        body,
        headers: {
          Authorization: request.headers.get("Authorization") || ""
        }
      };

      if (!env.SHARED_SECRET) {
        throw new Error("Missing SHARED_SECRET in Worker secrets");
      }
      if (!env.APPS_SCRIPT_URL) {
        throw new Error("Missing APPS_SCRIPT_URL in Worker variables");
      }

      const envelope = await signEnvelope(payload, env.SHARED_SECRET);

      const upstream = await fetch(env.APPS_SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-App-Version": env.APP_VERSION || "0.1.0"
        },
        body: JSON.stringify(envelope)
      });

      const text = await upstream.text();
      return corsResponse(
        new Response(text, {
          status: upstream.status,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer"
          }
        }),
        request,
        env
      );
    } catch (error) {
      if (error && error.message === "REQUEST_TOO_LARGE") {
        return corsJson(
          {
            success: false,
            error: {
              code: "REQUEST_TOO_LARGE",
              message: "Request body exceeds allowed limit"
            }
          },
          413,
          request,
          env
        );
      }

      return corsJson(
        {
          success: false,
          error: {
            code: "WORKER_ERROR",
            message: error && error.message ? error.message : "Unexpected worker failure"
          }
        },
        500,
        request,
        env
      );
    }
  }
};

function getMaxRequestBytes(env) {
  const raw = Number(env.MAX_REQUEST_BYTES || DEFAULT_MAX_REQUEST_BYTES);
  if (!Number.isFinite(raw)) {
    return DEFAULT_MAX_REQUEST_BYTES;
  }
  return Math.max(1024, Math.floor(raw));
}

function getJsonContentTypeError(request) {
  const raw = request.headers.get("Content-Type") || "";
  const contentType = raw.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return "Unsupported content type. Expected application/json";
  }
  return "";
}

async function parseJsonBody(request, maxRequestBytes) {
  const contentLengthRaw = request.headers.get("Content-Length");
  if (contentLengthRaw) {
    const contentLength = Number(contentLengthRaw);
    if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
      throw new Error("REQUEST_TOO_LARGE");
    }
  }

  const text = await request.text();
  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength > maxRequestBytes) {
    throw new Error("REQUEST_TOO_LARGE");
  }

  if (!text || !text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function validateUntrustedInput(value, label, depth) {
  if (depth > 10) {
    throw new Error("Request payload is too deeply nested");
  }

  if (value === null || value === undefined) {
    return;
  }

  const type = typeof value;
  if (type === "string") {
    if (value.length > 5000) {
      throw new Error("Request field is too long: " + label);
    }
    if (/\u0000/.test(value)) {
      throw new Error("Request field contains invalid control characters: " + label);
    }
    return;
  }

  if (type === "number" || type === "boolean") {
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > 200) {
      throw new Error("Request array is too large: " + label);
    }
    value.forEach((item, index) => {
      validateUntrustedInput(item, label + "[" + index + "]", depth + 1);
    });
    return;
  }

  if (type === "object") {
    const keys = Object.keys(value);
    if (keys.length > 200) {
      throw new Error("Request object has too many fields: " + label);
    }

    keys.forEach((key) => {
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        throw new Error("Request contains forbidden field name: " + key);
      }
      if (String(key).length > 120) {
        throw new Error("Request contains oversized field name");
      }
      validateUntrustedInput(value[key], label + "." + key, depth + 1);
    });
    return;
  }

  throw new Error("Unsupported request field type: " + label);
}

function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const state = limiterStore.get(key) || { count: 0, windowStart: now };

  // Keep memory bounded for long-running isolates.
  if (limiterStore.size > 5000) {
    for (const [k, v] of limiterStore) {
      if (now - v.windowStart > windowMs) {
        limiterStore.delete(k);
      }
    }
  }

  if (now - state.windowStart >= windowMs) {
    state.count = 0;
    state.windowStart = now;
  }

  state.count += 1;
  limiterStore.set(key, state);

  if (state.count <= maxRequests) {
    return { allowed: true };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - state.windowStart)) / 1000));
  return { allowed: false, retryAfterSeconds };
}

async function buildRateLimitKey(ip, path, body) {
  if (path === "/auth/login" && body && body.email) {
    const emailHash = await sha256Hex(String(body.email).trim().toLowerCase());
    return `${ip}::${path}::${emailHash}`;
  }

  if (path === "/auth/register" && body && body.email) {
    const emailHash = await sha256Hex(String(body.email).trim().toLowerCase());
    return `${ip}::${path}::${emailHash}`;
  }

  if (path === "/appointments/create" && body && body.customer && body.customer.phone) {
    const phoneHash = await sha256Hex(String(body.customer.phone).trim());
    return `${ip}::${path}::${phoneHash}`;
  }

  return `${ip}::${path}`;
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(token, ip, env) {
  if (!token) {
    return false;
  }

  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  form.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    return false;
  }

  const result = await response.json();
  return !!result.success;
}

async function signEnvelope(payload, secret) {
  if (!secret) {
    throw new Error("Missing SHARED_SECRET");
  }

  const nonce = crypto.randomUUID();
  const timestamp = Date.now();
  const payloadText = JSON.stringify(payload);
  const base = `${timestamp}.${nonce}.${payloadText}`;
  const signature = await hmacHex(base, secret);

  return {
    timestamp,
    nonce,
    payload,
    signature
  };
}

async function hmacHex(text, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function corsResponse(response, request, env) {
  const requestedHeaders = request ? request.headers.get("Access-Control-Request-Headers") : "";
  const allowHeaders = requestedHeaders && requestedHeaders.trim()
    ? requestedHeaders
    : "Authorization, Content-Type, X-App-Version, X-Turnstile-Token";

  const origin = request ? request.headers.get("Origin") : "";
  if (origin && isOriginAllowed(origin, env)) {
    response.headers.set("Access-Control-Allow-Origin", normalizeOrigin(origin));
  }

  response.headers.set("Access-Control-Allow-Headers", allowHeaders);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
  response.headers.set("Access-Control-Max-Age", "86400");
  response.headers.set("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
  applySecurityHeaders(response);
  return response;
}

function applySecurityHeaders(response) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
}

function corsJson(payload, status, request, env) {
  return corsResponse(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    }),
    request,
    env
  );
}

function resolveRoutePath(pathname) {
  if (pathname === "/api" || pathname === "/api/") {
    return "/health";
  }
  if (pathname.startsWith("/api/")) {
    return pathname.replace("/api", "") || "/";
  }
  return pathname || "/";
}

function getRatePolicy(path, method) {
  if (path === "/auth/login" && method === "POST") {
    return { maxRequests: 8, windowMs: 60 * 1000 };
  }
  if (path === "/auth/register" && method === "POST") {
    return { maxRequests: 4, windowMs: 10 * 60 * 1000 };
  }
  if (path === "/appointments/create" && method === "POST") {
    return { maxRequests: 12, windowMs: 60 * 1000 };
  }
  if (path === "/appointments/slots" && method === "GET") {
    return { maxRequests: 120, windowMs: 60 * 1000 };
  }
  return { maxRequests: 60, windowMs: 60 * 1000 };
}

function isTurnstileRequiredForPath(path, method, env) {
  if (path !== "/appointments/create" || method !== "POST") {
    return false;
  }

  const flag = String(env.REQUIRE_TURNSTILE || "").trim().toLowerCase();
  if (flag === "true") {
    return true;
  }
  if (flag === "false") {
    return false;
  }

  return !!env.TURNSTILE_SECRET_KEY;
}

function normalizeOrigin(origin) {
  try {
    return new URL(origin).origin.toLowerCase();
  } catch (error) {
    return "";
  }
}

function normalizeAllowedOriginEntry(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }

  if (raw.indexOf("*") >= 0) {
    return raw.replace(/\/+$/, "");
  }

  return normalizeOrigin(raw);
}

function getAllowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => normalizeAllowedOriginEntry(value))
    .filter((value) => !!value);

  const frontendOrigin = normalizeOrigin(env.FRONTEND_URL || "");
  const defaultFrontendOrigin = normalizeOrigin(DEFAULT_FRONTEND_URL);

  return Array.from(
    new Set(
      configured
        .concat(DEFAULT_ALLOWED_ORIGINS)
        .concat(frontendOrigin ? [frontendOrigin] : [])
        .concat(defaultFrontendOrigin ? [defaultFrontendOrigin] : [])
    )
  );
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wildcardToRegex(pattern) {
  const escaped = escapeRegex(pattern).replace(/\\\*/g, ".*");
  return new RegExp("^" + escaped + "$");
}

function isOriginAllowed(origin, env) {
  if (!origin) {
    return true;
  }

  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return false;
  }

  const allowedOrigins = getAllowedOrigins(env);
  for (const allowed of allowedOrigins) {
    if (!allowed) {
      continue;
    }

    if (allowed.indexOf("*") >= 0) {
      if (wildcardToRegex(allowed).test(normalized)) {
        return true;
      }
      continue;
    }

    if (allowed === normalized) {
      return true;
    }
  }

  return false;
}

function getFrontendRedirectTarget(frontendUrl, requestUrl) {
  const candidates = [frontendUrl, DEFAULT_FRONTEND_URL];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      const target = new URL(candidate);
      if (target.origin === requestUrl.origin && target.pathname === requestUrl.pathname) {
        continue;
      }
      return target.toString();
    } catch (error) {
      continue;
    }
  }

  return null;
}
