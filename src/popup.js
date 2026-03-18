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
            resolve(normalizeHost(url));
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const hostEl = document.getElementById('host');
    const blockBtn = document.getElementById('blockBtn');
    const lockBtn = document.getElementById('lockBtn');
    const optionsBtn = document.getElementById('optionsBtn');

    const host = await getActiveHost();
    if (!host) {
        hostEl.textContent = 'No site detected';
        blockBtn.disabled = true;
        lockBtn.disabled = true;
        return;
    }
    hostEl.textContent = host;

    blockBtn.addEventListener('click', () => {
        chrome.storage.local.get({ blocked: [] }, (res) => {
            const list = res.blocked || [];
            if (!list.includes(host)) {
                list.push(host);
                chrome.storage.local.set({ blocked: list }, () => {
                    showMsg('Blocked ' + host);
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
            if (idx !== -1) {
                list.splice(idx, 1);
                chrome.storage.local.set({ blocked: list }, () => {
                    showMsg('Unblocked ' + host);
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
