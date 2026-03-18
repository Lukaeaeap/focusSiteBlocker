// `normalizeHost` is provided by `lib.js` (included before this script)

function showMsg(text, color = 'green') {
    const el = document.getElementById('msg');
    el.style.color = color;
    el.textContent = text;
    setTimeout(() => el.textContent = '', 3000);
}

async function getActiveHost() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || !tabs[0]) return resolve('');
            const url = tabs[0].url || '';
            // If the active tab is the extension's blocked page, it carries the original target
            // in the `url` query parameter; prefer that host instead of the extension id.
            try {
                const u = new URL(url);
                if ((u.protocol === 'chrome-extension:' || u.protocol === 'moz-extension:') && u.pathname.includes('blocked.html')) {
                    const orig = u.searchParams.get('url') || '';
                    if (orig) return resolve(normalizeHost(orig));
                }
            } catch (e) {
                // fall through to normal normalization
            }
            resolve(normalizeHost(url));
        });
    });
}

function redirectActiveTabToBlockedIfMatches(host) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab || !tab.id) return;
        const url = tab.url || tab.pendingUrl || '';
        if (!url) return;
        if (normalizeHost(url) !== host) return;
        const blockedUrl = chrome.runtime.getURL('src/blocked.html') + '?url=' + encodeURIComponent(url);
        try {
            chrome.tabs.update(tab.id, { url: blockedUrl });
        } catch (e) {
            // ignore redirect errors in popup context
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const hostEl = document.getElementById('host');
    const blockBtn = document.getElementById('blockBtn');
    const unblockBtn = document.getElementById('unblockBtn');
    const lockBtn = document.getElementById('lockBtn');
    const unlockBtn = document.getElementById('unlockBtn');
    const optionsBtn = document.getElementById('optionsBtn');
    const statusEl = document.getElementById('status');
    const sessionInfoEl = document.getElementById('sessionInfo');
    const budgetInfoEl = document.getElementById('budgetInfo');

    const host = await getActiveHost();
    if (!host) {
        hostEl.textContent = 'No site detected';
        blockBtn.disabled = true;
        lockBtn.disabled = true;
        unblockBtn.disabled = true;
        unlockBtn.disabled = true;
        return;
    }
    hostEl.textContent = host;

    function updateState() {
        chrome.storage.local.get({ blocked: [], locks: {}, timeBudgets: {}, budgetUsage: { day: '', usage: {}, minuteMarks: {} }, presets: [], appliedPresetIds: [] }, (res) => {
            const blocked = res.blocked || [];
            const locks = res.locks || {};
            const budgets = res.timeBudgets || {};
            const budgetUsage = res.budgetUsage || { day: '', usage: {}, minuteMarks: {} };
            const presets = Array.isArray(res.presets) ? res.presets : [];
            const appliedIds = new Set((Array.isArray(res.appliedPresetIds) ? res.appliedPresetIds : []).map((id) => String(id)));

            const activeSessionsForHost = presets
                .filter((preset) => appliedIds.has(String(preset && preset.id ? preset.id : '')))
                .filter((preset) => Array.isArray(preset && preset.hosts) && preset.hosts.map((h) => normalizeHost(h)).includes(host))
                .map((preset) => (preset && preset.name ? String(preset.name).trim() : 'Session'));

            const manualBlocked = blocked.includes(host);
            const sessionBlocked = activeSessionsForHost.length > 0;
            const isBlocked = manualBlocked || sessionBlocked;
            const until = locks[host];
            const now = Date.now();
            const isLocked = !!(until && now < until);

            blockBtn.disabled = manualBlocked;
            unblockBtn.disabled = !isBlocked;
            lockBtn.disabled = isLocked;
            unlockBtn.disabled = !isLocked;

            if (isLocked) {
                const remain = Math.max(0, Math.ceil((until - now) / 1000));
                const compact = formatCompactDuration(remain);
                statusEl.textContent = `Locked - ${compact} remaining`;
                lockBtn.textContent = `Locked (${compact})`;
            } else if (isBlocked) {
                statusEl.textContent = manualBlocked
                    ? 'This site is in your blocklist'
                    : 'This site is blocked by an active session';
                lockBtn.textContent = 'Lock 5m';
            } else {
                statusEl.textContent = '';
                lockBtn.textContent = 'Lock 5m';
            }

            if (sessionInfoEl) {
                if (activeSessionsForHost.length) {
                    sessionInfoEl.textContent = `Sessions active here: ${activeSessionsForHost.join(', ')}`;
                } else {
                    sessionInfoEl.textContent = 'Sessions active here: none';
                }
            }

            if (budgetInfoEl) {
                const day = getLocalDateKey(Date.now());
                const cap = Math.max(0, Number(budgets[host]) || 0);
                const usedMap = budgetUsage.day === day ? (budgetUsage.usage || {}) : {};
                const used = Math.max(0, Number(usedMap[host]) || 0);
                if (cap > 0) {
                    const left = Math.max(0, cap - used);
                    budgetInfoEl.textContent = `Budget left today: ${left}m (${used}/${cap} used)`;
                } else {
                    budgetInfoEl.textContent = '';
                }
            }
        });
    }

    updateState();
    // refresh countdown every second while popup is open
    const interval = setInterval(updateState, 1000);

    blockBtn.addEventListener('click', () => {
        chrome.storage.local.get({ blocked: [] }, (res) => {
            const list = res.blocked || [];
            if (!list.includes(host)) {
                list.push(host);
                chrome.storage.local.set({ blocked: list }, () => {
                    showMsg('Blocked ' + host);
                    redirectActiveTabToBlockedIfMatches(host);
                    updateState();
                });
            } else {
                showMsg('Already blocked', 'orange');
            }
        });
    });

    unblockBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'removeHostEverywhere', host }, (res) => {
            const msgErr = chrome.runtime.lastError;
            if (msgErr) {
                showMsg(`Failed to remove rules: ${msgErr.message || 'message error'}`, 'red');
                return;
            }
            if (res && res.success) {
                showMsg('Unblocked everywhere: ' + host);
                updateState();
            } else {
                showMsg(`Failed to remove all rules: ${(res && res.error) ? res.error : 'unknown error'}`, 'red');
            }
        });
    });

    lockBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'startLock', host, minutes: 5 }, (res) => {
            if (res && res.success) {
                showMsg('Locked for 5 minutes');
                updateState();
            } else {
                showMsg('Failed to lock', 'red');
            }
        });
    });

    unlockBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stopLock', host }, (res) => {
            if (res && res.success) {
                showMsg('Lock stopped');
                updateState();
            } else {
                showMsg('No active lock', 'orange');
            }
        });
    });

    optionsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    window.addEventListener('unload', () => clearInterval(interval));
});
