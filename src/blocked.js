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
const motivationEl = document.getElementById('motivation');
let lockUntil = 0;

const MESSAGES = {
    gentle: [
        'Take a breath. You chose focus for a reason.',
        'A small pause now helps the rest of your day.',
        'Return to what matters most right now.'
    ],
    coach: [
        'Protect this hour. Your goals need consistency.',
        'You are in control. Stay on the planned task.',
        'Momentum beats distraction. Keep going.'
    ],
    minimal: [
        'Blocked. Continue your focus session.',
        'Not now. Back to your task.',
        'Focus mode is active.'
    ]
};

function pickMessage(tone) {
    const list = MESSAGES[tone] || MESSAGES.gentle;
    return list[Math.floor(Math.random() * list.length)];
}

function applyBlockedExperience() {
    chrome.storage.local.get({ blockedExperience: { tone: 'gentle', style: 'nature' } }, (res) => {
        const cfg = res.blockedExperience || {};
        const tone = cfg.tone || 'gentle';
        const style = cfg.style || 'nature';

        document.body.classList.remove('theme-dawn', 'theme-ocean');
        if (style === 'dawn') document.body.classList.add('theme-dawn');
        if (style === 'ocean') document.body.classList.add('theme-ocean');

        if (motivationEl) motivationEl.textContent = pickMessage(tone);
    });
}

function reportBlockedAttempt() {
    try {
        chrome.runtime.sendMessage({ action: 'blockedAttempt', host: host || '' }, () => {
            // no-op callback for fire-and-forget event recording
            void chrome.runtime.lastError;
        });
    } catch (e) {
        // ignore best-effort analytics event failures
    }
}

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
applyBlockedExperience();
reportBlockedAttempt();

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
