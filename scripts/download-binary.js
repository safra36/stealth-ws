/**
 * Post-install script: Copy prebuilt binary to bin/ for current platform
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, copyFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const BIN_DIR = join(ROOT_DIR, 'bin');

const PLATFORMS = {
  'win32-x64': { ext: '.exe' },
  'linux-x64': { ext: '' },
  'darwin-x64': { ext: '' }
};

function getPlatform() {
  const key = `${process.platform}-${process.arch}`;
  return PLATFORMS[key] ? key : null;
}

const platform = getPlatform();

if (!platform) {
  console.log('ARM builds not supported (build from source with: npm run build:go)');
  process.exit(0);
}

const ext = PLATFORMS[platform].ext;
const binaryName = `stealth-bridge${ext}`;
const srcPath = join(ROOT_DIR, 'prebuilds', platform, binaryName);
const destPath = join(BIN_DIR, binaryName);

if (existsSync(destPath)) {
  process.exit(0);
}

if (!existsSync(srcPath)) {
  console.log(`No prebuilt binary found for ${platform}. Run: npm run build:go`);
  process.exit(0);
}

if (!existsSync(BIN_DIR)) {
  mkdirSync(BIN_DIR, { recursive: true });
}

copyFileSync(srcPath, destPath);
console.log(`Installed binary: ${destPath}`);
