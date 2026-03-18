let blockedHosts = [];
let locks = {}; // { host: lockedUntilTimestamp }

// track last pushed rule ids for this extension
let lastRuleIds = [];

function loadBlockedHosts() {
    chrome.storage.local.get({ blocked: [] }, (res) => {
        blockedHosts = res.blocked || [];
        updateRules();
    });
}

function loadLocks() {
    chrome.storage.local.get({ locks: {} }, (res) => {
        locks = res.locks || {};
        updateRules();
    });
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.blocked) {
        blockedHosts = changes.blocked.newValue || [];
        updateRules();
    }
    if (area === 'local' && changes.locks) {
        locks = changes.locks.newValue || {};
        updateRules();
    }
});

function getActiveHosts() {
    const now = Date.now();
    const hosts = new Set(blockedHosts.map(h => h.trim().toLowerCase()).filter(Boolean));
    for (const [h, until] of Object.entries(locks)) {
        if (until && now < until) hosts.add(h.toLowerCase());
    }
    return Array.from(hosts);
}

function makeRule(id, host) {
    const safeHost = (host || '').replace(/^\.+|\.+$/g, '');
    // Build a full extension URL including the original host as a query param.
    // Using a full `chrome-extension://...` redirect URL prevents the browser's
    // generic "ERR_BLOCKED_BY_CLIENT" interstitial from showing the raw
    // extension id string; instead the extension page loads and can display
    // a friendly message.
    const redirectBase = chrome.runtime.getURL('src/blocked.html');
    const redirectUrl = `${redirectBase}?url=${encodeURIComponent('https://' + safeHost)}`;
    return {
        id,
        priority: 1,
        action: { type: 'redirect', redirect: { url: redirectUrl } },
        condition: {
            // Domain and subdomain match in DNR format.
            // Example: ||youtube.com^ matches youtube.com and www.youtube.com.
            urlFilter: `||${safeHost}^`,
            resourceTypes: ['main_frame']
        }
    };
}

function updateRules() {
    const hosts = getActiveHosts();
    const newRules = hosts.map((h, i) => makeRule(i + 1, h));
    // get existing dynamic rules for this extension, remove them, then add new ones
    try {
        chrome.declarativeNetRequest.getDynamicRules((existing) => {
            console.debug('SiteBlocker: existing dynamic rules', existing);
            const removeRuleIds = (existing || []).map(r => r.id);
            chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: newRules }, () => {
                const err = chrome.runtime.lastError;
                if (err) {
                    console.error('SiteBlocker: failed to update dynamic rules', err);
                } else {
                    console.debug('SiteBlocker: updated dynamic rules', newRules);
                }
                // store last ids
                lastRuleIds = newRules.map(r => r.id);
            });
        });
    } catch (e) {
        console.error('SiteBlocker: exception updating rules', e);
    }
}

// Clean expired locks periodically
setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [h, until] of Object.entries(locks)) {
        if (until && now >= until) {
            delete locks[h];
            changed = true;
        }
    }
    if (changed) {
        chrome.storage.local.set({ locks });
    }
}, 30 * 1000);

// API: start/stop a lock for a host for N minutes
chrome.runtime.onMessage.addListener((msg, sender, cb) => {
    console.debug('SiteBlocker: message received', msg, sender && sender.id);
    if (!msg || !msg.action) return;
    if (msg.action === 'startLock') {
        const host = (msg.host || '').trim().toLowerCase();
        const minutes = Number(msg.minutes) || 5;
        if (!host) {
            cb({ success: false, error: 'missing host' });
            return;
        }
        const until = Date.now() + minutes * 60 * 1000;
        locks[host] = until;
        chrome.storage.local.set({ locks }, () => {
            cb({ success: true, until });
        });
        return true; // will call cb asynchronously
    }
    if (msg.action === 'stopLock') {
        const host = (msg.host || '').trim().toLowerCase();
        if (locks[host]) {
            delete locks[host];
            chrome.storage.local.set({ locks }, () => {
                console.debug('SiteBlocker: stopped lock for', host);
                cb({ success: true });
            });
            return true;
        }
        console.debug('SiteBlocker: stopLock failed, not locked', host);
        cb({ success: false, error: 'not locked' });
    }
});

// Helpful startup log
console.debug('SiteBlocker: background worker started');

chrome.runtime.onInstalled.addListener(() => {
    loadBlockedHosts();
    loadLocks();
});

// initial load
loadBlockedHosts();
loadLocks();
