(function () {
  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function request(path, options) {
    var opts = options || {};
    var method = opts.method || "GET";
    var body = opts.body || null;
    var retries = typeof opts.retries === "number" ? opts.retries : 0;
    var extraHeaders = opts.headers || {};

    var url = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, "") + path;
    var headers = {
      "Content-Type": "application/json",
      "X-App-Version": window.APP_CONFIG.APP_VERSION
    };

    Object.keys(extraHeaders).forEach(function (key) {
      headers[key] = extraHeaders[key];
    });

    try {
      var sessionRaw = window.localStorage.getItem("enchantressSession");
      if (sessionRaw) {
        var session = JSON.parse(sessionRaw);
        if (session && session.token) {
          headers.Authorization = "Bearer " + session.token;
        }
      }
    } catch (storageError) {
      // Keep request working even when localStorage is unavailable.
    }

    for (var attempt = 0; attempt <= retries; attempt += 1) {
      try {
        var response = await fetch(url, {
          method: method,
          headers: headers,
          body: body ? JSON.stringify(body) : undefined
        });

        var payload = null;
        try {
          payload = await response.json();
        } catch (parseErr) {
          payload = null;
        }

        if (!response.ok || !payload.success) {
          var status = response.status;
          var code = payload && payload.error && payload.error.code ? payload.error.code : "API_ERROR";
          var message = payload && payload.error && payload.error.message ? payload.error.message : "Request failed";

          if (status === 429 || code === "RATE_LIMITED") {
            message = "Too many requests. Please wait a moment before trying again.";
          } else if (status === 403 && code === "BOT_CHECK_FAILED") {
            message = "Security check failed. Please refresh and try again.";
          }

          var apiError = new Error(code + ": " + message);
          apiError.status = status;
          apiError.code = code;
          apiError.userMessage = message;
          apiError.retryable = status === 429 || status === 502 || status === 503 || status === 504;
          throw apiError;
        }

        return payload.data;
      } catch (error) {
        var retryable = !!error.retryable || error.name === "TypeError";
        if (attempt === retries || !retryable) {
          throw error;
        }
        await sleep(250 * Math.pow(2, attempt));
      }
    }
  }

  window.apiClient = {
    get: function (path, options) {
      return request(path, Object.assign({ method: "GET" }, options || {}));
    },
    post: function (path, body, options) {
      return request(path, Object.assign({ method: "POST", body: body }, options || {}));
    }
  };
})();
