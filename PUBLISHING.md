# Chrome Web Store Publishing Checklist

This project is already structured for MV3 publication. Use this checklist as the exact release flow.

## 1. Run release checks locally

```bash
npm install
npm run check
npm run prepare:release
npm run package:release
```

`npm run check` runs:

- Jest unit tests.
- `scripts/validate-release.js` manifest and packaging checks.

`npm run prepare:release` creates a clean release folder in `dist/` with runtime-only files.
`npm run package:release` creates the same folder and a `.zip` file next to it (Windows).

Do not publish if this command fails.

## 2. Confirm manifest and assets

- `manifest.json` uses `manifest_version: 3`.
- Icon set exists as PNG: `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, `icons/icon128.png`.
- Permissions are intentional (`storage`, `declarativeNetRequest`, `tabs`, `webNavigation`).

## 3. Manual behavior verification (Chrome + Brave)

Load unpacked in both browsers and verify:

- Add/remove blocked domains works.
- Lock/unlock works from popup and options.
- Locked domains cannot be removed until unlocked.
- Countdown updates every second and uses compact labels (`s/m/h/d`).
- Blocked page appears for blocked hosts, including error-navigation fallback flow.
- Open settings from blocked page works.

## 4. Package zip for upload

Create a zip from the prepared `dist/siteblocker-focus-v<version>/` folder:

- The release folder excludes private and dev content by design: `plans/`, `tests/`, `scripts/`, `.git/`, `.github/`, `node_modules/`.

## 5. Chrome Web Store listing requirements

- Create/verify Chrome Web Store developer account.
- Add store description and screenshots.
- Complete Data practices accurately.
- Provide privacy policy URL if required by your declared practices.

## 6. Post-publish checks

- Install from store listing and run quick smoke test.
- Monitor user feedback and crash reports.
- Re-run `npm run check` before each new version.

## Useful docs

- https://developer.chrome.com/docs/webstore/
- https://developer.chrome.com/docs/extensions/mv3/
