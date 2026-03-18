const { normalizeHost, cleanExpiredLocks, getActiveHosts, makeRule, generateRulesFromLists } = require('../src/testlib');

describe('normalizeHost', () => {
    test('full URL with www', () => {
        expect(normalizeHost('https://www.youtube.com/watch?v=abc')).toBe('youtube.com');
    });
    test('uppercase and www', () => {
        expect(normalizeHost('WWW.Reddit.COM/r')).toBe('reddit.com');
    });
    test('simple host with path', () => {
        expect(normalizeHost('example.com/path')).toBe('example.com');
    });
    test('empty returns empty', () => {
        expect(normalizeHost('')).toBe('');
        expect(normalizeHost(null)).toBe('');
    });
});

describe('locks and active hosts', () => {
    test('cleanExpiredLocks removes expired entries', () => {
        const now = 10000;
        const locks = { a: 5000, b: 15000, c: null };
        const cleaned = cleanExpiredLocks(locks, now);
        expect(cleaned).toEqual({ b: 15000 });
    });

    test('getActiveHosts merges blocked and active locks', () => {
        const blocked = ['youtube.com'];
        const locks = { 'reddit.com': Date.now() + 60000 };
        const active = getActiveHosts(blocked, locks);
        expect(active).toEqual(expect.arrayContaining(['youtube.com', 'reddit.com']));
    });

    test('expired locks are ignored', () => {
        const blocked = ['a.com'];
        const locks = { 'b.com': Date.now() - 1000 };
        const active = getActiveHosts(blocked, locks, Date.now());
        expect(active).toEqual(expect.arrayContaining(['a.com']));
        expect(active).not.toEqual(expect.arrayContaining(['b.com']));
    });
});

describe('rule generation', () => {
    test('makeRule produces expected structure', () => {
        const r = makeRule(1, 'youtube.com');
        expect(r.id).toBe(1);
        expect(r.priority).toBe(1);
        expect(r.action).toHaveProperty('type', 'redirect');
        expect(r.action.redirect.extensionPath).toBe('/src/blocked.html');
        expect(r.condition.urlFilter).toBe('||youtube.com^');
        expect(r.condition.resourceTypes).toEqual(expect.arrayContaining(['main_frame']));
    });

    test('generateRulesFromLists creates rules for active hosts', () => {
        const now = Date.now();
        const rules = generateRulesFromLists(['b.com', 'a.com'], { 'c.com': now + 5000 }, now);
        // rules should cover a.com, b.com, c.com (sorted)
        expect(rules.length).toBe(3);
        const filters = rules.map(r => r.condition.urlFilter).sort();
        expect(filters).toEqual(['||a.com^', '||b.com^', '||c.com^']);
    });
});
