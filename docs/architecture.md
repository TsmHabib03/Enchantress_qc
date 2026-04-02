# Architecture Overview

## Request Flow
1. Browser sends request to Cloudflare Worker under /api/*.
2. Worker applies CORS, anti-bot checks, and rate limiting.
3. Worker signs request with shared secret and forwards to Apps Script endpoint.
4. Apps Script validates signature and executes route logic.
5. Apps Script reads/writes Google Sheets and returns a standard JSON envelope.

## JSON Envelope
- success: boolean
- data: payload when success is true
- error: object with code and message when success is false
- meta: timestamp, requestId, version

## Core Components
- Public Booking UI
- Admin UI
- Worker Gateway
- Apps Script Router
- Google Sheets persistence and audit logs

## Security Baseline
- Edge rate limiting by IP and booking identity key
- Optional Turnstile validation for public booking
- Signed gateway-to-backend payloads
- Admin endpoint access checks
- Structured append-only audit logs
