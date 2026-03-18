function getQueryParam(name) {
    const params = new URLSearchParams(location.search);
    return params.get(name);
}

let orig = getQueryParam('url');
// prefer explicit ?url= param; otherwise use document.referrer when it's a normal web origin
if (!orig && document.referrer) {
    const ref = document.referrer || '';
    if (!ref.startsWith('chrome-extension:') && !ref.startsWith('chrome-error:') && !ref.startsWith('about:')) {
        orig = ref;
    }
}

// Display a friendly label when original URL/host cannot be determined
if (orig) {
    const displayHost = hostnameOf(orig) || orig;
    document.getElementById('orig').textContent = `Attempted: ${displayHost}`;
} else {
    document.getElementById('orig').textContent = 'Attempted: Blocked site';
}

function hostnameOf(u) {
    try {
        return (new URL(u)).hostname.replace(/^www\./, '');
    } catch (e) {
        return '';
    }
}

const host = hostnameOf(orig || '');
const lockInfoEl = document.getElementById('lockInfo');
let lockUntil = 0;

function updateLockInfo() {
    if (!host || !lockInfoEl) return;
    if (lockUntil && Date.now() < lockUntil) {
        const remain = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
        lockInfoEl.textContent = `Locked for ${formatCompactDuration(remain)} more.`;
    } else {
        lockInfoEl.textContent = '';
    }
}

function refreshLockUntilFromStorage() {
    if (!host) return;
    chrome.storage.local.get({ locks: {} }, (res) => {
        const locks = res.locks || {};
        lockUntil = Number(locks[host]) || 0;
        updateLockInfo();
    });
}

refreshLockUntilFromStorage();
setInterval(updateLockInfo, 1000);

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.locks || !host) return;
    const newLocks = (changes.locks.newValue || {});
    lockUntil = Number(newLocks[host]) || 0;
    updateLockInfo();
});

function goBackOrCloseTab() {
    // First attempt browser history navigation.
    if (window.history.length > 1) {
        window.history.back();
        return;
    }

    // If no history is available, close this tab (extension page context).
    if (chrome.tabs && chrome.tabs.getCurrent) {
        chrome.tabs.getCurrent((tab) => {
            if (tab && tab.id !== undefined) {
                chrome.tabs.remove(tab.id);
            } else {
                window.location.href = 'about:blank';
            }
        });
        return;
    }

    // Final fallback.
    window.location.href = 'about:blank';
}

document.getElementById('home').addEventListener('click', (e) => {
    e.preventDefault();
    goBackOrCloseTab();
});

const optionsLink = document.getElementById('optionsLink');
if (optionsLink) {
    optionsLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });
}
