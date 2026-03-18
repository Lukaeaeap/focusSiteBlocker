// Shared utilities for the extension and tests
(function (root) {
    function normalizeHost(input) {
        try {
            if (!input) return '';
            input = input.toString().trim().toLowerCase();
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

    // DJB2 hash to produce a stable numeric id from a host string
    function stableId(host) {
        let s = (host || '').toString();
        let hash = 5381;
        for (let i = 0; i < s.length; i++) {
            hash = ((hash << 5) + hash) + s.charCodeAt(i); /* hash * 33 + c */
            hash = hash | 0; // force 32-bit
        }
        // ensure positive and in a reasonable range
        return (Math.abs(hash) % 10000000) + 1;
    }

    // Format seconds to a compact highest-unit label, e.g. 19s, 5m, 2h, 1d.
    function formatCompactDuration(totalSeconds) {
        const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
        if (s <= 0) return '0s';
        const day = 86400;
        const hour = 3600;
        const minute = 60;
        if (s >= day) return `${Math.floor(s / day)}d`;
        if (s >= hour) return `${Math.floor(s / hour)}h`;
        if (s >= minute) return `${Math.floor(s / minute)}m`;
        return `${s}s`;
    }

    function timeToMinutes(input) {
        const m = /^(\d{1,2}):(\d{2})$/.exec((input || '').toString().trim());
        if (!m) return -1;
        const h = Number(m[1]);
        const min = Number(m[2]);
        if (Number.isNaN(h) || Number.isNaN(min)) return -1;
        if (h < 0 || h > 23 || min < 0 || min > 59) return -1;
        return h * 60 + min;
    }

    function getLocalDateKey(ms = Date.now()) {
        const d = new Date(ms);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function isScheduleActiveAt(schedule, ms = Date.now()) {
        if (!schedule || schedule.enabled === false) return false;
        const days = Array.isArray(schedule.days) ? schedule.days.map(Number).filter((n) => n >= 0 && n <= 6) : [];
        if (days.length === 0) return false;

        const start = timeToMinutes(schedule.start);
        const end = timeToMinutes(schedule.end);
        if (start < 0 || end < 0) return false;

        const d = new Date(ms);
        const curDay = d.getDay();
        const prevDay = (curDay + 6) % 7;
        const curMin = d.getHours() * 60 + d.getMinutes();

        // Equal start/end means full-day for selected days.
        if (start === end) return days.includes(curDay);

        if (start < end) {
            return days.includes(curDay) && curMin >= start && curMin < end;
        }

        // Overnight window (e.g. 22:00 -> 06:00)
        return (days.includes(curDay) && curMin >= start) || (days.includes(prevDay) && curMin < end);
    }

    // Export for CommonJS (tests) and attach to global for browser scripts
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { normalizeHost, stableId, formatCompactDuration, timeToMinutes, getLocalDateKey, isScheduleActiveAt };
    }
    if (typeof self !== 'undefined') {
        self.normalizeHost = normalizeHost;
        self.stableId = stableId;
        self.formatCompactDuration = formatCompactDuration;
        self.timeToMinutes = timeToMinutes;
        self.getLocalDateKey = getLocalDateKey;
        self.isScheduleActiveAt = isScheduleActiveAt;
    }
})(this);
