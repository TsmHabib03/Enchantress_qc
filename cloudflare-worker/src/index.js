const limiterStore = new Map();

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method === "OPTIONS") {
        return corsResponse(new Response(null, { status: 204 }));
      }

      const url = new URL(request.url);
      const path = resolveRoutePath(url.pathname);
      if (path === "/") {
        if (env.FRONTEND_URL) {
          return Response.redirect(env.FRONTEND_URL, 302);
        }

        return corsJson(
          {
            success: true,
            data: {
              message: "Worker is running",
              hint: "Use /api/health or /health"
            }
          },
          200
        );
      }
      const method = request.method.toUpperCase();
      const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

      let body = null;
      if (method !== "GET" && method !== "HEAD") {
        body = await safeJson(request);
        if (!body) {
          return corsJson({ success: false, error: { code: "BAD_REQUEST", message: "Invalid JSON body" } }, 400);
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
            429
          );
        }
      }

      if (method !== "GET" && method !== "HEAD") {
        if (path === "/appointments/create") {
          const turnstileToken = request.headers.get("X-Turnstile-Token");
          const verified = await verifyTurnstile(turnstileToken, ip, env);
          if (!verified) {
            return corsJson({ success: false, error: { code: "BOT_CHECK_FAILED", message: "Challenge failed" } }, 403);
          }
        }
      }

      const query = {};
      url.searchParams.forEach((value, key) => {
        query[key] = value;
      });

      const payload = {
        method,
        path,
        query,
        body
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
        })
      );
    } catch (error) {
      return corsJson(
        {
          success: false,
          error: {
            code: "WORKER_ERROR",
            message: error && error.message ? error.message : "Unexpected worker failure"
          }
        },
        500
      );
    }
  }
};

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
  if (!env.TURNSTILE_SECRET_KEY) {
    return true;
  }
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

async function safeJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

function corsResponse(response) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-App-Version, X-Turnstile-Token");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return response;
}

function corsJson(payload, status) {
  return corsResponse(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    })
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
  if (path === "/appointments/create" && method === "POST") {
    return { maxRequests: 12, windowMs: 60 * 1000 };
  }
  if (path === "/appointments/slots" && method === "GET") {
    return { maxRequests: 120, windowMs: 60 * 1000 };
  }
  return { maxRequests: 60, windowMs: 60 * 1000 };
}
