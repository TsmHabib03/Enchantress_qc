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
    var retries = typeof opts.retries === "number" ? opts.retries : 2;

    var url = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, "") + path;
    var headers = {
      "Content-Type": "application/json",
      "X-App-Version": window.APP_CONFIG.APP_VERSION
    };

    for (var attempt = 0; attempt <= retries; attempt += 1) {
      try {
        var response = await fetch(url, {
          method: method,
          headers: headers,
          body: body ? JSON.stringify(body) : undefined
        });

        var payload = await response.json();
        if (!response.ok || !payload.success) {
          var code = payload && payload.error && payload.error.code ? payload.error.code : "API_ERROR";
          var message = payload && payload.error && payload.error.message ? payload.error.message : "Request failed";
          throw new Error(code + ": " + message);
        }

        return payload.data;
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        await sleep(250 * Math.pow(2, attempt));
      }
    }
  }

  window.apiClient = {
    get: function (path) {
      return request(path, { method: "GET" });
    },
    post: function (path, body) {
      return request(path, { method: "POST", body: body });
    }
  };
})();
