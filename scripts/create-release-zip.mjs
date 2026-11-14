import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version || '1.0.0';
const releaseDir = path.resolve('releases');
fs.mkdirSync(releaseDir, { recursive: true });

const zipPath = path.join(releaseDir, `anime-arena-cataclysm-v${version}.zip`);

const pyScript = `
import os, zipfile

zip_path = ${JSON.stringify(zipPath)}
exclude_dirs = {'node_modules', 'dist', 'build', 'releases', 'coverage', '__pycache__'}
allowed_dotfiles = {'.gitignore', '.env.example'}

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
        for file in files:
            if file.startswith('.') and file not in allowed_dotfiles:
                continue
            if file.endswith('.zip') or file.endswith('.tsbuildinfo'):
                continue
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, '.')
            zf.write(full_path, rel_path)

print(f"Created release archive: {zip_path} ({os.path.getsize(zip_path)} bytes)")
`;

const res = spawnSync('python3', ['-c', pyScript], { stdio: 'inherit' });
if (res.status !== 0) {
  process.exit(res.status ?? 1);
}
