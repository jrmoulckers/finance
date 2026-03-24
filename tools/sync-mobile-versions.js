#!/usr/bin/env node

// tools/sync-mobile-versions.js
//
// Synchronizes mobile app version numbers with the monorepo version.
// Reads the root package.json version and updates:
//   - apps/android/build.gradle.kts (versionName + versionCode)
//   - apps/ios/Finance/Info.plist (CFBundleShortVersionString + CFBundleVersion)
//
// Usage:
//   node tools/sync-mobile-versions.js          # Dry run (prints changes)
//   node tools/sync-mobile-versions.js --apply  # Apply changes
//
// Run after `npx changeset version` to keep mobile versions in sync.

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const DRY_RUN = !process.argv.includes('--apply');

/** Parse semver string into components. */
function parseSemver(version) {
  const [major, minor, patch] = version.replace(/^v/, '').split('.').map(Number);
  return { major, minor, patch };
}

/** Compute Android versionCode: MAJOR*10000 + MINOR*100 + PATCH */
function toVersionCode({ major, minor, patch }) {
  return major * 10000 + minor * 100 + patch;
}

/** Read root package.json version. */
function getRootVersion() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

/**
 * Safely read a file, returning null if it doesn't exist.
 * Avoids TOCTOU race between existsSync() and readFileSync().
 */
function safeReadFile(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Update Android build.gradle.kts versionName and versionCode. */
function updateAndroid(version) {
  const gradlePath = join(ROOT, 'apps', 'android', 'build.gradle.kts');
  const content = safeReadFile(gradlePath);
  if (content === null) {
    console.log('  ⚠️  Android build.gradle.kts not found — skipping');
    return false;
  }

  const { major, minor, patch } = parseSemver(version);
  const versionCode = toVersionCode({ major, minor, patch });

  const nameRegex = /versionName\s*=\s*"[^"]+"/;
  const codeRegex = /versionCode\s*=\s*\d+/;

  if (!nameRegex.test(content) || !codeRegex.test(content)) {
    console.log('  ⚠️  Could not find versionName/versionCode in build.gradle.kts');
    return false;
  }

  const updated = content
    .replace(nameRegex, `versionName = "${version}"`)
    .replace(codeRegex, `versionCode = ${versionCode}`);

  if (updated === content) {
    console.log(`  ✅ Android already at ${version} (code ${versionCode})`);
    return false;
  }

  console.log(`  📱 Android: ${version} (versionCode ${versionCode})`);
  if (!DRY_RUN) writeFileSync(gradlePath, updated);
  return true;
}

/** Update iOS Info.plist version strings. */
function updateIOS(version) {
  const plistPath = join(ROOT, 'apps', 'ios', 'Finance', 'Info.plist');
  const content = safeReadFile(plistPath);
  if (content === null) {
    console.log('  ⚠️  iOS Info.plist not found — skipping');
    return false;
  }

  const shortVersionRegex = /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)/;
  const bundleVersionRegex = /(<key>CFBundleVersion<\/key>\s*<string>)[^<]+(<\/string>)/;

  let updated = content;
  if (shortVersionRegex.test(content)) {
    updated = updated.replace(shortVersionRegex, `$1${version}$2`);
  }
  if (bundleVersionRegex.test(content)) {
    const { major, minor, patch } = parseSemver(version);
    const buildNumber = toVersionCode({ major, minor, patch });
    updated = updated.replace(bundleVersionRegex, `$1${buildNumber}$2`);
  }

  if (updated === content) {
    console.log(`  ✅ iOS already at ${version}`);
    return false;
  }

  console.log(`  🍎 iOS: ${version}`);
  if (!DRY_RUN) writeFileSync(plistPath, updated);
  return true;
}

// Main
const version = getRootVersion();
console.log(`\n📦 Root version: ${version}`);
console.log(DRY_RUN ? '🔍 Dry run (use --apply to write changes)\n' : '✏️  Applying changes\n');

const androidChanged = updateAndroid(version);
const iosChanged = updateIOS(version);

if (!androidChanged && !iosChanged) {
  console.log('\n✅ All mobile versions are in sync.');
} else if (DRY_RUN) {
  console.log('\n💡 Run with --apply to write these changes.');
}
