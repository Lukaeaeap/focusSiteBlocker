// Pure helper functions for unit testing

function normalizeHost(input) {
    try {
        if (!input) return '';
        input = input.trim().toLowerCase();
        if (input.includes('://')) {
            const url = new URL(input);
            return url.hostname.replace(/^www\./, '');
        }
        input = input.split('/')[0];
        return input.replace(/^www\./, '');
    } catch (e) {
        return '';
    }
}

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
