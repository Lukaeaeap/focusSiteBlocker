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

    // Export for CommonJS (tests) and attach to global for browser scripts
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { normalizeHost, stableId };
    }
    if (typeof self !== 'undefined') {
        self.normalizeHost = normalizeHost;
        self.stableId = stableId;
    }
})(this);
