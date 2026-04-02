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
1. Set environment variables/secrets:
- APPS_SCRIPT_URL
- SHARED_SECRET
- TURNSTILE_SECRET_KEY (optional)
2. Deploy worker and note the public URL.

## 3) Cloudflare Pages Frontend
1. Deploy frontend directory as static site.
2. Configure build-time public vars if needed.
3. Ensure API base points to Worker URL.

## 4) Post-Deployment Smoke Tests
1. GET /api/health
2. GET /api/services/list
3. POST /api/appointments/create with valid payload
4. Confirm rows added to Appointments and Logs tabs
