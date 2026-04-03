/**
 * Build script for all supported platform binaries
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = join(__dirname, '..');
const PREBUILTS_DIR = join(ROOT_DIR, 'prebuilds');

// Supported x64 platforms only (ARM builds not supported - build from source with: npm run build:go)
const PLATFORMS = [
  { name: 'win32-x64', os: 'windows', arch: 'amd64', ext: '.exe' },
  { name: 'linux-x64', os: 'linux', arch: 'amd64', ext: '' },
  { name: 'darwin-x64', os: 'darwin', arch: 'amd64', ext: '' }
];

console.log('Note: ARM builds not supported (build from source with: npm run build:go)\n');

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      ...options,
      stdio: 'inherit'
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function buildForPlatform(platform) {
  const outputName = `stealth-bridge${platform.ext}`;
  const outputDir = join(PREBUILTS_DIR, platform.name);
  const outputPath = join(outputDir, outputName);

  console.log(`Building for ${platform.name}...`);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const goCmd = process.platform === 'win32' ? 'go.exe' : 'go';
  const srcDir = join(ROOT_DIR, 'src', 'bridge');

  try {
    await runCommand(goCmd, [
      'build',
      '-o', outputPath,
      '-ldflags', '-s -w',
      srcDir
    ], {
      env: {
        ...process.env,
        GOOS: platform.os,
        GOARCH: platform.arch,
        CGO_ENABLED: '0'
      },
      cwd: srcDir
    });

    console.log(`✓ Built: ${outputPath}`);
    return true;

  } catch (err) {
    console.error(`✗ Build failed for ${platform.name}:`, err.message);
    return false;
  }
}

async function buildAll() {
  console.log('Building stealth-bridge binaries for all platforms...\n');

  let successCount = 0;
  for (const platform of PLATFORMS) {
    const success = await buildForPlatform(platform);
    if (success) successCount++;
  }

  console.log(`\nBuild complete: ${successCount}/${PLATFORMS.length} platforms succeeded`);

  if (successCount === PLATFORMS.length) {
    console.log('\nAll binaries built successfully!');
  } else {
    console.log('\nSome builds failed. Check errors above.');
    process.exit(1);
  }
}

buildAll().catch(console.error);
