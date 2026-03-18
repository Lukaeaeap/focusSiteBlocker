importScripts('lib.js');

let blockedHosts = [];
let locks = {}; // { host: lockedUntilTimestamp }
let schedules = []; // [{ id, name, hosts[], days[], start, end, enabled }]
let timeBudgets = {}; // { host: minutesPerDay }
let budgetUsage = { day: '', usage: {} }; // { day: YYYY-MM-DD, usage: { host: usedMinutes } }
let presets = []; // [{ id, name, hosts[] }]
let appliedPresetIds = []; // [presetId]
let insightsSettings = { enabled: true };
let insights = { days: {} }; // { days: { YYYY-MM-DD: { blockedAttempts, focusMinutes } } }
let insightsMeta = { lastUpdated: 0 };
let activeTabHost = '';

function normalizeTimeBudgets(raw) {
    const out = {};
    Object.entries(raw || {}).forEach(([host, mins]) => {
        const nh = normalizeHost(host);
        const cap = Math.max(0, Number(mins) || 0);
        if (!nh || cap <= 0) return;
        out[nh] = cap;
    });
    return out;
}

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

function loadAutomationState() {
    chrome.storage.local.get({
        schedules: [],
        timeBudgets: {},
        budgetUsage: { day: '', usage: {} },
        presets: [],
        appliedPresetIds: [],
        insightsSettings: { enabled: true },
        insights: { days: {} },
        insightsMeta: { lastUpdated: 0 }
    }, (res) => {
        schedules = Array.isArray(res.schedules) ? res.schedules : [];
        timeBudgets = normalizeTimeBudgets(res.timeBudgets || {});
        budgetUsage = res.budgetUsage || { day: '', usage: {} };
        presets = Array.isArray(res.presets) ? res.presets.map(normalizePreset) : [];
        appliedPresetIds = Array.isArray(res.appliedPresetIds) ? res.appliedPresetIds.map((id) => String(id)) : [];
        insightsSettings = res.insightsSettings || { enabled: true };
        insights = res.insights || { days: {} };
        insightsMeta = res.insightsMeta || { lastUpdated: 0 };
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
    if (area === 'local' && changes.schedules) {
        schedules = changes.schedules.newValue || [];
        applySchedulesAndBudgets(Date.now());
        updateRules();
    }
    if (area === 'local' && changes.timeBudgets) {
        timeBudgets = normalizeTimeBudgets(changes.timeBudgets.newValue || {});
        applySchedulesAndBudgets(Date.now());
    }
    if (area === 'local' && changes.presets) {
        presets = Array.isArray(changes.presets.newValue) ? changes.presets.newValue.map(normalizePreset) : [];
        updateRules();
    }
    if (area === 'local' && changes.appliedPresetIds) {
        appliedPresetIds = Array.isArray(changes.appliedPresetIds.newValue) ? changes.appliedPresetIds.newValue.map((id) => String(id)) : [];
        updateRules();
    }
    if (area === 'local' && changes.budgetUsage) {
        budgetUsage = changes.budgetUsage.newValue || { day: '', usage: {} };
    }
    if (area === 'local' && changes.insightsSettings) {
        insightsSettings = changes.insightsSettings.newValue || { enabled: true };
    }
    if (area === 'local' && changes.insights) {
        insights = changes.insights.newValue || { days: {} };
    }
    if (area === 'local' && changes.insightsMeta) {
        insightsMeta = changes.insightsMeta.newValue || { lastUpdated: 0 };
    }
});

function endOfDayTs(ms = Date.now()) {
    const d = new Date(ms);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
}

function normalizeSchedule(raw) {
    const hosts = Array.isArray(raw && raw.hosts) ? raw.hosts.map((h) => normalizeHost(h)).filter(Boolean) : [];
    const days = Array.isArray(raw && raw.days) ? raw.days.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6) : [];
    return {
        id: raw && raw.id ? String(raw.id) : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: (raw && raw.name ? String(raw.name) : 'Schedule').trim(),
        hosts,
        days,
        start: raw && raw.start ? String(raw.start) : '09:00',
        end: raw && raw.end ? String(raw.end) : '17:00',
        enabled: raw && raw.enabled !== false
    };
}

function normalizePreset(raw) {
    return {
        id: raw && raw.id ? String(raw.id) : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: (raw && raw.name ? String(raw.name) : 'Preset').trim(),
        hosts: Array.isArray(raw && raw.hosts) ? raw.hosts.map((h) => normalizeHost(h)).filter(Boolean) : []
    };
}

function enforceLockedHostsInOpenTabs(now = Date.now()) {
    const lockedHosts = new Set();
    Object.entries(locks || {}).forEach(([h, until]) => {
        if (Number(until) > now) {
            const nh = normalizeHost(h);
            if (nh) lockedHosts.add(nh);
        }
    });
    if (!lockedHosts.size) return;

    chrome.tabs.query({}, (tabs) => {
        (tabs || []).forEach((tab) => {
            const url = tab && (tab.url || tab.pendingUrl) ? (tab.url || tab.pendingUrl) : '';
            if (!url || url.startsWith('chrome-extension://') || url.startsWith('chrome://') || url.startsWith('about:')) return;
            const tabHost = normalizeHost(url);
            if (!tabHost) return;
            const covered = Array.from(lockedHosts).some((lockedHost) => (
                tabHost === lockedHost || tabHost.endsWith(`.${lockedHost}`)
            ));
            if (!covered) return;
            const blockedUrl = chrome.runtime.getURL('src/blocked.html') + '?url=' + encodeURIComponent(url);
            try {
                chrome.tabs.update(tab.id, { url: blockedUrl }, () => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        console.warn('SiteBlocker: failed to redirect locked tab', { tabId: tab.id, url, error: err.message });
                    }
                });
            } catch (e) { /* ignore */ }
        });
    });
}

function removeHostFromAllAutomation(host, cb) {
    try {
        const target = normalizeHost(host || '');
        if (!target) {
            cb({ success: false, error: 'missing host' });
            return;
        }

        chrome.storage.local.get({
            blocked: [],
            locks: {},
            schedules: [],
            timeBudgets: {},
            budgetUsage: { day: '', usage: {} },
            presets: [],
            appliedPresetIds: []
        }, (res) => {
            try {
                const getErr = chrome.runtime.lastError;
                if (getErr) {
                    cb({ success: false, error: getErr.message || 'storage get failed' });
                    return;
                }

                const nextBlocked = (res.blocked || []).map((h) => normalizeHost(h)).filter(Boolean).filter((h) => h !== target);

                const nextLocks = Object.assign({}, res.locks || {});
                delete nextLocks[target];

                const nextBudgets = Object.assign({}, res.timeBudgets || {});
                delete nextBudgets[target];

                const nextBudgetUsage = Object.assign({ day: '', usage: {} }, res.budgetUsage || {});
                nextBudgetUsage.usage = Object.assign({}, nextBudgetUsage.usage || {});
                delete nextBudgetUsage.usage[target];

                const nextSchedules = (Array.isArray(res.schedules) ? res.schedules : [])
                    .map((s) => normalizeSchedule(s))
                    .map((s) => Object.assign({}, s, { hosts: (s.hosts || []).filter((h) => h !== target) }))
                    .filter((s) => (s.hosts || []).length > 0);

                const nextPresets = (Array.isArray(res.presets) ? res.presets : [])
                    .map((p) => ({
                        id: p && p.id ? String(p.id) : '',
                        name: p && p.name ? String(p.name) : 'Preset',
                        hosts: Array.isArray(p && p.hosts) ? p.hosts.map((h) => normalizeHost(h)).filter((h) => h && h !== target) : []
                    }))
                    .filter((p) => p.id && p.hosts.length > 0);
                const validPresetIds = new Set(nextPresets.map((p) => p.id));
                const nextAppliedPresetIds = (Array.isArray(res.appliedPresetIds) ? res.appliedPresetIds : [])
                    .map((id) => String(id))
                    .filter((id) => validPresetIds.has(id));

                blockedHosts = nextBlocked;
                locks = nextLocks;
                schedules = nextSchedules;
                timeBudgets = normalizeTimeBudgets(nextBudgets);
                budgetUsage = nextBudgetUsage;
                presets = nextPresets;
                appliedPresetIds = nextAppliedPresetIds;

                chrome.storage.local.set({
                    blocked: nextBlocked,
                    locks: nextLocks,
                    schedules: nextSchedules,
                    timeBudgets: nextBudgets,
                    budgetUsage: nextBudgetUsage,
                    presets: nextPresets,
                    appliedPresetIds: nextAppliedPresetIds
                }, () => {
                    const setErr = chrome.runtime.lastError;
                    if (setErr) {
                        cb({ success: false, error: setErr.message || 'storage set failed' });
                        return;
                    }
                    updateRules();
                    cb({ success: true });
                });
            } catch (innerErr) {
                cb({ success: false, error: innerErr && innerErr.message ? innerErr.message : 'remove failed' });
            }
        });
    } catch (err) {
        cb({ success: false, error: err && err.message ? err.message : 'remove failed' });
    }
}

function cleanExpiredLocksInMemory(now = Date.now()) {
    let changed = false;
    for (const [h, until] of Object.entries(locks || {})) {
        if (until && now >= until) {
            delete locks[h];
            changed = true;
        }
    }
    return changed;
}

function ensureBudgetDay(now = Date.now()) {
    const day = getLocalDateKey(now);
    if (!budgetUsage || budgetUsage.day !== day) {
        budgetUsage = { day, usage: {} };
        return true;
    }
    if (!budgetUsage.usage || typeof budgetUsage.usage !== 'object') {
        budgetUsage.usage = {};
        return true;
    }
    return false;
}

function recordInsights(delta, now = Date.now()) {
    if (!insightsSettings || insightsSettings.enabled === false) return false;
    const day = getLocalDateKey(now);
    if (!insights || !insights.days || typeof insights.days !== 'object') {
        insights = { days: {} };
    }
    if (!insights.days[day]) {
        insights.days[day] = { blockedAttempts: 0, focusMinutes: 0 };
    }
    insights.days[day].blockedAttempts += Number(delta.blockedAttempts || 0);
    insights.days[day].focusMinutes += Number(delta.focusMinutes || 0);
    insightsMeta = { lastUpdated: now };

    // keep recent 35 days only
    const keys = Object.keys(insights.days).sort();
    if (keys.length > 35) {
        keys.slice(0, keys.length - 35).forEach((k) => delete insights.days[k]);
    }
    return true;
}

function applySchedulesAndBudgets(now = Date.now()) {
    let locksChanged = false;
    let budgetChanged = false;
    let insightsChanged = false;

    // Schedule enforcement: keep extending active schedule locks slightly beyond tick boundary.
    const schedulesNow = (schedules || []).map(normalizeSchedule);
    for (const schedule of schedulesNow) {
        if (!schedule.enabled || !Array.isArray(schedule.hosts) || schedule.hosts.length === 0) continue;
        if (typeof isScheduleActiveAt === 'function' && !isScheduleActiveAt(schedule, now)) continue;
        const scheduleUntil = now + (95 * 1000);
        for (const host of schedule.hosts) {
            const existing = Number(locks[host]) || 0;
            if (scheduleUntil > existing) {
                locks[host] = scheduleUntil;
                locksChanged = true;
            }
        }
    }

    // Daily budget: if user spends X minutes/day on host, lock for rest of day.
    if (ensureBudgetDay(now)) budgetChanged = true;
    const budgetHost = normalizeHost(activeTabHost || '');
    if (budgetHost && timeBudgets && Object.prototype.hasOwnProperty.call(timeBudgets, budgetHost)) {
        const cap = Math.max(0, Number(timeBudgets[budgetHost]) || 0);
        if (cap > 0) {
            const used = Number(budgetUsage.usage[budgetHost] || 0) + 1;
            budgetUsage.usage[budgetHost] = used;
            budgetChanged = true;
            if (used >= cap) {
                const lockUntil = endOfDayTs(now);
                const existing = Number(locks[budgetHost]) || 0;
                if (lockUntil > existing) {
                    locks[budgetHost] = lockUntil;
                    locksChanged = true;
                }
            }
        }
    }

    const hasActiveLocks = Object.values(locks || {}).some((until) => Number(until) > now);
    if (hasActiveLocks) {
        if (recordInsights({ focusMinutes: 1 }, now)) insightsChanged = true;
    }

    if (cleanExpiredLocksInMemory(now)) locksChanged = true;

    if (locksChanged) {
        chrome.storage.local.set({ locks });
        updateRules();
        enforceLockedHostsInOpenTabs(now);
    } else if (hasActiveLocks) {
        // Keep enforcing active locks for already-open tabs even when lock timestamps did not change.
        enforceLockedHostsInOpenTabs(now);
    }
    if (budgetChanged) chrome.storage.local.set({ budgetUsage });
    if (insightsChanged) chrome.storage.local.set({ insights, insightsMeta });
}

function refreshActiveTabHost(done) {
    try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const t = tabs && tabs[0];
            const url = t && t.url ? t.url : '';
            activeTabHost = normalizeHost(url || '');
            if (typeof done === 'function') done(activeTabHost);
        });
    } catch (e) {
        activeTabHost = '';
        if (typeof done === 'function') done(activeTabHost);
    }
}

function runAutomationTick(now = Date.now()) {
    refreshActiveTabHost(() => {
        applySchedulesAndBudgets(now);
    });
}

function getActiveHosts() {
    const now = Date.now();
    const hosts = new Set((blockedHosts || []).map((h) => {
        try {
            if (typeof normalizeHost === 'function') return normalizeHost(h);
            return (h || '').toString().trim().toLowerCase();
        } catch (e) { return ''; }
    }).filter(Boolean));
    const appliedIds = new Set((appliedPresetIds || []).map((id) => String(id)));
    (presets || []).forEach((preset) => {
        if (!preset || !appliedIds.has(String(preset.id))) return;
        (preset.hosts || []).forEach((host) => {
            const nh = normalizeHost(host);
            if (nh) hosts.add(nh);
        });
    });
    for (const [h, until] of Object.entries(locks || {})) {
        try {
            const nh = (typeof normalizeHost === 'function') ? normalizeHost(h) : (h || '').toString().toLowerCase();
            if (until && now < until) hosts.add(nh);
        } catch (e) { /* ignore malformed lock keys */ }
    }
    return Array.from(hosts);
}

function makeRule(host, explicitId) {
    try {
        const raw = (typeof host === 'string' || typeof host === 'number') ? String(host) : '';
        const safeHost = (typeof normalizeHost === 'function') ? normalizeHost(raw) : raw.replace(/^\.+|\.+$/g, '');
        // Use deterministic id when possible (stableId), allow explicit id to be provided
        let id = typeof explicitId === 'number' ? explicitId : (typeof stableId === 'function' ? stableId(safeHost) : Math.floor(Math.random() * 1000000) + 1);
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
    // Sort hosts to ensure deterministic rule ordering
    const hosts = getActiveHosts().slice().sort();
    const usedIds = new Set();
    const newRules = [];
    for (const h of hosts) {
        // derive deterministic id and avoid collisions by bumping
        let baseId = (typeof stableId === 'function') ? stableId(h) : Math.floor(Math.random() * 1000000) + 1;
        let id = baseId;
        while (usedIds.has(id)) {
            id = id + 1;
        }
        usedIds.add(id);
        newRules.push(makeRule(h, id));
    }
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

try {
    chrome.alarms.create('automationTick', { periodInMinutes: 1 });
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (!alarm || alarm.name !== 'automationTick') return;
        runAutomationTick(Date.now());
    });
} catch (e) {
    console.warn('SiteBlocker: alarms unavailable, falling back to interval tick', e);
    setInterval(() => {
        runAutomationTick(Date.now());
    }, 60 * 1000);
}

if (chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(() => {
        runAutomationTick(Date.now());
    });
}
if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
        if (changeInfo && changeInfo.status === 'complete') {
            runAutomationTick(Date.now());
        }
    });
}

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
            updateRules();
            enforceLockedHostsInOpenTabs(Date.now());
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
                updateRules();
                console.debug('SiteBlocker: stopped lock for', host);
                cb({ success: true });
            });
            return true;
        }
        console.debug('SiteBlocker: stopLock failed, not locked', host);
        cb({ success: false, error: 'not locked' });
        return;
    }
    if (msg.action === 'removeHostEverywhere') {
        removeHostFromAllAutomation(msg.host, (result) => {
            cb(result || { success: false, error: 'remove failed' });
        });
        return true;
    }
    if (msg.action === 'blockedAttempt') {
        if (recordInsights({ blockedAttempts: 1 }, Date.now())) {
            chrome.storage.local.set({ insights, insightsMeta }, () => cb({ success: true }));
            return true;
        }
        cb({ success: true });
        return;
    }
});

// Helpful startup log
console.debug('SiteBlocker: background worker started');

chrome.runtime.onInstalled.addListener(() => {
    loadBlockedHosts();
    loadLocks();
    loadAutomationState();
    runAutomationTick(Date.now());
});

// initial load
loadBlockedHosts();
loadLocks();
loadAutomationState();
runAutomationTick(Date.now());

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
                try {
                    // prefer normalizeHost when available to keep normalization consistent
                    if (typeof normalizeHost === 'function') {
                        host = normalizeHost(url);
                    } else {
                        host = (new URL(url)).hostname.replace(/^www\./, '').toLowerCase();
                    }
                } catch (e) { return; }
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
