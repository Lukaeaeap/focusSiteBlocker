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

document.addEventListener('DOMContentLoaded', async () => {
    const hostEl = document.getElementById('host');
    const blockBtn = document.getElementById('blockBtn');
    const lockBtn = document.getElementById('lockBtn');
    const optionsBtn = document.getElementById('optionsBtn');
    const unblockBtn = document.getElementById('unblockBtn');
    const unlockBtn = document.getElementById('unlockBtn');
    const statusEl = document.getElementById('status');
    const msgEl = document.getElementById('msg');

    const host = await getActiveHost();
    if (!host) {
        hostEl.textContent = 'No site detected';
        blockBtn.disabled = true;
        lockBtn.disabled = true;
        return;
    }
    hostEl.textContent = host;

    // update UI state for this host
    async function updateState() {
        return new Promise((resolve) => {
            chrome.storage.local.get({ blocked: [], locks: {} }, (res) => {
                const blocked = res.blocked || [];
                const locks = res.locks || {};
                const isBlocked = blocked.includes(host);
                const until = locks[host];
                const now = Date.now();
                const isLocked = !!(until && now < until);

                blockBtn.disabled = isBlocked;
                unblockBtn.disabled = !isBlocked;
                lockBtn.disabled = isLocked;
                unlockBtn.disabled = !isLocked;

                if (isLocked) {
                    const remain = Math.max(0, Math.ceil((until - now) / 1000));
                    const m = Math.floor(remain / 60);
                    const s = remain % 60;
                    statusEl.textContent = `Locked — ${m}m ${s}s remaining`;
                    lockBtn.textContent = `Locked (${m}m${s}s)`;
                } else if (isBlocked) {
                    statusEl.textContent = 'This site is in your blocklist';
                    lockBtn.textContent = 'Lock 5m';
                } else {
                    statusEl.textContent = '';
                    lockBtn.textContent = 'Lock 5m';
                }
                resolve();
            });
        });
    }

    await updateState();

    blockBtn.addEventListener('click', () => {
        chrome.storage.local.get({ blocked: [] }, (res) => {
            const list = res.blocked || [];
            if (!list.includes(host)) {
                list.push(host);
                chrome.storage.local.set({ blocked: list }, () => {
                    showMsg('Blocked ' + host);
                    updateState();
                });
            } else {
                showMsg('Already blocked', 'orange');
            }
        });
    });

    const unblockBtn = document.getElementById('unblockBtn');
    unblockBtn.addEventListener('click', () => {
        chrome.storage.local.get({ blocked: [] }, (res) => {
            const list = res.blocked || [];
            const idx = list.indexOf(host);
                updateState();
                list.splice(idx, 1);
                chrome.storage.local.set({ blocked: list }, () => {
                    showMsg('Unblocked ' + host);
                    updateState();
                });
            } else {
                showMsg('Not in blocked list', 'orange');
            }
        });
    });

    lockBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'startLock', host, minutes: 5 }, (res) => {
            if (res && res.success) {
                showMsg('Locked for 5 minutes');
            } else {
                showMsg('Failed to lock', 'red');
            }
        });
    });

    const unlockBtn = document.getElementById('unlockBtn');
    unlockBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stopLock', host }, (res) => {
            if (res && res.success) {
                showMsg('Lock stopped');
            } else {
                showMsg('No active lock', 'orange');
            }
        });
    });

    optionsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
});
