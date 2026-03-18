Running tests

1. Install dev dependencies:

```bash
npm install
```

2. Run tests:

```bash
npm test
```

Notes

- Tests are implemented using Jest and exercise pure logic in `src/testlib.js`.
- They do not run the Chrome extension runtime; they test normalization, lock expiry, and rule generation logic.
- Keep `src/testlib.js` in sync with logic in the real extension when making changes.
