SiteBlocker — Brave extension (unpacked)

Quick start

1. Open Brave and go to `brave://extensions`.
2. Enable "Developer mode" (top-right).
3. Click "Load unpacked" and select this folder:
   - `c:/Users/lukae/OneDrive - Vrije Universiteit Amsterdam/Documents/Programs/siteBlocker`
4. Open the extension's Options (right-click -> Options) and add `youtube.com` and `reddit.com` to test.
5. Navigate to those sites — they should redirect to the "Back to focus" page.

Notes

- This is an MV3 extension using `webRequest` blocking to redirect blocked hosts to an in-extension page.
- Storage uses `chrome.storage.local` so blocked lists are local to this browser profile.
- Future work: add timer-based hard-lock, improved UI/UX, and optional password override.
