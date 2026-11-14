import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MANIFEST_PATH = path.resolve('public/assets/asset-manifest.json');

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error('Asset manifest not found:', MANIFEST_PATH);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
let errors = 0;
const seenIds = new Set();

for (const asset of manifest.assets) {
  if (seenIds.has(asset.id)) {
    console.error(`Duplicate asset ID: ${asset.id}`);
    errors++;
  }
  seenIds.add(asset.id);

  if (!asset.license || !asset.webHostingCleared) {
    console.error(`Asset ${asset.id} failed license / web hosting clearance check.`);
    errors++;
  }

  if (asset.path.startsWith('/assets/')) {
    const diskPath = path.resolve('public', asset.path.slice(1));
    if (!fs.existsSync(diskPath)) {
      console.error(`Missing asset file on disk: ${diskPath}`);
      errors++;
      continue;
    }
    const content = fs.readFileSync(diskPath, 'utf8');
    const sha = crypto.createHash('sha256').update(content).digest('hex');
    if (sha !== asset.sha256) {
      console.error(`SHA-256 mismatch for ${asset.id}: expected ${asset.sha256}, got ${sha}`);
      errors++;
    }
    const parsed = JSON.parse(content);
    if (!parsed.asset || parsed.asset.version !== '2.0') {
      console.error(`Invalid glTF 2.0 header in ${asset.id}`);
      errors++;
    }
    if (asset.category === 'character-model') {
      if (!parsed.skins || parsed.skins.length === 0 || parsed.skins[0].joints.length < 20) {
        console.error(`Skeleton compatibility failed for ${asset.id}`);
        errors++;
      }
      if (!parsed.extras?.animationClips || parsed.extras.animationClips.length < 12) {
        console.error(`Animation completeness failed for ${asset.id}`);
        errors++;
      }
    }
  }
}

const charModels = manifest.assets.filter((a) => a.category === 'character-model' && a.validationState === 'PASSED');
if (charModels.length < 8) {
  console.error(`Insufficient eligible characters: found ${charModels.length}, minimum required is 8.`);
  errors++;
}

if (errors > 0) {
  console.error(`Asset pipeline validation FAILED with ${errors} error(s).`);
  process.exit(1);
}

console.log(`Asset pipeline validation PASSED: ${manifest.assets.length} assets verified (${charModels.length} eligible 3D character rigs, ${manifest.arenaCount} arenas).`);
