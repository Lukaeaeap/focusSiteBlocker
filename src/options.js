// `normalizeHost`, `formatCompactDuration` and `getLocalDateKey` are provided by `lib.js`.

const FEEDBACK_URL = 'https://github.com/Lukaeaeap/focusSiteBlocker/issues/new?labels=feedback&title=Feedback%3A%20';

let currentList = [];
let currentLocks = {};
let currentSchedules = [];
let currentBudgets = {};
let currentBudgetUsage = { day: '', usage: {}, minuteMarks: {} };
let currentPresets = [];
let currentAppliedPresetIds = [];
let currentInsightsSettings = { enabled: true };
let currentInsights = { days: {} };
let currentInsightsMeta = { lastUpdated: 0 };
let currentBlockedExperience = { tone: 'gentle', style: 'nature', card: 'glass', accent: 'forest', density: 'normal' };
const lockLabelByHost = new Map();

function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function setupTabs() {
    const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
    const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
    if (!tabButtons.length || !tabPanels.length) return;

    function activate(tabName) {
        tabButtons.forEach((btn) => {
            const on = btn.dataset.tab === tabName;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        tabPanels.forEach((panel) => {
            const on = panel.id === `tab-${tabName}`;
            panel.classList.toggle('active', on);
        });
    }

    tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => activate(btn.dataset.tab));
    });

    activate('sites');
}

function parseHostsCsv(input) {
    return (input || '')
        .split(',')
        .map((h) => normalizeHost(h))
        .filter(Boolean);
}

function normalizeLocks(rawLocks) {
    const out = {};
    Object.entries(rawLocks || {}).forEach(([k, v]) => {
        const nh = normalizeHost(k);
        if (!nh) return;
        out[nh] = Math.max(out[nh] || 0, Number(v) || 0);
    });
    return out;
}

function normalizeSchedule(raw) {
    return {
        id: raw && raw.id ? String(raw.id) : uid('sch'),
        name: (raw && raw.name ? String(raw.name) : 'Schedule').trim(),
        hosts: Array.isArray(raw && raw.hosts) ? raw.hosts.map((h) => normalizeHost(h)).filter(Boolean) : [],
        days: Array.isArray(raw && raw.days) ? raw.days.map(Number).filter((d) => d >= 0 && d <= 6) : [],
        start: raw && raw.start ? String(raw.start) : '09:00',
        end: raw && raw.end ? String(raw.end) : '17:00',
        enabled: raw && raw.enabled !== false
    };
}

function normalizePreset(raw) {
    return {
        id: raw && raw.id ? String(raw.id) : uid('preset'),
        name: (raw && raw.name ? String(raw.name) : 'Preset').trim(),
        hosts: Array.isArray(raw && raw.hosts) ? raw.hosts.map((h) => normalizeHost(h)).filter(Boolean) : []
    };
}

function normalizeBudgetUsage(raw) {
    const day = getLocalDateKey(Date.now());
    const out = raw && typeof raw === 'object' ? Object.assign({}, raw) : {};
    out.day = typeof out.day === 'string' ? out.day : day;
    out.usage = (out.usage && typeof out.usage === 'object') ? Object.assign({}, out.usage) : {};
    out.minuteMarks = (out.minuteMarks && typeof out.minuteMarks === 'object') ? Object.assign({}, out.minuteMarks) : {};
    return out;
}

function save(patch, cb) {
    chrome.storage.local.set(patch, cb || (() => { }));
}

function removeHostEverywhere(host, onDone) {
    chrome.runtime.sendMessage({ action: 'removeHostEverywhere', host }, (res) => {
        const msgErr = chrome.runtime.lastError;
        if (msgErr) {
            if (onDone) onDone(false, msgErr.message || 'message failed');
            return;
        }
        if (res && res.success) {
            if (onDone) onDone(true, '');
            return;
        }
        if (onDone) onDone(false, (res && res.error) ? String(res.error) : 'unknown error');
    });
}

function renderRuleStatus(list, locks, err) {
    const RULE_LIMIT = 5000;
    const WARN_THRESHOLD = Math.floor(RULE_LIMIT * 0.9);
    const errEl = document.getElementById('ruleError');
    const ruleCountEl = document.getElementById('ruleCount');
    const now = Date.now();

    const active = new Set((list || []).map((h) => normalizeHost(h)).filter(Boolean));
    const appliedIds = new Set((currentAppliedPresetIds || []).map((id) => String(id)));
    (currentPresets || []).forEach((preset) => {
        if (!preset || !appliedIds.has(String(preset.id))) return;
        (preset.hosts || []).forEach((h) => {
            const nh = normalizeHost(h);
            if (nh) active.add(nh);
        });
    });
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

function renderBlockedList(list) {
    const ul = document.getElementById('list');
    ul.innerHTML = '';
    lockLabelByHost.clear();

    list.forEach((host) => {
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
                if (res && res.success) loadAndRender();
                else alert('Failed to start lock');
            });
        });

        const unlockBtn = document.createElement('button');
        unlockBtn.className = 'lock';
        unlockBtn.textContent = 'Unlock';
        unlockBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'stopLock', host: nhost }, (res) => {
                if (res && res.success) loadAndRender();
                else alert('No active lock for this host');
            });
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
            const confirmText = prompt(`Type the domain to confirm removal:\n${host}`);
            if (!confirmText) return;
            if (confirmText.trim().toLowerCase() !== host.toLowerCase()) {
                return alert('Confirmation did not match. Removal cancelled.');
            }
            removeHostEverywhere(nhost, (ok, error) => {
                if (!ok) {
                    // Fallback path: at least remove from manual blocklist to avoid hard lockout.
                    const next = currentList.filter((h) => normalizeHost(h) !== nhost);
                    save({ blocked: next }, () => {
                        loadAndRender();
                        alert(`Removed from blocklist, but full cleanup failed: ${error || 'unknown error'}`);
                    });
                    return;
                }
                loadAndRender();
            });
        });

        actions.appendChild(lockBtn);
        actions.appendChild(unlockBtn);
        actions.appendChild(removeBtn);

        li.appendChild(left);
        li.appendChild(actions);
        ul.appendChild(li);
    });

    updateLockCountdowns();
}

function dayLabel(days) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (days || []).sort((a, b) => a - b).map((d) => names[d] || '?').join(', ');
}

function renderSchedules() {
    const ul = document.getElementById('schedulesList');
    if (!ul) return;
    ul.innerHTML = '';

    if (!currentSchedules.length) {
        const li = document.createElement('li');
        li.textContent = 'No schedules yet';
        ul.appendChild(li);
        return;
    }

    currentSchedules.forEach((s) => {
        const li = document.createElement('li');
        const left = document.createElement('div');
        left.innerHTML = `<strong>${s.name}</strong><div>${s.hosts.join(', ') || '(no hosts)'}</div><div>${dayLabel(s.days)} • ${s.start}-${s.end}</div>`;

        const controls = document.createElement('div');
        controls.className = 'controls';
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = s.enabled ? 'Disable' : 'Enable';
        toggleBtn.addEventListener('click', () => {
            const next = currentSchedules.map((x) => x.id === s.id ? Object.assign({}, x, { enabled: !x.enabled }) : x);
            save({ schedules: next }, loadAndRender);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'remove';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => {
            const next = currentSchedules.filter((x) => x.id !== s.id);
            save({ schedules: next }, loadAndRender);
        });

        controls.appendChild(toggleBtn);
        controls.appendChild(delBtn);
        li.appendChild(left);
        li.appendChild(controls);
        ul.appendChild(li);
    });
}

function renderBudgets() {
    const ul = document.getElementById('budgetsList');
    if (!ul) return;
    ul.innerHTML = '';
    const day = getLocalDateKey(Date.now());
    const usage = (currentBudgetUsage.day === day && currentBudgetUsage.usage) ? currentBudgetUsage.usage : {};

    const entries = Object.entries(currentBudgets || {}).sort((a, b) => a[0].localeCompare(b[0]));
    if (!entries.length) {
        const li = document.createElement('li');
        li.textContent = 'No time budgets yet';
        ul.appendChild(li);
        return;
    }

    entries.forEach(([host, minutes]) => {
        const used = Number(usage[host] || 0);
        const li = document.createElement('li');
        const left = document.createElement('div');
        left.innerHTML = `<strong>${host}</strong><div>${used}/${minutes} min used today</div>`;

        const controls = document.createElement('div');
        controls.className = 'controls';
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
            const next = Object.assign({}, currentBudgets);
            delete next[host];
            save({ timeBudgets: next }, loadAndRender);
        });

        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Reset Today';
        resetBtn.addEventListener('click', () => {
            const dayUsage = Object.assign({}, currentBudgetUsage.usage || {});
            delete dayUsage[host];
            const minuteMarks = Object.assign({}, currentBudgetUsage.minuteMarks || {});
            delete minuteMarks[host];
            const nextUsage = {
                day: getLocalDateKey(Date.now()),
                usage: dayUsage,
                minuteMarks
            };
            save({ budgetUsage: nextUsage }, loadAndRender);
        });

        controls.appendChild(resetBtn);
        controls.appendChild(removeBtn);
        li.appendChild(left);
        li.appendChild(controls);
        ul.appendChild(li);
    });
}

function renderPresets() {
    const ul = document.getElementById('presetsList');
    const activeUl = document.getElementById('activeSessionsList');
    const activeSummary = document.getElementById('activeSessionsSummary');
    if (!ul) return;
    ul.innerHTML = '';
    if (activeUl) activeUl.innerHTML = '';

    const appliedIds = new Set((currentAppliedPresetIds || []).map((id) => String(id)));
    const activePresets = (currentPresets || []).filter((preset) => appliedIds.has(String(preset.id)));

    if (activeSummary) {
        activeSummary.textContent = activePresets.length
            ? `Active sessions: ${activePresets.length}`
            : 'Active sessions: none';
    }

    if (activeUl) {
        if (!activePresets.length) {
            const li = document.createElement('li');
            li.textContent = 'No active sessions right now';
            activeUl.appendChild(li);
        } else {
            activePresets.forEach((preset) => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${preset.name}</strong><div>${preset.hosts.join(', ') || '(no hosts)'}</div>`;
                activeUl.appendChild(li);
            });
        }
    }

    if (!currentPresets.length) {
        const li = document.createElement('li');
        li.textContent = 'No presets yet';
        ul.appendChild(li);
        return;
    }

    currentPresets.forEach((preset) => {
        const isApplied = appliedIds.has(String(preset.id));
        const li = document.createElement('li');
        const left = document.createElement('div');
        left.innerHTML = `<strong>${preset.name}</strong> <span class="pill ${isApplied ? 'on' : ''}">${isApplied ? 'Applied' : 'Not Applied'}</span><div>${preset.hosts.join(', ') || '(no hosts)'}</div>`;

        const controls = document.createElement('div');
        controls.className = 'controls';

        const applyBtn = document.createElement('button');
        applyBtn.textContent = isApplied ? 'Unapply' : 'Apply';
        applyBtn.addEventListener('click', () => {
            const nextApplied = new Set((currentAppliedPresetIds || []).map((id) => String(id)));
            if (isApplied) nextApplied.delete(String(preset.id));
            else nextApplied.add(String(preset.id));
            save({ appliedPresetIds: Array.from(nextApplied) }, loadAndRender);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'remove';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => {
            const next = currentPresets.filter((x) => x.id !== preset.id);
            const nextApplied = (currentAppliedPresetIds || []).filter((id) => String(id) !== String(preset.id));
            save({ presets: next, appliedPresetIds: nextApplied }, loadAndRender);
        });

        controls.appendChild(applyBtn);
        controls.appendChild(delBtn);
        li.appendChild(left);
        li.appendChild(controls);
        ul.appendChild(li);
    });
}

function renderInsights() {
    const day = getLocalDateKey(Date.now());
    const days = (currentInsights && currentInsights.days) ? currentInsights.days : {};
    const today = days[day] || { blockedAttempts: 0, focusMinutes: 0 };

    const past7 = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = getLocalDateKey(d.getTime());
        past7.push(days[key] || { blockedAttempts: 0, focusMinutes: 0 });
    }

    const weekBlocked = past7.reduce((a, b) => a + Number(b.blockedAttempts || 0), 0);
    const weekFocus = past7.reduce((a, b) => a + Number(b.focusMinutes || 0), 0);

    document.getElementById('todayBlocked').textContent = String(today.blockedAttempts || 0);
    document.getElementById('todayFocus').textContent = String(today.focusMinutes || 0);
    document.getElementById('weekBlocked').textContent = String(weekBlocked);
    document.getElementById('weekFocus').textContent = String(weekFocus);

    const toggle = document.getElementById('insightsEnabled');
    if (toggle) toggle.checked = !(currentInsightsSettings && currentInsightsSettings.enabled === false);

    refreshInsightsUpdatedLabel();
}

function refreshInsightsUpdatedLabel() {
    const el = document.getElementById('insightsUpdated');
    if (!el) return;
    if (currentInsightsSettings && currentInsightsSettings.enabled === false) {
        el.textContent = 'Last updated: tracking is off';
        return;
    }
    const ts = Number(currentInsightsMeta.lastUpdated || 0);
    if (!ts) {
        el.textContent = 'Last updated: no events yet';
        return;
    }
    const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    el.textContent = `Last updated: ${sec}s ago`;
}

function renderBlockedExperience() {
    const toneSelect = document.getElementById('toneSelect');
    const styleSelect = document.getElementById('styleSelect');
    const cardSelect = document.getElementById('cardSelect');
    const accentSelect = document.getElementById('accentSelect');
    const densitySelect = document.getElementById('densitySelect');
    if (toneSelect) toneSelect.value = currentBlockedExperience.tone || 'gentle';
    if (styleSelect) styleSelect.value = currentBlockedExperience.style || 'nature';
    if (cardSelect) cardSelect.value = currentBlockedExperience.card || 'glass';
    if (accentSelect) accentSelect.value = currentBlockedExperience.accent || 'forest';
    if (densitySelect) densitySelect.value = currentBlockedExperience.density || 'normal';
}

function loadAndRender() {
    chrome.storage.local.get({
        blocked: [],
        ruleError: '',
        locks: {},
        schedules: [],
        timeBudgets: {},
        budgetUsage: { day: '', usage: {}, minuteMarks: {} },
        presets: [],
        appliedPresetIds: [],
        insightsSettings: { enabled: true },
        insights: { days: {} },
        insightsMeta: { lastUpdated: 0 },
        blockedExperience: { tone: 'gentle', style: 'nature', card: 'glass', accent: 'forest', density: 'normal' }
    }, (res) => {
        currentList = (res.blocked || []).slice();
        currentLocks = normalizeLocks(res.locks || {});
        currentSchedules = (res.schedules || []).map(normalizeSchedule);
        currentBudgets = Object.assign({}, res.timeBudgets || {});
        currentBudgetUsage = normalizeBudgetUsage(res.budgetUsage || {});
        currentPresets = (res.presets || []).map(normalizePreset);
        currentAppliedPresetIds = Array.isArray(res.appliedPresetIds) ? res.appliedPresetIds.map((id) => String(id)) : [];
        currentInsightsSettings = res.insightsSettings || { enabled: true };
        currentInsights = res.insights || { days: {} };
        currentInsightsMeta = res.insightsMeta || { lastUpdated: 0 };
        currentBlockedExperience = Object.assign({ tone: 'gentle', style: 'nature', card: 'glass', accent: 'forest', density: 'normal' }, res.blockedExperience || {});

        renderRuleStatus(currentList, currentLocks, res.ruleError || '');
        renderBlockedList(currentList);
        renderSchedules();
        renderBudgets();
        renderPresets();
        renderInsights();
        renderBlockedExperience();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('addBtn');
    const input = document.getElementById('domainInput');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    const feedbackBtn = document.getElementById('feedbackBtn');

    const addScheduleBtn = document.getElementById('addScheduleBtn');
    const scheduleName = document.getElementById('scheduleName');
    const scheduleHosts = document.getElementById('scheduleHosts');
    const scheduleStart = document.getElementById('scheduleStart');
    const scheduleEnd = document.getElementById('scheduleEnd');
    const scheduleDaysWrap = document.getElementById('scheduleDays');

    const budgetHost = document.getElementById('budgetHost');
    const budgetMinutes = document.getElementById('budgetMinutes');
    const saveBudgetBtn = document.getElementById('saveBudgetBtn');

    const presetName = document.getElementById('presetName');
    const presetHosts = document.getElementById('presetHosts');
    const savePresetBtn = document.getElementById('savePresetBtn');

    const insightsEnabled = document.getElementById('insightsEnabled');
    const toneSelect = document.getElementById('toneSelect');
    const styleSelect = document.getElementById('styleSelect');
    const cardSelect = document.getElementById('cardSelect');
    const accentSelect = document.getElementById('accentSelect');
    const densitySelect = document.getElementById('densitySelect');

    setupTabs();
    loadAndRender();

    addBtn.addEventListener('click', () => {
        const host = normalizeHost(input.value);
        if (!host) return alert('Please enter a valid domain or URL');
        const list = currentList.slice();
        if (!list.includes(host)) {
            list.push(host);
            save({ blocked: list }, () => {
                input.value = '';
                loadAndRender();
            });
        } else {
            alert('Domain already in list');
        }
    });

    exportBtn.addEventListener('click', () => {
        const payload = {
            blocked: currentList,
            locks: currentLocks,
            schedules: currentSchedules,
            timeBudgets: currentBudgets,
            budgetUsage: currentBudgetUsage,
            presets: currentPresets,
            appliedPresetIds: currentAppliedPresetIds,
            insightsSettings: currentInsightsSettings,
            insights: currentInsights,
            blockedExperience: currentBlockedExperience
        };
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

    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const json = JSON.parse(reader.result);
                const fileBlocked = Array.isArray(json.blocked) ? json.blocked : [];
                const fileLocks = json.locks && typeof json.locks === 'object' ? json.locks : {};
                const fileSchedules = Array.isArray(json.schedules) ? json.schedules.map(normalizeSchedule) : [];
                const fileBudgets = json.timeBudgets && typeof json.timeBudgets === 'object' ? json.timeBudgets : {};
                const filePresets = Array.isArray(json.presets) ? json.presets.map(normalizePreset) : [];
                const fileAppliedPresetIds = Array.isArray(json.appliedPresetIds) ? json.appliedPresetIds.map((id) => String(id)) : [];
                const fileInsightsSettings = json.insightsSettings && typeof json.insightsSettings === 'object' ? json.insightsSettings : null;
                const fileInsights = json.insights && typeof json.insights === 'object' ? json.insights : null;
                const fileBlockedExperience = json.blockedExperience && typeof json.blockedExperience === 'object' ? json.blockedExperience : null;

                const mergedBlocked = Array.from(new Set(currentList.concat(fileBlocked).map(normalizeHost).filter(Boolean)));
                const mergedLocks = Object.assign({}, currentLocks, fileLocks);
                const mergedBudgets = Object.assign({}, currentBudgets, fileBudgets);

                const schedulesById = new Map();
                currentSchedules.forEach((s) => schedulesById.set(s.id, s));
                fileSchedules.forEach((s) => schedulesById.set(s.id, s));

                const presetsById = new Map();
                currentPresets.forEach((p) => presetsById.set(p.id, p));
                filePresets.forEach((p) => presetsById.set(p.id, p));
                const mergedPresetIds = Array.from(presetsById.keys()).map((id) => String(id));
                const mergedAppliedPresetIds = Array.from(new Set((currentAppliedPresetIds || []).concat(fileAppliedPresetIds).map((id) => String(id))))
                    .filter((id) => mergedPresetIds.includes(id));

                const patch = {
                    blocked: mergedBlocked,
                    locks: mergedLocks,
                    schedules: Array.from(schedulesById.values()),
                    timeBudgets: mergedBudgets,
                    presets: Array.from(presetsById.values()),
                    appliedPresetIds: mergedAppliedPresetIds
                };
                if (fileInsightsSettings) patch.insightsSettings = fileInsightsSettings;
                if (fileInsights) patch.insights = fileInsights;
                if (fileBlockedExperience) patch.blockedExperience = fileBlockedExperience;

                save(patch, () => {
                    loadAndRender();
                    alert('Import successful');
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

    addScheduleBtn.addEventListener('click', () => {
        const name = (scheduleName.value || '').trim() || 'Schedule';
        const hosts = parseHostsCsv(scheduleHosts.value);
        const days = Array.from(scheduleDaysWrap.querySelectorAll('input[type=checkbox]:checked')).map((el) => Number(el.value));
        const start = scheduleStart.value || '09:00';
        const end = scheduleEnd.value || '17:00';
        if (!hosts.length) return alert('Add at least one host for a schedule');
        if (!days.length) return alert('Choose at least one weekday');

        const next = currentSchedules.concat([normalizeSchedule({ id: uid('sch'), name, hosts, days, start, end, enabled: true })]);
        save({ schedules: next }, () => {
            scheduleName.value = '';
            scheduleHosts.value = '';
            scheduleDaysWrap.querySelectorAll('input[type=checkbox]').forEach((el) => { el.checked = false; });
            loadAndRender();
        });
    });

    saveBudgetBtn.addEventListener('click', () => {
        const host = normalizeHost(budgetHost.value);
        const mins = Math.max(1, Number(budgetMinutes.value) || 0);
        if (!host) return alert('Enter a valid domain for budget');
        const next = Object.assign({}, currentBudgets, { [host]: mins });
        save({ timeBudgets: next }, () => {
            budgetHost.value = '';
            loadAndRender();
        });
    });

    savePresetBtn.addEventListener('click', () => {
        const name = (presetName.value || '').trim() || 'Preset';
        const hosts = parseHostsCsv(presetHosts.value);
        if (!hosts.length) return alert('Add at least one host to save a preset');
        const newPreset = normalizePreset({ id: uid('preset'), name, hosts });
        const next = currentPresets.concat([newPreset]);
        save({ presets: next }, () => {
            presetName.value = '';
            presetHosts.value = '';
            loadAndRender();
        });
    });

    insightsEnabled.addEventListener('change', () => {
        save({ insightsSettings: { enabled: !!insightsEnabled.checked } }, loadAndRender);
    });

    function saveAppearance() {
        save({
            blockedExperience: {
                tone: toneSelect.value,
                style: styleSelect.value,
                card: cardSelect ? cardSelect.value : 'glass',
                accent: accentSelect ? accentSelect.value : 'forest',
                density: densitySelect ? densitySelect.value : 'normal'
            }
        });
    }

    toneSelect.addEventListener('change', saveAppearance);
    styleSelect.addEventListener('change', saveAppearance);
    if (cardSelect) cardSelect.addEventListener('change', saveAppearance);
    if (accentSelect) accentSelect.addEventListener('change', saveAppearance);
    if (densitySelect) densitySelect.addEventListener('change', saveAppearance);

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && (changes.blocked || changes.locks || changes.ruleError || changes.schedules || changes.timeBudgets || changes.budgetUsage || changes.presets || changes.appliedPresetIds || changes.insights || changes.insightsMeta || changes.insightsSettings || changes.blockedExperience)) {
            loadAndRender();
        }
    });

    setInterval(updateLockCountdowns, 1000);
    setInterval(refreshInsightsUpdatedLabel, 1000);
});
