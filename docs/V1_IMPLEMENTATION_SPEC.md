# Hourzy v1 Implementation Spec (Static-First, Minimal, Secure)

## 1. Product Definition
- **What it is:** A fast work-hours tracker for solo professionals and small teams that need clean hour logs and exports.
- **What it is not:** A payroll platform, compliance audit system, or multi-user cloud suite.
- **Core promise:** Track hours in seconds, keep data local, export reliably.

## 2. Brutal Scope Boundaries
- **Must-have:**
  - Start/stop timer
  - Manual entry create/edit/delete
  - Daily/weekly/monthly totals
  - CSV export/import
  - Local backup/restore
  - Basic security hardening
- **Not in v1:**
  - Accounts/login
  - Team collaboration
  - Real-time sync
  - In-app invoicing
  - Complex analytics dashboards

## 3. Architecture Decision
- **Constraint target:** Static app only (HTML/CSS/JS, no backend).
- **Recommended technical baseline:**
  - Keep Vite + TypeScript for build quality.
  - Avoid React/Zustand/Dexie UI stack for v1.
  - Use vanilla TS modules + IndexedDB API directly.
- **Repo reality:** Current codebase is React-heavy and over-scoped for the stated product constraints.
- **Execution recommendation:** Build a clean `app/` static core in parallel, then retire complex pages.

## 4. Information Architecture (UI)

### Screens
- `Tracker` (default)
  - Active timer card (Start/Stop + project + note)
  - Today entries list
  - Daily total
- `Entries`
  - Filter by date range/project
  - Inline edit/delete
  - Weekly/monthly summaries
- `Export`
  - Date range + format (CSV / JSON backup)
  - Preview totals
- `Settings`
  - Timezone, week start, rounding, reminders
  - Backup/restore, optional encryption lock

### Interaction Rules
- Primary button always visible (`Start` or `Stop`).
- One running timer at a time globally.
- Editing entry updates totals immediately.
- Dangerous actions use confirmation modal (delete/restore overwrite).

## 5. Core Data Model
- Store all time points as UTC epoch milliseconds.
- Render by local timezone at display time.

```ts
type ID = string; // crypto.randomUUID()

interface Project {
  id: ID;
  name: string;
  hourlyRate: number | null;
  archived: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

interface TimeEntry {
  id: ID;
  projectId: ID | null;
  note: string;
  startUtcMs: number;
  endUtcMs: number;
  durationMs: number; // validated end-start >= 0
  source: "timer" | "manual";
  createdAtMs: number;
  updatedAtMs: number;
}

interface TimerSnapshot {
  id: "active";
  projectId: ID | null;
  note: string;
  startUtcMs: number;
  lastHeartbeatMs: number;
}

interface Settings {
  id: "default";
  timezone: string; // IANA
  weekStartsOn: 0 | 1; // Sun/Mon
  roundingMinutes: 0 | 5 | 10 | 15;
  idleDetectionEnabled: boolean;
  dailyReminderEnabled: boolean;
  encryptionEnabled: boolean;
}
```

## 6. Storage Strategy
- **Primary:** IndexedDB (`hourzy-v1`), object stores:
  - `projects` (key: `id`)
  - `entries` (key: `id`, indexes: `startUtcMs`, `projectId`)
  - `timer` (key: `id`)
  - `settings` (key: `id`)
  - `meta` (schema version, migration flags)
- **Use localStorage only for:** tiny non-sensitive UI preferences.
- **Backup format:** JSON export with version header and checksum.

## 7. Security Baseline (Static App Reality)

### Threats to Address
- XSS via entry notes/project names.
- Local data exposure on shared/stolen devices.
- Corrupted/tampered imports.
- Multi-tab race conflicts.

### Required Controls
- Strict CSP in `index.html`:
  - `default-src 'self'`
  - `script-src 'self'`
  - `style-src 'self'`
  - `object-src 'none'`
  - `base-uri 'none'`
  - `frame-ancestors 'none'`
- Never use `innerHTML` with user content.
- Validate + sanitize all imported fields.
- Import with schema version checks and checksum verification.
- Use `BroadcastChannel` to coordinate one active timer across tabs.

### Optional Local Encryption
- Passphrase-derived key via Web Crypto PBKDF2.
- AES-GCM encrypt/decrypt backup payloads (not raw IndexedDB by default).
- Honest UX copy: protects exports and casual local access, not compromised devices.

## 8. Time Logic Rules (Non-Negotiable)
- Compute duration from UTC timestamps only.
- If entry crosses local midnight:
  - Keep raw entry intact.
  - Split only for reporting buckets.
- DST-safe totals:
  - Group by local date labels.
  - Duration remains UTC delta.
- Timer recovery after crash:
  - Restore from `TimerSnapshot`.
  - Prompt user to keep/discard recovered timer.

## 9. Edge Case Handling
- **Timezone change mid-week:** recalculate all displayed buckets on render.
- **Browser crash:** heartbeat every 20s to `timer` store.
- **Multiple tabs:** enforce lock + warning banner in secondary tab.
- **Manual edit conflict:** disallow end < start and flag unusually long sessions (>16h).
- **Clock skew/manual system clock changes:** show warning if now < start.

## 10. Smart Features (Minimal Complexity)
- **v1 included:**
  - Optional rounding (5/10/15 min)
  - End-of-day reminder if timer still running
  - One-click daily summary copy
- **Post-v1 optional:**
  - Idle detection prompt
  - Resume last project shortcut

## 11. Accessibility Baseline (WCAG-Oriented)
- Full keyboard support for all actions.
- Visible focus ring on every interactive control.
- Proper labels for all form fields.
- Contrast target >= 4.5:1 for normal text.
- ARIA live region for timer state changes (started/stopped/recovered).

## 12. File Structure (Target)

```text
app/
  index.html
  styles.css
  js/
    app.js
    state.js
    db.js
    timer.js
    entries.js
    totals.js
    export.js
    import.js
    security.js
    ui/
      tracker-view.js
      entries-view.js
      settings-view.js
```

## 13. Acceptance Criteria (Ship Gate)
- Create, edit, delete entries with no page reload.
- Start/stop timer reliably, including crash recovery.
- Totals match for:
  - normal day
  - midnight crossing
  - DST boundary date
- Export CSV and JSON backup succeeds for large datasets (10k entries).
- Import rejects malformed/corrupted data safely.
- No XSS through notes/project names.
- Works offline after first load (if PWA cache enabled).
- Keyboard-only user can complete full workflow.

## 14. Test Matrix (Minimum)
- Unit:
  - duration calculation
  - bucket grouping (day/week/month)
  - rounding logic
  - import validation
- Integration:
  - timer start/stop/recover
  - multi-tab timer lock
  - export/import roundtrip
- Manual:
  - timezone switch
  - DST day
  - browser refresh/crash simulation

## 15. Delivery Plan (Solo Developer)
1. **Week 1**
   - Build core data/store modules + tracker screen
   - Implement timer lifecycle and basic entries list
2. **Week 2**
   - Add editing, totals, export/import, validation
   - Add CSP + sanitization + schema versioning
3. **Week 3 (hardening)**
   - Edge-case fixes, accessibility pass, performance cleanup
   - Optional reminder + rounding

## 16. Monetization Fit (No Backend)
- Free core app.
- Paid one-time “Pro” unlock (local key) for:
  - encrypted backups
  - advanced export presets
  - reminder automation
- Be explicit: local license checks are convenience gating, not strong DRM.

## 17. Positioning Statement
- **Primary message:** "Private, fast time tracking for professionals who hate overhead."
- **Competitive edge vs Toggl/Clockify:** zero signup, local-first privacy, no clutter.

## 18. First 10 Build Tasks (Do These Next)
1. Create `app/index.html`, `app/styles.css`, and `app/js/` module skeleton.
2. Implement IndexedDB bootstrap in `app/js/db.js` with schema version metadata.
3. Implement in-memory app state + action dispatcher in `app/js/state.js`.
4. Implement timer start/stop/recover + heartbeat in `app/js/timer.js`.
5. Build tracker screen with Start/Stop and today list in `app/js/ui/tracker-view.js`.
6. Implement entry create/edit/delete in `app/js/entries.js` + validation guards.
7. Implement day/week/month totals in `app/js/totals.js`.
8. Implement CSV export + JSON backup export in `app/js/export.js`.
9. Implement JSON backup import with schema and checksum validation in `app/js/import.js`.
10. Add CSP and XSS-safe rendering checks in `app/index.html` and render utilities.

## 19. Runbook
- Start static app locally: `npm run dev:static`
- Build static app: `npm run build:static`
- Preview built static app: `npm run preview:static`
