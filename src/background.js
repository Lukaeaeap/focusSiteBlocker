importScripts('lib.js');

let blockedHosts = [];
let locks = {}; // { host: lockedUntilTimestamp }

// track last pushed rule ids for this extension
let lastRuleIds = [];
const RULE_LIMIT = 5000; // safe threshold to avoid hitting DNR caps; surface in UI if exceeded

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
    const hosts = new Set((blockedHosts || []).map((h) => {
        try {
            if (typeof normalizeHost === 'function') return normalizeHost(h);
            return (h || '').toString().trim().toLowerCase();
        } catch (e) { return ''; }
    }).filter(Boolean));
    for (const [h, until] of Object.entries(locks || {})) {
        try {
            const nh = (typeof normalizeHost === 'function') ? normalizeHost(h) : (h || '').toString().toLowerCase();
            if (until && now < until) hosts.add(nh);
        } catch (e) { /* ignore malformed lock keys */ }
    }
    return Array.from(hosts);
}

function makeRule(host) {
    try {
        const raw = (typeof host === 'string' || typeof host === 'number') ? String(host) : '';
        const safeHost = (typeof normalizeHost === 'function') ? normalizeHost(raw) : raw.replace(/^\.+|\.+$/g, '');
        // Use `extensionPath` for redirects to avoid cross-scheme navigation errors
        // (chrome-extension:// redirects from certain error pages are blocked).
        const id = (typeof stableId === 'function') ? stableId(safeHost) : Math.floor(Math.random() * 1000000) + 1;
        return {
            id,
            priority: 1,
            action: { type: 'redirect', redirect: { extensionPath: '/src/blocked.html' } },
            condition: {
                urlFilter: `||${safeHost}^`,
                resourceTypes: ['main_frame']
            }
        };
    } catch (err) {
        console.error('SiteBlocker: makeRule error for host=', host, err);
        return { id: Math.floor(Math.random() * 10000000) + 1, priority: 1, action: { type: 'allow' }, condition: { urlFilter: 'about:blank', resourceTypes: ['main_frame'] } };
    }
}

function updateRules() {
    const hosts = getActiveHosts();
    const newRules = hosts.map((h) => makeRule(h));
    if (newRules.length > RULE_LIMIT) {
        console.error('SiteBlocker: too many dynamic rules', newRules.length);
        // Surface the error to the options UI
        chrome.storage.local.set({ ruleError: `Too many rules (${newRules.length}). Reduce blocklist.` });
        return;
    } else {
        // clear any previous error
        chrome.storage.local.get(['ruleError'], (r) => {
            if (r && r.ruleError) chrome.storage.local.remove('ruleError');
        });
    }
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
        let host = msg.host || '';
        try { host = (typeof normalizeHost === 'function') ? normalizeHost(host) : (host || '').toString().trim().toLowerCase(); } catch (e) { host = (host || '').toString().trim().toLowerCase(); }
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
        let host = msg.host || '';
        try { host = (typeof normalizeHost === 'function') ? normalizeHost(host) : (host || '').toString().trim().toLowerCase(); } catch (e) { host = (host || '').toString().trim().toLowerCase(); }
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

// Fallback: when navigation errors occur (for example the browser shows
// chrome-error://chromewebdata after a blocked navigation), open the blocked
// page ourselves in a new tab so users see the extension UI instead of the
// generic error interstitial. This helps cover navigation flows where
// extensionPath redirects are blocked by the browser on error pages.
try {
    if (chrome.webNavigation && chrome.webNavigation.onErrorOccurred) {
        chrome.webNavigation.onErrorOccurred.addListener((details) => {
            try {
                // Only consider main frame errors
                if (details.frameId !== 0) return;
                const url = details.url || '';
                if (!url || url.startsWith('chrome-extension:') || url.startsWith('chrome-error:')) return;
                let host = '';
                try { host = (new URL(url)).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return; }
                const active = getActiveHosts();
                if (!active || !active.includes(host)) return;

                // Open the blocked page in a new tab showing the attempted URL
                const blockedPage = chrome.runtime.getURL('src/blocked.html') + '?url=' + encodeURIComponent(url);
                chrome.tabs.create({ url: blockedPage }, (newTab) => {
                    // Close the original failing tab if it's not the same as the new one
                    if (details.tabId && newTab && newTab.id !== details.tabId) {
                        try { chrome.tabs.remove(details.tabId); } catch (e) { /* ignore */ }
                    }
                });
            } catch (err) {
                console.error('SiteBlocker: webNavigation fallback error', err);
            }
        }, { url: [{ schemes: ['http', 'https'] }] });
    }
} catch (e) {
    console.debug('SiteBlocker: webNavigation unavailable', e);
}
