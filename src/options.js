function normalizeHost(input) {
    try {
        if (!input) return '';
        input = input.trim().toLowerCase();
        // if user pasted a full URL, extract hostname
        if (input.includes('://')) {
            const url = new URL(input);
            return url.hostname.replace(/^www\./, '');
        }
        // remove path if present
        input = input.split('/')[0];
        input = input.replace(/^www\./, '');
        return input;
    } catch (e) {
        return '';
    }
}

function render(list) {
    const ul = document.getElementById('list');
    ul.innerHTML = '';
    chrome.storage.local.get({ locks: {} }, (r) => {
        const locks = r.locks || {};
        list.forEach((host, idx) => {
            const li = document.createElement('li');
            const span = document.createElement('span');
            span.className = 'host';
            span.textContent = host;

            const lockInfo = document.createElement('span');
            const now = Date.now();
            const until = locks[host];
            if (until && now < until) {
                lockInfo.className = 'locked';
                const remaining = Math.ceil((until - now) / 1000);
                lockInfo.textContent = `Locked (${remaining}s)`;
            }

            const lockBtn = document.createElement('button');
            lockBtn.className = 'lock';
            lockBtn.textContent = 'Lock';
            lockBtn.addEventListener('click', () => {
                const minutes = prompt('Lock duration in minutes (default 5):', '5');
                const m = Number(minutes) || 5;
                chrome.runtime.sendMessage({ action: 'startLock', host, minutes: m }, (res) => {
                    if (res && res.success) {
                        render(list);
                    } else {
                        alert('Failed to start lock');
                    }
                });
            });

            const unlockBtn = document.createElement('button');
            unlockBtn.className = 'lock';
            unlockBtn.textContent = 'Unlock';
            unlockBtn.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'stopLock', host }, (res) => {
                    if (res && res.success) {
                        render(list);
                    } else {
                        alert('No active lock for this host');
                    }
                });
            });

            const btn = document.createElement('button');
            btn.className = 'remove';
            btn.textContent = 'Remove';
            btn.addEventListener('click', () => {
                // prevent removal if locked
                if (locks[host] && Date.now() < locks[host]) {
                    return alert('This site is currently locked and cannot be removed');
                }
                list.splice(idx, 1);
                save(list);
                render(list);
            });

            li.appendChild(span);
            if (lockInfo.textContent) li.appendChild(lockInfo);
            li.appendChild(lockBtn);
            li.appendChild(unlockBtn);
            li.appendChild(btn);
            ul.appendChild(li);
        });
    });
}

function save(list) {
    chrome.storage.local.set({ blocked: list });
}

function loadAndRender() {
    chrome.storage.local.get({ blocked: [] }, (res) => {
        const list = res.blocked || [];
        render(list);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadAndRender();
    const addBtn = document.getElementById('addBtn');
    const input = document.getElementById('domainInput');
    addBtn.addEventListener('click', () => {
        const host = normalizeHost(input.value);
        if (!host) return alert('Please enter a valid domain or URL');
        chrome.storage.local.get({ blocked: [] }, (res) => {
            const list = res.blocked || [];
            if (!list.includes(host)) {
                list.push(host);
                save(list);
                render(list);
                input.value = '';
            } else {
                alert('Domain already in list');
            }
        });
    });
    // re-render when storage changes (blocked list or locks)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && (changes.blocked || changes.locks)) {
            loadAndRender();
        }
    });
    // refresh countdown every second
    setInterval(() => {
        loadAndRender();
    }, 1000);
});
