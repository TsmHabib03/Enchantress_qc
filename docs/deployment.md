# Deployment Guide

## 1) Google Sheets and Apps Script
1. Create a Google Spreadsheet.
2. In Apps Script project properties, set:
- SPREADSHEET_ID
- SHARED_SECRET
- ADMIN_EMAILS (comma-separated)
3. Deploy web app:
- Execute as: Me
- Access: Anyone with link (gateway signature still required)
4. Run setup endpoint once to create required tabs.

## 2) Cloudflare Worker
1. Use the root Wrangler config only: [wrangler.toml](../wrangler.toml).
2. Set environment variables/secrets:
- APPS_SCRIPT_URL
- FRONTEND_URL
- ALLOWED_ORIGINS (comma-separated)
- MAX_REQUEST_BYTES
- REQUIRE_TURNSTILE
- SHARED_SECRET (secret)
- TURNSTILE_SECRET_KEY (required if REQUIRE_TURNSTILE=true)
3. Deploy worker and note the public URL.
4. Validate deployment parity:
- Ensure only one source of truth is used (`wrangler deploy --config ./wrangler.toml`).
- Confirm Cloudflare dashboard variables match `wrangler.toml` intent.
- Run `GET /api/health` from allowed and disallowed origins.

## 3) Cloudflare Pages Frontend
1. Deploy frontend directory as static site.
2. Configure build-time public vars if needed.
3. Ensure API base points to Worker URL.
4. Purge cache after security or routing changes.

## 4) Post-Deployment Smoke Tests
1. GET /api/health
2. GET /api/services/list
3. POST /api/appointments/create with valid payload
4. Confirm rows added to Appointments and Logs tabs
5. Confirm disallowed origin requests fail CORS.
6. Confirm `/auth/login` throttles after repeated attempts.
