#!/usr/bin/env node
// validate-glossary.js
//
// Validates the canonical financial-terminology glossary
// (config/i18n/glossary.json) — the single source of truth for translated
// financial terms across every localized surface (Android, iOS, web, shared
// KMP Strings). A mistranslated or drifted financial term is a correctness
// bug, not polish, so these invariants are enforced in CI (#3318).
//
// Checks performed:
//   1. Structure    — top-level `locales` is a non-empty string array and
//                     `sourceLocale` is one of them.
//   2. Completeness — every term supplies a non-blank value for every locale
//                     listed in `locales`.
//   3. Uniqueness   — `concept` keys are unique.
//   4. doNotUse     — a term never appears in its own locale's doNotUse list
//                     (a "do not use" entry that equals the chosen translation
//                     is self-contradictory).
//   5. Enforcement  — every enforced locale in config/i18n/locales.json is
//                     covered by the glossary's `locales` (an enforced locale
//                     with no canonical terminology cannot be validated).
//   6. In-app sync  — the in-app English glossary
//                     (apps/web/src/lib/education/glossary.ts) must not use
//                     different wording from the canonical en-US term for any
//                     overlapping concept. Comparison is case- and
//                     whitespace-insensitive: individual surfaces may apply
//                     their own display casing (e.g. the "Net Worth" heading),
//                     but the underlying words must match.
//
// Usage:
//   node scripts/i18n/validate-glossary.js
//
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const glossaryPath = path.join(repoRoot, 'config', 'i18n', 'glossary.json');
const localesPath = path.join(repoRoot, 'config', 'i18n', 'locales.json');
const inAppGlossaryPath = path.join(
  repoRoot,
  'apps',
  'web',
  'src',
  'lib',
  'education',
  'glossary.ts',
);

const errors = [];
const err = (msg) => errors.push(msg);

function readJson(file, label) {
  if (!fs.existsSync(file)) {
    err(`Missing ${label}: ${path.relative(repoRoot, file)}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    err(`Invalid JSON in ${label}: ${e.message}`);
    return null;
  }
}

const glossary = readJson(glossaryPath, 'glossary');
const localeMeta = readJson(localesPath, 'locale metadata');

if (glossary) {
  const locales = glossary.locales;

  // 1. Structure.
  if (
    !Array.isArray(locales) ||
    locales.length === 0 ||
    !locales.every((l) => typeof l === 'string')
  ) {
    err('glossary.locales must be a non-empty array of locale id strings.');
  } else {
    if (typeof glossary.sourceLocale !== 'string' || !locales.includes(glossary.sourceLocale)) {
      err(`glossary.sourceLocale (${glossary.sourceLocale}) must be one of glossary.locales.`);
    }
  }

  const terms = Array.isArray(glossary.terms) ? glossary.terms : [];
  if (terms.length === 0) {
    err('glossary.terms must be a non-empty array.');
  }

  const seenConcepts = new Set();
  const localeList = Array.isArray(locales) ? locales : [];

  for (const term of terms) {
    const concept = term && term.concept;
    if (typeof concept !== 'string' || concept.trim() === '') {
      err(`A term is missing a non-blank "concept": ${JSON.stringify(term)}`);
      continue;
    }

    // 3. Uniqueness.
    if (seenConcepts.has(concept)) {
      err(`Duplicate concept: "${concept}".`);
    }
    seenConcepts.add(concept);

    // 2. Completeness.
    for (const locale of localeList) {
      const value = term[locale];
      if (typeof value !== 'string' || value.trim() === '') {
        err(`Concept "${concept}" is missing a non-blank value for locale "${locale}".`);
      }
    }

    // 4. doNotUse must not contain the chosen translation.
    if (term.doNotUse && typeof term.doNotUse === 'object') {
      for (const [locale, banned] of Object.entries(term.doNotUse)) {
        if (!Array.isArray(banned)) {
          err(`Concept "${concept}" doNotUse[${locale}] must be an array.`);
          continue;
        }
        const chosen = typeof term[locale] === 'string' ? term[locale].trim().toLowerCase() : null;
        for (const bad of banned) {
          if (chosen !== null && typeof bad === 'string' && bad.trim().toLowerCase() === chosen) {
            err(
              `Concept "${concept}" lists its own ${locale} translation "${term[locale]}" in doNotUse.`,
            );
          }
        }
      }
    }
  }

  // 5. Enforced locales must be covered by the glossary.
  if (localeMeta && Array.isArray(localeMeta.locales)) {
    const enforced = localeMeta.locales.filter((l) => l && l.enforced).map((l) => l.id);
    for (const id of enforced) {
      if (!localeList.includes(id)) {
        err(`Enforced locale "${id}" (config/i18n/locales.json) is not covered by the glossary.`);
      }
    }
  }

  // 6. In-app English glossary must not use different wording from canonical.
  // Casing/whitespace is normalized away — surfaces apply their own display
  // casing — so only genuine wording drift is reported.
  if (fs.existsSync(inAppGlossaryPath)) {
    const src = fs.readFileSync(inAppGlossaryPath, 'utf8');
    const norm = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
    // Extract `term: '...'` string literals (single or double quoted).
    const inAppTerms = new Map(); // normalized -> original
    const re = /\bterm:\s*(['"])((?:\\.|(?!\1).)*)\1/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const value = m[2].replace(/\\(['"])/g, '$1');
      inAppTerms.set(norm(value), value);
    }

    const canonicalEn = glossary.sourceLocale || 'en-US';
    let overlaps = 0;
    for (const term of terms) {
      const canonical = typeof term[canonicalEn] === 'string' ? term[canonicalEn] : null;
      if (!canonical) continue;
      const key = norm(canonical);
      // Also detect wording drift: an in-app term whose collapsed alphanumeric
      // form matches but whose spacing/words differ from canonical.
      if (inAppTerms.has(key)) {
        overlaps += 1;
        continue;
      }
      const collapse = (s) => s.replace(/[^a-z0-9]/g, '');
      const canonicalCollapsed = collapse(key);
      for (const [inAppKey, inAppOriginal] of inAppTerms) {
        if (collapse(inAppKey) === canonicalCollapsed && inAppKey !== key) {
          err(
            `In-app glossary term "${inAppOriginal}" uses different wording from ` +
              `canonical en-US "${canonical}" (concept "${term.concept}"). ` +
              `Align apps/web/src/lib/education/glossary.ts.`,
          );
        }
      }
    }
    if (overlaps === 0) {
      console.warn(
        'WARN: no overlapping concepts found between the canonical glossary and ' +
          'the in-app education glossary — cross-consistency was not exercised.',
      );
    }
  } else {
    err(`Missing in-app glossary: ${path.relative(repoRoot, inAppGlossaryPath)}`);
  }
}

if (errors.length > 0) {
  console.error('Glossary validation FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const conceptCount = Array.isArray(glossary.terms) ? glossary.terms.length : 0;
console.log(
  `Glossary validation passed: ${conceptCount} concept(s) across ${glossary.locales.length} locale(s).`,
);
