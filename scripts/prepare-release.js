const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'manifest.json');
const distRoot = path.join(root, 'dist');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function rmrf(target) {
    if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
    }
}

function copyRecursive(src, dst) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dst, { recursive: true });
        for (const item of fs.readdirSync(src)) {
            copyRecursive(path.join(src, item), path.join(dst, item));
        }
        return;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
}

function zipReleaseFolder(releaseDir) {
    const zipPath = `${releaseDir}.zip`;
    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
    }

    if (process.platform !== 'win32') {
        throw new Error('`--zip` is currently supported on Windows only (uses Compress-Archive).');
    }

    const escapedReleaseDir = releaseDir.replace(/'/g, "''");
    const escapedZipPath = zipPath.replace(/'/g, "''");
    const psCmd = `Compress-Archive -Path '${escapedReleaseDir}\\*' -DestinationPath '${escapedZipPath}' -Force`;

    execSync(`powershell -NoProfile -Command "${psCmd}"`, {
        stdio: 'inherit',
        cwd: root,
    });

    return zipPath;
}

function main() {
    if (!fs.existsSync(manifestPath)) {
        throw new Error('manifest.json not found');
    }

    const manifest = readJson(manifestPath);
    const version = manifest.version || '0.0.0';
    const releaseDir = path.join(distRoot, `siteblocker-focus-v${version}`);

    const includePaths = [
        'manifest.json',
        'icons',
        'src',
        'LICENSE',
        'README.md',
    ];

    rmrf(releaseDir);
    fs.mkdirSync(releaseDir, { recursive: true });

    for (const rel of includePaths) {
        const src = path.join(root, rel);
        if (!fs.existsSync(src)) {
            throw new Error(`Missing required release path: ${rel}`);
        }
        const dst = path.join(releaseDir, rel);
        copyRecursive(src, dst);
    }

    console.log(`Release folder prepared: ${path.relative(root, releaseDir)}`);
    console.log('Included paths:', includePaths.join(', '));
    console.log('Excluded by design: plans/, tests/, scripts/, node_modules/, .git/, .github/');

    if (process.argv.includes('--zip')) {
        const zipPath = zipReleaseFolder(releaseDir);
        console.log(`Release zip created: ${path.relative(root, zipPath)}`);
    }
}

main();
