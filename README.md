SiteBlocker — Brave extension (unpacked)

![CI](https://github.com/Lukaeaeap/focusSiteBlocker/actions/workflows/nodejs.yml/badge.svg)

Quick start

1. Open Brave and go to `brave://extensions`.
2. Enable "Developer mode" (top-right).
3. Click "Load unpacked" and select this folder:
   - `c:/Users/lukae/OneDrive - Vrije Universiteit Amsterdam/Documents/Programs/siteBlocker`
4. Open the extension's Options (right-click → Options) and add `youtube.com` and `reddit.com` to test.
5. Navigate to those sites — they should redirect to the "Back to focus" page.

Features

- Block list: Add domains to the blocklist in Options. Navigations to blocked hosts are redirected to the in-extension "Back to focus" page.
- Lock (temporary hard-lock): From the popup or Options you can `Lock` a host for N minutes. A locked host is treated like a blocked host and cannot be removed while the lock is active.
- Unlock / Stop Lock: Manually stop a lock before it expires (requires confirmation in the UI). Stopping a lock removes the enforced redirect for that host.
- Hold-to-open Settings: The blocked page requires a short hold to open Options to prevent quick accidental access.
- Confirm-to-remove: Removing a host from the blocklist requires typing the domain to confirm (prevents accidental deletions).

What "Lock" does (and why it helps)

- Behavior: A lock stores a timestamp in `chrome.storage.local` for the given host (the time when the lock expires). The background service worker merges locked hosts into the active DNR blocking rules, so any navigation to a locked host is redirected to the blocked page until the lock expires or is stopped.
- Prevents quick bypassing: If you add a site to the blocklist and then immediately remove it, the block would disappear. A lock stops that by making the host effectively blocked for the lock duration and disallowing removal while the lock is active. That makes self-enforced timeouts (e.g., "don't go on YouTube for 25 minutes") harder to bypass in the moment.
- Use cases: Pomodoro-style focus periods, temporary hard lock during deep work, or automatic re-lock after a scheduled start.
- Limitations: Locks live in `chrome.storage.local` for the current browser profile only — a determined user can still manually edit storage or disable the extension. Locks are a deterrent for casual or impulsive bypassing, not an infallible lockout.

Technical notes

- This is an MV3 extension using `declarativeNetRequest` dynamic rules (DNR) to redirect blocked/locked hosts to `/src/blocked.html`. MV3 does not allow user-installed extensions to use blocking `webRequest` listeners for redirecting, so DNR is used instead.
- Data is stored in `chrome.storage.local` under `blocked` (array) and `locks` (map host → expiry timestamp).

Running tests

1. Install dev dependencies:

```bash
npm install
```

2. Run tests:

```bash
npm test
```

Continuous integration

- A GitHub Actions workflow runs `npm ci` and `npm test` on push and pull requests to `main`.
- See the CI badge at the top of this README for build status.

Notes:

- Tests use Jest and exercise pure logic located in `src/testlib.js` (normalization, lock expiry, rule generation). They do not run the extension runtime.
- Keep `src/testlib.js` in sync with the extension's live logic when making changes.

Developer notes & structure

- Background (service worker): `src/background.js` — builds active host set and publishes DNR rules.
- Options UI: `src/options.html` + `src/options.js` — add/remove hosts, start/stop locks.
- Popup UI: `src/popup.html` + `src/popup.js` — quick actions and open Options.
- Blocked page: `src/blocked.html` + `src/blocked.js` — shown on redirect; displays attempted site and lock countdown.
- Tests: `tests/` and `src/testlib.js`.
- Manifest: `manifest.json` declares MV3 service worker and `declarativeNetRequest` permissions.

Design, limitations & next steps

- DNR limits: Declarative Net Request has caps on dynamic rules — for a personal blocklist this usually suffices, but large lists require batching or a different approach.
- Referrer behavior: Some navigation flows (cross-origin or browser search result redirections) may not include a `document.referrer`; the extension attempts to preserve the original URL via query params when possible.
- Recommended next work (pick one): import/export for blocklists, a dedicated lock-list UI, rule batching, or CI for tests.

If you want screenshots, a developer deep-dive, or one of the recommended improvements implemented next, tell me which and I'll proceed.

License: MIT (personal project)

Troubleshooting
---------------

- Blocked pages still show the extension id or fail to load: some navigation flows (browser error pages or special frames) prevent `chrome-extension://` redirects. The extension opens the blocked page in a new tab as a fallback — if you still see issues, try disabling other extensions or test in an incognito profile.
- DNR rule count errors: if you see a rule-count warning in Options, reduce the blocklist or remove duplicates. The active-rule computation is based on `blocked` + `locks`. The rule limit is enforced in `src/background.js` (`RULE_LIMIT` constant).
- Locks not applying: ensure the extension is enabled and that `declarativeNetRequest` permission is present in `manifest.json`.

Development
-----------

- Tests: run `npm test` (Jest) — tests target pure logic in `src/testlib.js`.
- CI: a GitHub Actions workflow runs tests on push/PR to `main` (`.github/workflows/nodejs.yml`).
- Load unpacked: follow the Quick start section to load the extension into Brave for manual testing.

Contributing & License
----------------------

See `CONTRIBUTING.md` for contribution guidance. This project is released under the MIT License (`LICENSE`).
