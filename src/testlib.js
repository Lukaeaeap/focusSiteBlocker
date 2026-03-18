// Pure helper functions for unit testing
// Reuse normalizeHost from src/lib.js to keep behavior consistent
const { normalizeHost } = require('./lib');

function cleanExpiredLocks(locks, now = Date.now()) {
    const out = {};
    for (const [h, until] of Object.entries(locks || {})) {
        if (!until) continue;
        if (now < until) out[h] = until;
    }
    return out;
}

function getActiveHosts(blockedHosts = [], locks = {}, now = Date.now()) {
    const hosts = new Set((blockedHosts || []).map(h => (h || '').trim().toLowerCase()).filter(Boolean));
    for (const [h, until] of Object.entries(locks || {})) {
        if (until && now < until) hosts.add(h.toLowerCase());
    }
    return Array.from(hosts);
}

function makeRule(id, host) {
    const safeHost = (host || '').replace(/^\.+|\.+$/g, '');
    return {
        id,
        priority: 1,
        action: { type: 'redirect', redirect: { extensionPath: '/src/blocked.html' } },
        condition: {
            urlFilter: `||${safeHost}^`,
            resourceTypes: ['main_frame']
        }
    };
}

function generateRulesFromLists(blockedHosts = [], locks = {}, now = Date.now()) {
    const hosts = getActiveHosts(blockedHosts, locks, now).sort();
    return hosts.map((h, i) => makeRule(i + 1, h));
}

module.exports = {
    normalizeHost,
    cleanExpiredLocks,
    getActiveHosts,
    makeRule,
    generateRulesFromLists
};
