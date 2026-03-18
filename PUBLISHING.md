Publishing to Chrome Web Store — Checklist
=========================================

This checklist covers the practical steps and requirements to publish this MV3 extension (Brave/Chrome-compatible) to the Chrome Web Store.

1) Manifest & APIs
- Ensure `manifest.json` is MV3-compliant and `manifest_version: 3`.
- Declare only required permissions. Avoid `host_permissions`/wide scopes unless necessary and document why they are needed.
- Use `declarativeNetRequest` (already used) instead of blocking `webRequest` for redirects.

2) Privacy & Data handling
- If the extension collects, transmits, or stores any user data beyond local settings, prepare a Privacy Policy and host it at a stable URL.
- Fill out the Data Practices section in the developer dashboard accurately.
- Minimize telemetry / analytics; make data collection opt-in and document what is collected.

3) Content Security & Code
- Remove any use of `eval()` or dynamic code execution; MV3 enforces strict CSP.
- Move inline scripts/styles to files (blocked page already externalized JS/CSS).
- Bundle or include static assets (images) rather than relying on remote URLs when possible (avoid leaking user behavior to third-party CDNs).

4) Packaging & Assets
- Provide required icons (recommended): 128x128 (store), and toolbar icons 16/32/48 as needed. Update `manifest.json` icons field.
- Include clear screenshots of the extension in use (desktop resolutions, 1280×800 or similar) and a hi-res promotional image if desired.
- Add a short description (≤132 chars) and a detailed description; include installation and privacy notes.

5) UX & Limitations (store listing clarity)
- In the store listing, clearly state that this is a local/unpacked-friendly MV3 extension and explain lock limitations (local storage, not tamper-proof).
- Document MV3/DNR limitations and any expected browser behaviors (e.g., redirect fallbacks for chrome-error frames).

6) Testing & Verification
- Manually test the extension as an unpacked extension in Chrome and Brave (on latest stable versions), verifying:
  - Blocking/redirect behavior for a few hosts
  - Lock start/stop and inability to remove locked hosts
  - Blocked page displays correctly (including on error-navigation flows)
- Add automated unit tests (Jest) for logic; consider E2E tests (Puppeteer) for redirect flows before publishing.

7) Developer account & upload
- Register a Chrome Web Store Developer account (one-time fee) and verify email.
- Zip the extension root (all files except dev-only artifacts like node_modules if present).
- Upload the ZIP, fill in listing fields, screenshots, and privacy policy URL (if required), and publish.

8) Post-publish & Maintenance
- Monitor crashes / user feedback and respond quickly.
- Keep dependencies updated and run `npm audit` regularly.
- Update the extension for Manifest/Chrome API changes; MV3 APIs evolve.

9) Legal & Licensing
- Make sure the `LICENSE` file is present (MIT included in this repo).
- If you use any third-party assets (images, fonts), ensure license compatibility and include attribution where required.

Notes specific to this repository
- Bundle the blocked page background image instead of linking to Unsplash to avoid external requests that could leak visit attempts.
- Ensure the extension does not include developer-only scripts (tests/build helpers) in the uploaded ZIP.
- Prefer deterministic dynamic rule IDs (already implemented) to reduce runtime errors on rule updates.

Useful links
- Chrome Web Store docs: https://developer.chrome.com/docs/webstore/ (review publishing and policies)
- MV3 reference: https://developer.chrome.com/docs/extensions/mv3/

If you want, I can:
- Create a `store/` folder with packaged assets (icons, screenshots) and a ZIP build task.
- Draft the store listing copy and screenshots.
- Add a simple Puppeteer E2E test that runs locally and can be wired into CI.
