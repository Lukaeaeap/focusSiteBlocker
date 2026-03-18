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

    // Export for CommonJS (tests) and attach to global for browser scripts
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { normalizeHost, stableId, formatCompactDuration };
    }
    if (typeof self !== 'undefined') {
        self.normalizeHost = normalizeHost;
        self.stableId = stableId;
        self.formatCompactDuration = formatCompactDuration;
    }
})(this);
