const { normalizeHost, stableId } = require('../src/lib');

describe('lib utilities', () => {
    test('normalizeHost works with urls and hosts', () => {
        expect(normalizeHost('https://WWW.Example.com/path')).toBe('example.com');
        expect(normalizeHost('example.com/path')).toBe('example.com');
    });

    test('stableId is deterministic and produces positive number', () => {
        const a = stableId('example.com');
        const b = stableId('example.com');
        const c = stableId('other.com');
        expect(typeof a).toBe('number');
        expect(a).toBeGreaterThan(0);
        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });
});
