const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'manifest.json');

function fail(msg) {
    console.error(`ERROR: ${msg}`);
    process.exitCode = 1;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureFile(relPath) {
    const abs = path.join(root, relPath);
    if (!fs.existsSync(abs)) {
        fail(`Missing required file: ${relPath}`);
        return false;
    }
    ok(`Found ${relPath}`);
    return true;
}

function scanForRemoteAssets(relPath) {
    const abs = path.join(root, relPath);
    if (!fs.existsSync(abs)) return;
    const txt = fs.readFileSync(abs, 'utf8');
    const remotePattern = /https?:\/\//i;
    if (remotePattern.test(txt)) {
        fail(`Remote URL found in ${relPath}. Bundle assets locally before publishing.`);
    } else {
        ok(`No remote URLs in ${relPath}`);
    }
}

function validateManifest(manifest) {
    if (manifest.manifest_version !== 3) {
        fail('manifest_version must be 3');
    } else {
        ok('Manifest version is MV3');
    }

    const iconSizes = ['16', '32', '48', '128'];
    iconSizes.forEach((size) => {
        const p = manifest.icons && manifest.icons[size];
        if (!p) {
            fail(`manifest.icons missing ${size}`);
            return;
        }
        if (!p.toLowerCase().endsWith('.png')) {
            fail(`manifest icon ${size} must be PNG: ${p}`);
            return;
        }
        ensureFile(p);
    });

    const requiredPermissions = ['storage', 'declarativeNetRequest'];
    const perms = manifest.permissions || [];
    requiredPermissions.forEach((perm) => {
        if (!perms.includes(perm)) fail(`manifest.permissions missing ${perm}`);
    });
}

function validatePlansPrivacy() {
    const plansDir = path.join(root, 'plans');
    const gitignorePath = path.join(root, '.gitignore');

    if (!fs.existsSync(gitignorePath)) {
        fail('Missing .gitignore (required to keep private plan files out of GitHub).');
        return;
    }

    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    if (!/(^|\r?\n)plans\/(\r?\n|$)/.test(gitignore)) {
        fail('`.gitignore` must include `plans/` to keep private plans out of GitHub.');
    } else {
        ok('Private plans directory is ignored by git (`plans/`).');
    }

    if (fs.existsSync(plansDir)) {
        try {
            const tracked = execSync('git ls-files -- plans', { cwd: root, encoding: 'utf8' }).trim();
            if (tracked) {
                fail('Files under `plans/` are git-tracked. Remove them from index before publishing.');
            } else {
                ok('No tracked files found under `plans/`.');
            }
        } catch (err) {
            // If git is unavailable, fail closed to avoid accidental publication.
            fail('Unable to verify git tracking for `plans/`. Ensure git is available and re-run.');
        }
    }
}

function validateDistPrivacy() {
    const gitignorePath = path.join(root, '.gitignore');
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');

    if (!/(^|\r?\n)dist\/(\r?\n|$)/.test(gitignore)) {
        fail('`.gitignore` must include `dist/` to avoid publishing build artifacts to GitHub.');
    } else {
        ok('Build artifacts are ignored by git (`dist/`).');
    }

    try {
        const tracked = execSync('git ls-files -- dist', { cwd: root, encoding: 'utf8' }).trim();
        if (tracked) {
            fail('Files under `dist/` are git-tracked. Remove them from index before publishing.');
        } else {
            ok('No tracked files found under `dist/`.');
        }
    } catch (err) {
        fail('Unable to verify git tracking for `dist/`. Ensure git is available and re-run.');
    }
}

function main() {
    if (!fs.existsSync(manifestPath)) {
        fail('manifest.json not found');
        process.exit(process.exitCode || 1);
    }

    const manifest = readJson(manifestPath);
    validateManifest(manifest);

    ensureFile('src/background.js');
    ensureFile('src/options.html');
    ensureFile('src/popup.html');
    ensureFile('src/blocked.html');
    ensureFile('src/blocked.css');
    ensureFile('src/blocked.js');

    scanForRemoteAssets('src/blocked.css');
    scanForRemoteAssets('src/blocked.html');
    validatePlansPrivacy();
    validateDistPrivacy();

    if (!process.exitCode) {
        console.log('Release validation passed.');
    }
}

main();
