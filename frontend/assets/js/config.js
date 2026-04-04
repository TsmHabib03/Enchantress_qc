window.APP_CONFIG = Object.assign(
  {
    API_BASE_URL: "https://enchantress-qc.jaudianhabib879.workers.dev/api",
    APP_VERSION: "0.1.0",
    TIMEZONE: "Asia/Manila",
    BOOKING_AUTH_REQUIRED: true,
    BOOKING_VIEW_REQUIRES_AUTH: true,
    BOOKING_MIN_INTERACTION_MS: 3500,
    BOOKING_SUBMIT_COOLDOWN_MS: 12000,
    BOOKING_DUPLICATE_WINDOW_MS: 60000,
    CHALLENGE_ENABLED: false,
    CHALLENGE_HEADER_NAME: "X-Turnstile-Token"
  },
  window.APP_CONFIG || {}
);
