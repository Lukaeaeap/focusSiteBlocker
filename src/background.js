let blockedHosts = [];

function loadBlockedHosts() {
    chrome.storage.local.get({ blocked: [] }, (res) => {
        blockedHosts = res.blocked || [];
    });
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.blocked) {
        blockedHosts = changes.blocked.newValue || [];
    }
});

function isBlocked(host) {
    if (!host) return false;
    for (const entry of blockedHosts) {
        const clean = entry.trim().toLowerCase();
        if (!clean) continue;
        if (host === clean) return true;
        if (host.endsWith('.' + clean)) return true;
    }
    return false;
}

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        try {
            const url = new URL(details.url);
            const host = url.hostname.toLowerCase();
            if (isBlocked(host)) {
                const redirect = chrome.runtime.getURL('src/blocked.html') + '?url=' + encodeURIComponent(details.url);
                return { redirectUrl: redirect };
            }
        } catch (e) {
            // ignore parsing errors
        }
        return {};
    },
    { urls: ['<all_urls>'] },
    ['blocking']
);

chrome.runtime.onInstalled.addListener(() => {
    loadBlockedHosts();
});

// initial load
loadBlockedHosts();
