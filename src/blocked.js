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
if (optionsLink) {
    optionsLink.addEventListener('click', (e) => {
        e.preventDefault();
        // Open options directly
        try {
            window.location.href = chrome.runtime.getURL('src/options.html');
        } catch (err) {
            // fallback for non-extension contexts
            window.location.href = 'src/options.html';
        }
    });
}
