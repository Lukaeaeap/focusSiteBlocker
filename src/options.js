// `normalizeHost` is provided by `lib.js` (included before this script)

function render(list) {
    const ul = document.getElementById('list');
    ul.innerHTML = '';
    chrome.storage.local.get({ locks: {} }, (r) => {
        const locks = r.locks || {};
        list.forEach((host, idx) => {
            const li = document.createElement('li');
            const left = document.createElement('div');
            const span = document.createElement('span');
            span.className = 'host';
            span.textContent = host;
            left.appendChild(span);

            const lockInfo = document.createElement('span');
            const now = Date.now();
            const until = locks[host];
            if (until && now < until) {
                lockInfo.className = 'locked';
                const remaining = Math.ceil((until - now) / 1000);
                lockInfo.textContent = `Locked (${remaining}s)`;
                left.appendChild(lockInfo);
            }

            const actions = document.createElement('div');
            actions.className = 'controls';

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
                // require typing the host to confirm removal to avoid accidental deletes
                const confirmText = prompt(`Type the domain to confirm removal:\n${host}`);
                if (!confirmText) return;
                if (confirmText.trim().toLowerCase() !== host.toLowerCase()) {
                    return alert('Confirmation did not match. Removal cancelled.');
                }
                list.splice(idx, 1);
                save(list);
                render(list);
            });

            actions.appendChild(lockBtn);
            actions.appendChild(unlockBtn);
            actions.appendChild(btn);

            li.appendChild(left);
            li.appendChild(actions);
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
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
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

    // Export current blocked list and locks as JSON
    exportBtn.addEventListener('click', () => {
        chrome.storage.local.get({ blocked: [], locks: {} }, (res) => {
            const payload = { blocked: res.blocked || [], locks: res.locks || {} };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            a.href = url;
            a.download = `siteblocker-export-${ts}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        });
    });

    // Import JSON file — either replace or merge
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const json = JSON.parse(reader.result);
                const fileBlocked = Array.isArray(json.blocked) ? json.blocked.map(b => (b || '').toString()) : [];
                const fileLocks = (json.locks && typeof json.locks === 'object') ? json.locks : {};
                const replace = confirm('Replace existing blocked list with imported list? OK = replace, Cancel = merge');
                chrome.storage.local.get({ blocked: [], locks: {} }, (cur) => {
                    let newBlocked = [];
                    if (replace) {
                        newBlocked = Array.from(new Set(fileBlocked.map(normalizeHost).filter(Boolean)));
                    } else {
                        const merged = new Set((cur.blocked || []).concat(fileBlocked).map(normalizeHost).filter(Boolean));
                        newBlocked = Array.from(merged);
                    }
                    const newLocks = Object.assign({}, cur.locks || {}, fileLocks || {});
                    chrome.storage.local.set({ blocked: newBlocked, locks: newLocks }, () => {
                        loadAndRender();
                        alert('Import successful');
                    });
                });
            } catch (e) {
                alert('Failed to parse JSON file');
            }
        };
        reader.readAsText(f);
        // clear input so same file can be re-imported if needed
        importFile.value = '';
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
