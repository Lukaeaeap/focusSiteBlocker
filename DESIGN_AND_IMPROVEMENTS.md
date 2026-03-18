**Overview**

This document describes how the SiteBlocker extension works today, how the main pieces interact, known limitations, and recommended next improvements.

**Architecture**

- **Background (service worker):** Implemented in [src/background.js](src/background.js). It manages the active blocklist and locks, and publishes dynamic blocking rules via `chrome.declarativeNetRequest`.
- **Options UI:** [src/options.html](src/options.html) + [src/options.js](src/options.js). Lets you add/remove blocked hosts and show/manage active locks.
- **Popup UI:** [src/popup.html](src/popup.html) + [src/popup.js](src/popup.js). Quick actions: block/unblock host, start/stop a 5-minute lock, open Options.
- **Blocked page:** [src/blocked.html](src/blocked.html) + [src/blocked.css](src/blocked.css). Shown when navigation is blocked; displays attempted/referrer URL and lock countdown.
- **Manifest:** [manifest.json](manifest.json) declares `declarativeNetRequest` permission and MV3 service worker.

**How it blocks**

- The background worker builds a set of active hosts from the blocklist and any currently-active locks.
- It converts that set to dynamic declarativeNetRequest rules (redirect rules) pointing to the extension's blocked page (`src/blocked.html`).
- When a navigation matches a rule (main_frame), Brave redirects the tab to the blocked page. The blocked page reads `document.referrer` (or query params if available) to show which URL was attempted.

**Storage & Locking**

- Blocked hosts and active locks are persisted in `chrome.storage.local` under keys `blocked` (array) and `locks` (map host->timestamp).
- Locks are implemented as a timestamp `lockedUntil` in milliseconds; the background worker periodically cleans expired locks and updates dynamic rules accordingly.
- The popup and options UI send messages (`startLock` / `stopLock`) to the service worker to control locks.

**Testing & Debugging**

- Load the extension unpacked in Brave (brave://extensions → Developer mode → Load unpacked → select this folder).
- Open the extension service worker console (Extensions entry → "Service worker" → Inspect) and look for debug logs (`SiteBlocker: ...`).
- In the service worker console, inspect dynamic rules:

```
chrome.declarativeNetRequest.getDynamicRules(console.log)
```

**Current limitations**

- Declarative Net Request cannot inject the original URL reliably as a query parameter on redirect; we fall back to `document.referrer` which may be absent in some navigation flows.
- DNR rule limits exist (max dynamic rules). For a personal blocklist this is fine; for large lists you must change approach or batch rules.
- MV3 disallows blocking `webRequest` with blocking permission for user-installed extensions — DNR is the supported pattern and has less flexibility.
- No cross-device sync: storage uses `chrome.storage.local`.

**Recommended improvements (prioritized)**

- **Robust Lock UX:** Add a clear lock list view with start/stop controls and visual timers in the extension toolbar. Improves discoverability.
- **Import/Export:** Add CSV/JSON import-export for blocklists to make large edits easy and backups safe.
- **Rule batching & normalization:** Normalize hosts and optionally allow wildcard patterns; implement batching to keep rule counts within limits.
- **Password/Delay Override:** Optional password-protected override or a short "challenge" to reduce impulsive bypassing.
- **Persistent Notifications:** Show a persistent notification or toast when a lock starts/stops (helps awareness across windows).
- **Sync support (optional):** After publishing, migrate to `chrome.storage.sync` to share lists across devices; requires Chrome Web Store publishing.
- **Testing & CI:** Add unit tests for host normalization and integration tests simulating DNR rule updates. Add a small test harness that validates rule generation.
- **Accessibility & i18n:** Improve UI accessibility and add translation support for other languages.

**Security & Privacy notes**

- This extension stores only simple host strings and timestamps in local storage; it does not collect or send telemetry.
- When adding advanced features (sync or remote storage), explicitly document what is stored remotely and require user consent.

If you want, I can:
- Implement the **Import/Export** feature next, or
- Build a nicer lock-list UI and toolbar indicators, or
- Add unit tests and a small test harness to validate rule generation.

Tell me which next item you want prioritized and I will implement it.