#!/usr/bin/env node

// =============================================================================
// Store Metadata Generator — Submission artifacts for app stores
// =============================================================================
//
// Usage:
//   node tools/generate-store-metadata.js --version 2.0.0
//   node tools/generate-store-metadata.js --version 2.0.0 --platform android
//   node tools/generate-store-metadata.js --help
//
// Generates store submission metadata for all platforms:
//   - Release notes / "What's New" text (per-platform, character-limited)
//   - App description updates
//   - Version-specific changelog
//   - Metadata JSON for Fastlane (Android supply / iOS deliver)
//
// Output directory: release-metadata/<version>/
//   ├── android/
//   │   ├── release-notes.txt       (500 char limit for Play Store)
//   │   └── metadata.json
//   ├── ios/
//   │   ├── release-notes.txt       (4000 char limit for App Store)
//   │   └── metadata.json
//   ├── web/
//   │   └── changelog.md
//   └── windows/
//       ├── release-notes.txt       (10000 char limit for MS Store)
//       └── metadata.json
//
// Issue: #1147
// =============================================================================

const { execFileSync } = require('child_process');
const { mkdirSync, writeFileSync } = require('fs');
const { resolve, join } = require('path');

const ROOT = resolve(__dirname, '..');
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Store Metadata Generator — App store submission artifacts

Usage:
  node tools/generate-store-metadata.js --version <ver> [options]

Options:
  --version <ver>      Version string (required, e.g. 2.0.0)
  --platform <name>    Generate for one platform only (android|ios|web|windows)
  --output <dir>       Output directory (default: release-metadata/<version>)
  --from-tag <tag>     Generate changelog from this tag (default: auto-detect)
  --help, -h           Show this help
`);
  process.exit(0);
}

/**
 * @param {string} name
 * @param {string} [defaultValue]
 * @returns {string|undefined}
 */
function flag(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1] || defaultValue;
}

const version = flag('--version');
const platformFilter = flag('--platform');
const fromTag = flag('--from-tag');

if (!version) {
  console.error('Error: --version is required');
  process.exit(1);
}

const outputDir = flag('--output', join(ROOT, 'release-metadata', version));

// ── Helpers ─────────────────────────────────────────────────────────────────

function git(...gitArgs) {
  try {
    return execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * Truncate text to a maximum length, adding ellipsis if truncated.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// ── Detect previous tag ─────────────────────────────────────────────────────

const previousTag =
  fromTag || git('tag', '--sort=-version:refname', '--list', 'v*').split('\n')[0] || '';

// ── Parse commits for changelog ─────────────────────────────────────────────

const commitLines = (() => {
  const raw = previousTag
    ? git('log', '--pretty=format:%s', `${previousTag}..HEAD`)
    : git('log', '--pretty=format:%s', '-50');
  return raw ? raw.split('\n').filter(Boolean) : [];
})();

const CC_RE = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/;

/**
 * @typedef {Object} Change
 * @property {string} type
 * @property {string} scope
 * @property {string} description
 */

/** @type {Change[]} */
const changes = commitLines.map((line) => {
  const match = line.match(CC_RE);
  if (match) {
    return {
      type: match[1],
      scope: match[2] || '',
      description: match[3].replace(/\(#\d+\)/, '').trim(),
    };
  }
  return { type: 'other', scope: '', description: line };
});

// Filter to user-facing changes
const userFacing = changes.filter((c) => ['feat', 'fix', 'perf'].includes(c.type));

// ── Platform-specific changelogs ────────────────────────────────────────────

/**
 * Filter changes relevant to a platform.
 * @param {string} platform
 * @returns {Change[]}
 */
function platformChanges(platform) {
  const platformKeywords = {
    android: ['android', 'droid', 'gradle', 'kotlin'],
    ios: ['ios', 'swift', 'xcode', 'apple'],
    web: ['web', 'vite', 'react', 'css', 'html'],
    windows: ['windows', 'win', 'desktop', 'compose'],
  };

  const keywords = platformKeywords[platform] || [];
  const coreChanges = userFacing.filter((c) => {
    const scope = c.scope.toLowerCase();
    // Include platform-specific AND core/shared changes
    return (
      keywords.some((k) => scope.includes(k)) ||
      ['core', 'kmp', 'shared', 'common', ''].includes(scope)
    );
  });

  return coreChanges.length > 0 ? coreChanges : userFacing;
}

/**
 * Generate "What's New" text for a platform.
 * @param {string} platform
 * @param {number} maxLength
 * @returns {string}
 */
function generateWhatsNew(platform, maxLength) {
  const relevant = platformChanges(platform);

  if (relevant.length === 0) {
    return truncate(`Version ${version} includes stability improvements and bug fixes.`, maxLength);
  }

  const features = relevant.filter((c) => c.type === 'feat');
  const fixes = relevant.filter((c) => c.type === 'fix');
  const perf = relevant.filter((c) => c.type === 'perf');

  const sections = [];

  if (features.length > 0) {
    sections.push("What's New:");
    for (const f of features.slice(0, 5)) {
      sections.push(`• ${f.description}`);
    }
  }

  if (fixes.length > 0) {
    sections.push('');
    sections.push('Bug Fixes:');
    for (const f of fixes.slice(0, 5)) {
      sections.push(`• ${f.description}`);
    }
  }

  if (perf.length > 0) {
    sections.push('');
    sections.push('Performance:');
    for (const p of perf.slice(0, 3)) {
      sections.push(`• ${p.description}`);
    }
  }

  return truncate(sections.join('\n'), maxLength);
}

// ── Generate metadata ───────────────────────────────────────────────────────

const platforms = platformFilter ? [platformFilter] : ['android', 'ios', 'web', 'windows'];

for (const platform of platforms) {
  const platDir = join(outputDir, platform);
  mkdirSync(platDir, { recursive: true });

  console.log(`📦 Generating metadata for ${platform}...`);

  switch (platform) {
    case 'android': {
      // Play Store: 500 char limit for release notes
      const notes = generateWhatsNew('android', 500);
      writeFileSync(join(platDir, 'release-notes.txt'), notes);

      const metadata = {
        version,
        versionCode: versionToCode(version),
        track: 'internal',
        releaseNotes: {
          'en-US': notes,
        },
        status: 'draft',
      };
      writeFileSync(join(platDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      break;
    }

    case 'ios': {
      // App Store: 4000 char limit for release notes
      const notes = generateWhatsNew('ios', 4000);
      writeFileSync(join(platDir, 'release-notes.txt'), notes);

      const metadata = {
        version,
        buildNumber: Date.now().toString(),
        whatsNew: {
          'en-US': notes,
        },
        phasedRelease: true,
      };
      writeFileSync(join(platDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      break;
    }

    case 'web': {
      // Web: full markdown changelog
      const relevant = platformChanges('web');
      const mdLines = [`# Finance Web v${version}`, ''];

      const features = relevant.filter((c) => c.type === 'feat');
      const fixes = relevant.filter((c) => c.type === 'fix');
      const perf = relevant.filter((c) => c.type === 'perf');

      if (features.length > 0) {
        mdLines.push('## ✨ Features', '');
        for (const f of features) {
          mdLines.push(`- ${f.description}`);
        }
        mdLines.push('');
      }

      if (fixes.length > 0) {
        mdLines.push('## 🐛 Bug Fixes', '');
        for (const f of fixes) {
          mdLines.push(`- ${f.description}`);
        }
        mdLines.push('');
      }

      if (perf.length > 0) {
        mdLines.push('## ⚡ Performance', '');
        for (const p of perf) {
          mdLines.push(`- ${p.description}`);
        }
        mdLines.push('');
      }

      writeFileSync(join(platDir, 'changelog.md'), mdLines.join('\n'));
      break;
    }

    case 'windows': {
      // Microsoft Store: 10000 char limit
      const notes = generateWhatsNew('windows', 10000);
      writeFileSync(join(platDir, 'release-notes.txt'), notes);

      const metadata = {
        version,
        channel: 'sideload',
        releaseNotes: {
          'en-US': notes,
        },
      };
      writeFileSync(join(platDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      break;
    }
  }

  console.log(`  ✅ ${platform} metadata written to ${platDir}`);
}

console.log(`\n✅ All store metadata generated in ${outputDir}`);

// ── Utility ─────────────────────────────────────────────────────────────────

/**
 * Convert a semver version string to Android version code.
 * @param {string} ver
 * @returns {number}
 */
function versionToCode(ver) {
  const parts = ver.replace(/-.+$/, '').split('.');
  const major = parseInt(parts[0], 10) || 0;
  const minor = parseInt(parts[1], 10) || 0;
  const patch = parseInt(parts[2], 10) || 0;
  return major * 10000 + minor * 100 + patch;
}
