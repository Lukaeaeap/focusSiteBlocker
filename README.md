# SiteBlocker Focus

Chromium MV3 extension (Chrome/Brave compatible) that blocks distracting domains and supports timed hard locks.

![CI](https://github.com/Lukaeaeap/focusSiteBlocker/actions/workflows/nodejs.yml/badge.svg)

## Features

- Domain blocklist with redirect to an in-extension "Back to focus" page.
- Timed hard lock per host (e.g. 5 minutes) from popup or options.
- Lock state shown per blocked domain and updated every second.
- Compact lock labels using highest unit only (e.g. `19s`, `5m`, `2h`).
- Removal protection while a domain is locked.
- Import/export of blocklist and locks as JSON.
- Fallback handling for navigation error flows using `webNavigation`.

## Quick start (unpacked)

1. Open `chrome://extensions` or `brave://extensions`.
2. Enable Developer mode.
3. Click Load unpacked and select this repository folder.
4. Open extension Options and add domains like `youtube.com` and `reddit.com`.
5. Visit those sites to verify redirection to the blocked page.

## Development and checks

Install dependencies:

```bash
npm install
```

Run unit tests:

```bash
npm test
```

Run publication checks (tests + release validator):

```bash
npm run check
```

The release validator checks:

- MV3 manifest basics.
- Required PNG icon files (`16/32/48/128`).
- Required extension entry files.
- No remote asset URLs in blocked page files.

## Project structure

- `manifest.json`: MV3 manifest and permissions.
- `src/background.js`: DNR rule updates, locks, and fallback navigation handling.
- `src/options.html` + `src/options.js`: blocklist and lock management.
- `src/popup.html` + `src/popup.js`: quick block/lock actions.
- `src/blocked.html` + `src/blocked.js` + `src/blocked.css`: blocked landing page.
- `src/lib.js`: shared helpers (host normalization, stable IDs, compact durations).
- `tests/`: Jest unit tests.
- `scripts/validate-release.js`: pre-publish validation script.

## Notes and limitations

- Uses `declarativeNetRequest` dynamic rules (MV3-compatible redirect path).
- Locks are local-profile deterrents, not tamper-proof parental controls.
- DNR dynamic rules are capped; options UI warns when approaching limits.

## Publishing

See `PUBLISHING.md` for the Chrome Web Store checklist and submission flow.

## License

MIT (`LICENSE`)
