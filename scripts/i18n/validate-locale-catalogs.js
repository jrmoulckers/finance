#!/usr/bin/env node
// validate-locale-catalogs.js
//
// Validates locale catalogs (Android string resources) against the default
// (source) catalog and the canonical locale metadata in config/i18n/locales.json.
//
// Checks performed per non-default locale:
//   1. Coverage   — every key in the default catalog has a translation.
//   2. Extra keys — the locale has no keys absent from the default catalog.
//   3. Duplicates — no duplicate string names within a locale file.
//   4. Placeholders — printf/positional placeholders match the default per key
//      (a mismatched %1$s / %d would crash or corrupt a formatted money string).
//
// "enforced" locales (see config/i18n/locales.json) MUST pass all checks or the
// script exits non-zero (CI gate). Non-enforced locales are reported as
// informational warnings only.
//
// Usage:
//   node scripts/i18n/validate-locale-catalogs.js            # all locales
//   node scripts/i18n/validate-locale-catalogs.js --locale es
//
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const metaPath = path.join(repoRoot, 'config', 'i18n', 'locales.json');

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(2);
}

if (!fs.existsSync(metaPath)) {
  fail(`Missing locale metadata: ${metaPath}`);
}

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const defaultResource = path.join(repoRoot, meta.defaultPlatformResource);

// Parse <string name="...">value</string> entries. Returns ordered array of
// { name, value } so duplicate names are detectable.
function parseStrings(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const re = /<string\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g;
  const entries = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    entries.push({ name: m[1], value: m[2] });
  }
  return entries;
}

// Extract a sorted multiset signature of printf/positional placeholders.
function placeholders(value) {
  const found = value.match(/%(?:\d+\$)?[-+ 0,(]*\d*(?:\.\d+)?[a-zA-Z]/g) || [];
  return found.slice().sort();
}

function toMap(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.name)) map.set(e.name, e.value);
  }
  return map;
}

function findDuplicates(entries) {
  const seen = new Set();
  const dups = new Set();
  for (const e of entries) {
    if (seen.has(e.name)) dups.add(e.name);
    seen.add(e.name);
  }
  return [...dups];
}

const localeFilter = (() => {
  const i = process.argv.indexOf('--locale');
  return i !== -1 ? process.argv[i + 1] : null;
})();

if (!fs.existsSync(defaultResource)) {
  fail(`Missing default catalog: ${defaultResource}`);
}

const defaultEntries = parseStrings(defaultResource);
const defaultMap = toMap(defaultEntries);
const defaultKeys = [...defaultMap.keys()];

console.log(`Default catalog: ${meta.defaultPlatformResource} (${defaultKeys.length} keys)`);

let hardFailures = 0;
let softWarnings = 0;

for (const locale of meta.locales) {
  if (locale.androidQualifier === 'values') continue; // default
  const shortId = locale.id.split('-')[0];
  if (localeFilter && localeFilter !== shortId && localeFilter !== locale.id) continue;

  const file = path.join(
    repoRoot,
    'apps',
    'android',
    'src',
    'main',
    'res',
    locale.androidQualifier,
    'strings.xml',
  );
  const label = `${locale.id} (${locale.androidQualifier})${locale.enforced ? ' [enforced]' : ''}`;

  if (!fs.existsSync(file)) {
    const line = `  ${label}: catalog file not found at ${path.relative(repoRoot, file)}`;
    if (locale.enforced) {
      console.error(`FAIL${line}`);
      hardFailures++;
    } else {
      console.warn(`WARN${line}`);
      softWarnings++;
    }
    continue;
  }

  const entries = parseStrings(file);
  const map = toMap(entries);

  const missing = defaultKeys.filter((k) => !map.has(k));
  const extra = [...map.keys()].filter((k) => !defaultMap.has(k));
  const dups = findDuplicates(entries);
  const placeholderMismatch = [];
  for (const k of defaultKeys) {
    if (!map.has(k)) continue;
    const a = placeholders(defaultMap.get(k)).join('|');
    const b = placeholders(map.get(k)).join('|');
    if (a !== b) placeholderMismatch.push(`${k} (default:[${a}] vs ${shortId}:[${b}])`);
  }

  const problems = [];
  if (missing.length) problems.push(`${missing.length} missing key(s)`);
  if (extra.length) problems.push(`${extra.length} extra key(s)`);
  if (dups.length) problems.push(`${dups.length} duplicate key(s)`);
  if (placeholderMismatch.length)
    problems.push(`${placeholderMismatch.length} placeholder mismatch(es)`);

  const coverage = (((defaultKeys.length - missing.length) / defaultKeys.length) * 100).toFixed(1);

  if (problems.length === 0) {
    console.log(`  ${label}: OK — ${map.size} keys, 100.0% coverage`);
    continue;
  }

  const detail = [
    `  ${label}: ${coverage}% coverage — ${problems.join(', ')}`,
    missing.length ? `      missing: ${missing.join(', ')}` : null,
    extra.length ? `      extra: ${extra.join(', ')}` : null,
    dups.length ? `      duplicate: ${dups.join(', ')}` : null,
    placeholderMismatch.length ? `      placeholders: ${placeholderMismatch.join('; ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  if (locale.enforced) {
    console.error(`FAIL\n${detail}`);
    hardFailures++;
  } else {
    console.warn(`WARN (non-enforced)\n${detail}`);
    softWarnings++;
  }
}

console.log('');
if (hardFailures > 0) {
  console.error(
    `Locale catalog validation FAILED: ${hardFailures} enforced locale(s) with problems.`,
  );
  process.exit(1);
}
console.log(
  `Locale catalog validation passed.${softWarnings ? ` (${softWarnings} non-enforced warning(s))` : ''}`,
);
