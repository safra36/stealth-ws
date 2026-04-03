/**
 * Build script for the Go bridge
 * 
 * Builds the stealth-bridge binary for the current platform.
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const SRC_DIR = join(ROOT_DIR, 'src', 'bridge');
const BIN_DIR = join(ROOT_DIR, 'bin');

// Platform configurations
const PLATFORMS = {
  'win32': { os: 'windows', arch: 'amd64', ext: '.exe' },
  'win32-arm64': { os: 'windows', arch: 'arm64', ext: '.exe' },
  'linux': { os: 'linux', arch: 'amd64', ext: '' },
  'linux-arm64': { os: 'linux', arch: 'arm64', ext: '' },
  'darwin': { os: 'darwin', arch: 'amd64', ext: '' },
  'darwin-arm64': { os: 'darwin', arch: 'arm64', ext: '' }
};

function getPlatform() {
  const platform = process.platform;
  const arch = process.arch;
  
  if (platform === 'win32') {
    return arch === 'arm64' ? 'win32-arm64' : 'win32';
  }
  if (platform === 'linux') {
    return arch === 'arm64' ? 'linux-arm64' : 'linux';
  }
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'darwin-arm64' : 'darwin';
  }
  
  return null;
}

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
  const config = PLATFORMS[platform];
  if (!config) {
    console.log(`Skipping unsupported platform: ${platform}`);
    return false;
  }

  const outputName = `stealth-bridge${config.ext}`;
  const outputPath = join(BIN_DIR, outputName);

  console.log(`Building for ${platform}...`);

  // Ensure bin directory exists
  if (!existsSync(BIN_DIR)) {
    mkdirSync(BIN_DIR, { recursive: true });
  }

  // Build command - detect Go command
  const goCmd = process.platform === 'win32' ? 'go.exe' : 'go';
  
  try {
    // Step 1: Download dependencies
    console.log('Downloading Go dependencies...');
    await runCommand(goCmd, ['mod', 'download'], { cwd: SRC_DIR });

    // Step 2: Tidy modules
    console.log('Tidying Go modules...');
    await runCommand(goCmd, ['mod', 'tidy'], { cwd: SRC_DIR });

    // Step 3: Build binary
    console.log('Building binary...');
    await runCommand(goCmd, [
      'build',
      '-o', outputPath,
      '-ldflags', '-s -w',
      SRC_DIR
    ], {
      env: {
        ...process.env,
        GOOS: config.os,
        GOARCH: config.arch,
        CGO_ENABLED: '0'
      },
      cwd: SRC_DIR
    });

    console.log(`✓ Built: ${outputPath}`);
    return true;

  } catch (err) {
    console.error(`✗ Build failed for ${platform}:`, err.message);
    return false;
  }
}

async function buildAll() {
  console.log('Building stealth-bridge binaries...\n');
  
  // Build for current platform
  const platform = getPlatform();
  if (platform) {
    await buildForPlatform(platform);
  } else {
    console.error('Unsupported platform');
    process.exit(1);
  }
}

// Run if called directly
buildAll().catch(console.error);

export { buildForPlatform, buildAll };
