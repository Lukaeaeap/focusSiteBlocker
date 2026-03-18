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

function updateLockInfo() {
    if (!host) return;
    chrome.storage.local.get({ locks: {} }, (res) => {
        const locks = res.locks || {};
        const until = locks[host];
        if (until && Date.now() < until) {
            const remain = Math.max(0, Math.ceil((until - Date.now()) / 1000));
            const m = Math.floor(remain / 60);
            const s = remain % 60;
            lockInfoEl.textContent = `Locked for ${m}m ${s}s more.`;
        } else {
            lockInfoEl.textContent = '';
        }
    });
}

updateLockInfo();
setInterval(updateLockInfo, 1000);

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
let holdTimer = null;
let held = false;
function clearHold() {
    if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
    }
    held = false;
    optionsLink.textContent = 'Open Options';
}

function beginHold() {
    clearHold();
    optionsLink.textContent = 'Hold to open settings...';
    holdTimer = setTimeout(() => {
        held = true;
        optionsLink.textContent = 'Release to open settings';
    }, 1200);
}

function tryOpenOptions() {
    clearHold();
    if (held) {
        window.location.href = chrome.runtime.getURL('src/options.html');
    }
}

optionsLink.addEventListener('click', (e) => {
    // prevent normal click — require hold
    e.preventDefault();
});
optionsLink.addEventListener('mousedown', beginHold);
optionsLink.addEventListener('touchstart', beginHold);
document.addEventListener('mouseup', tryOpenOptions);
document.addEventListener('touchend', tryOpenOptions);
optionsLink.addEventListener('mouseleave', clearHold);
