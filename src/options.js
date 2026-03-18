// `normalizeHost` and `formatCompactDuration` are provided by `lib.js`.

const FEEDBACK_URL = 'https://github.com/Lukaeaeap/focusSiteBlocker/issues/new?labels=feedback&title=Feedback%3A%20';

let currentList = [];
let currentLocks = {};
const lockLabelByHost = new Map();

function normalizeLocks(rawLocks) {
    const out = {};
    Object.entries(rawLocks || {}).forEach(([k, v]) => {
        const nh = normalizeHost(k);
        if (!nh) return;
        out[nh] = Math.max(out[nh] || 0, Number(v) || 0);
    });
    return out;
}

function save(list) {
    chrome.storage.local.set({ blocked: list });
}

function renderRuleStatus(list, locks, err) {
    const RULE_LIMIT = 5000;
    const WARN_THRESHOLD = Math.floor(RULE_LIMIT * 0.9);
    const errEl = document.getElementById('ruleError');
    const ruleCountEl = document.getElementById('ruleCount');
    const now = Date.now();

    const active = new Set((list || []).map((h) => normalizeHost(h)).filter(Boolean));
    Object.entries(locks || {}).forEach(([h, until]) => {
        if (until && now < until) active.add(h);
    });

    const count = active.size;
    ruleCountEl.textContent = `Active rules: ${count}`;

    if (count >= RULE_LIMIT) {
        errEl.style.display = 'block';
        errEl.textContent = `Too many rules (${count}). DNR cap reached. Reduce blocklist.`;
    } else if (count >= WARN_THRESHOLD) {
        errEl.style.display = 'block';
        errEl.textContent = `Approaching DNR rule limit: ${count}/${RULE_LIMIT}. Consider reducing list.`;
    } else if (err) {
        errEl.style.display = 'block';
        errEl.textContent = err;
    } else {
        errEl.style.display = 'none';
        errEl.textContent = '';
    }
}

function updateLockCountdowns() {
    const now = Date.now();
    lockLabelByHost.forEach((labelEl, host) => {
        const until = Number(currentLocks[host]) || 0;
        if (until && now < until) {
            const remaining = Math.max(0, Math.ceil((until - now) / 1000));
            labelEl.textContent = `Locked (${formatCompactDuration(remaining)})`;
            labelEl.style.display = 'inline';
        } else {
            labelEl.textContent = '';
            labelEl.style.display = 'none';
        }
    });
}

function render(list) {
    const ul = document.getElementById('list');
    ul.innerHTML = '';
    lockLabelByHost.clear();

    list.forEach((host, idx) => {
        const nhost = normalizeHost(host) || host;
        const li = document.createElement('li');
        const left = document.createElement('div');
        const span = document.createElement('span');
        span.className = 'host';
        span.textContent = host;
        left.appendChild(span);

        left.appendChild(document.createTextNode(' '));
        const lockInfo = document.createElement('span');
        lockInfo.className = 'locked';
        lockInfo.style.display = 'none';
        left.appendChild(lockInfo);
        lockLabelByHost.set(nhost, lockInfo);

        const actions = document.createElement('div');
        actions.className = 'controls';

        const lockBtn = document.createElement('button');
        lockBtn.className = 'lock';
        lockBtn.textContent = 'Lock';
        lockBtn.addEventListener('click', () => {
            const minutes = prompt('Lock duration in minutes (default 5):', '5');
            const m = Number(minutes) || 5;
            chrome.runtime.sendMessage({ action: 'startLock', host: nhost, minutes: m }, (res) => {
                if (res && res.success) {
                    loadAndRender();
                } else {
                    alert('Failed to start lock');
                }
            });
        });

        const unlockBtn = document.createElement('button');
        unlockBtn.className = 'lock';
        unlockBtn.textContent = 'Unlock';
        unlockBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'stopLock', host: nhost }, (res) => {
                if (res && res.success) {
                    loadAndRender();
                } else {
                    alert('No active lock for this host');
                }
            });
        });

        const btn = document.createElement('button');
        btn.className = 'remove';
        btn.textContent = 'Remove';
        btn.addEventListener('click', () => {
            if (currentLocks[nhost] && Date.now() < currentLocks[nhost]) {
                return alert('This site is currently locked and cannot be removed');
            }

            const confirmText = prompt(`Type the domain to confirm removal:\n${host}`);
            if (!confirmText) return;
            if (confirmText.trim().toLowerCase() !== host.toLowerCase()) {
                return alert('Confirmation did not match. Removal cancelled.');
            }

            const next = currentList.slice();
            next.splice(idx, 1);
            save(next);
            loadAndRender();
        });

        actions.appendChild(lockBtn);
        actions.appendChild(unlockBtn);
        actions.appendChild(btn);

        li.appendChild(left);
        li.appendChild(actions);
        ul.appendChild(li);
    });

    updateLockCountdowns();
}

function loadAndRender() {
    chrome.storage.local.get({ blocked: [], ruleError: '', locks: {} }, (res) => {
        currentList = (res.blocked || []).slice();
        currentLocks = normalizeLocks(res.locks || {});
        renderRuleStatus(currentList, currentLocks, res.ruleError || '');
        render(currentList);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('addBtn');
    const input = document.getElementById('domainInput');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    const feedbackBtn = document.getElementById('feedbackBtn');

    loadAndRender();

    addBtn.addEventListener('click', () => {
        const host = normalizeHost(input.value);
        if (!host) return alert('Please enter a valid domain or URL');

        chrome.storage.local.get({ blocked: [] }, (res) => {
            const list = res.blocked || [];
            if (!list.includes(host)) {
                list.push(host);
                save(list);
                input.value = '';
                loadAndRender();
            } else {
                alert('Domain already in list');
            }
        });
    });

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

    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const json = JSON.parse(reader.result);
                const fileBlocked = Array.isArray(json.blocked) ? json.blocked.map((b) => (b || '').toString()) : [];
                const fileLocks = (json.locks && typeof json.locks === 'object') ? json.locks : {};

                chrome.storage.local.get({ blocked: [], locks: {} }, (cur) => {
                    const merged = new Set((cur.blocked || []).concat(fileBlocked).map(normalizeHost).filter(Boolean));
                    const newBlocked = Array.from(merged);
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
        importFile.value = '';
    });

    if (feedbackBtn) {
        feedbackBtn.addEventListener('click', () => {
            try {
                window.open(FEEDBACK_URL, '_blank', 'noopener,noreferrer');
            } catch (e) {
                window.location.href = FEEDBACK_URL;
            }
        });
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && (changes.blocked || changes.locks || changes.ruleError)) {
            loadAndRender();
        }
    });

    // Update countdown text in place to avoid list flicker.
    setInterval(updateLockCountdowns, 1000);
});
