# Hourzy Static v1 Progress

## Implemented
- Standalone static app under `app/` using HTML/CSS/vanilla JS modules.
- IndexedDB persistence with object stores: `projects`, `entries`, `timer`, `settings`, `meta`.
- Timer lifecycle:
  - start/stop/discard
  - crash recovery from persisted timer snapshot
  - 20s heartbeat persistence
  - multi-tab lock coordination via `localStorage` + `BroadcastChannel`
- Entry management:
  - manual entry create
  - edit/delete from Tracker and Entries screens
  - immediate totals refresh
- Totals and reports:
  - day/week/month buckets with cross-midnight local split handling
  - filtered Entries table
  - CSV export
  - one-click daily summary copy
- Backup and restore:
  - plain JSON backup with SHA-256 checksum
  - encrypted backup (AES-GCM + PBKDF2 passphrase)
  - encrypted import with passphrase prompt
  - CSV/Excel (`.csv`, `.xlsx`, `.xls`) import for time entries
  - fixture-based backup roundtrip tests (plain + encrypted)
- Security and UX baseline:
  - CSP in static HTML
  - sanitized user text
  - no `innerHTML` for user content
  - accessible dialog-based edit/confirm/passphrase flows
  - in-app toast notifications (non-blocking, no browser alert/prompt/confirm)
  - centralized write/import validation guards for projects, entries, timer snapshots, and settings
  - backup schema migration layer (`schemaVersion`)
  - optional encrypted-at-rest local storage mode with lock/unlock and passphrase-gated startup
  - local auth gate with seeded superadmin and session login/logout
  - startup recovery reset path for corrupted encrypted local vault data
  - passphrase dialogs clear field values after submit
  - clipboard summary auto-clears after timeout when unchanged
- Settings:
  - timezone
  - week start day
  - rounding (0/5/10/15)
  - daily reminder
  - idle detection toggle
  - vault auto-lock minutes
  - retention pruning (delete entries before date)
  - encrypted vault controls (enable/unlock/lock/disable/reset)
  - superadmin-only user creation and user list
- Backup restore UX:
  - in-place DB rehydrate (no hard page reload)
  - timer runtime reconciliation after restore
- PWA baseline:
  - web manifest
  - runtime service worker caching with offline fallback page
- Multi-tab coherence:
  - vault version broadcast + storage-key invalidation to clear stale encrypted cache across tabs
- Automated checks:
  - `node:test` suite for backup schema/validation and timezone/DST time bucketing
  - service worker config checks
  - vault crypto flow tests
  - Playwright browser integration for full vault enable/lock/unlock/disable migration flow

## Auth Bootstrap
- Initial local superadmin credentials:
  - `username`: `superadmin`
  - `password`: `SuperAdmin1234!!!!`
- Credentials are hashed with PBKDF2 and stored locally.
- Browser support diagnostics:
  - IndexedDB/WebCrypto/BroadcastChannel/ServiceWorker checks with issue reporting in Settings

## Remaining Priorities
- Optimize encrypted-at-rest writes further with chunked encrypted records for very large datasets.

## Run Commands
- `npm run dev:static`
- `npm run build:static`
- `npm run preview:static`
- `npm run test:static`
- `npm run test:browser:integration`
