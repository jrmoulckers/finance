#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1]?.startsWith('--') ? 'true' : (argv[++i] ?? 'true');
    args.set(key, value);
  }
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function gzipSize(path) {
  return gzipSync(readFileSync(path)).byteLength;
}

function findInitialScripts(distDir) {
  const indexPath = join(distDir, 'index.html');
  if (!existsSync(indexPath)) return new Set();
  const html = readFileSync(indexPath, 'utf8');
  const initial = new Set();
  const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/g;
  const preloadRe =
    /<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+\.js)["'][^>]*>/g;
  for (const re of [scriptRe, preloadRe]) {
    for (const match of html.matchAll(re)) {
      initial.add(match[1].replace(/^\//, ''));
    }
  }
  return expandStaticImportGraph(distDir, initial);
}

function expandStaticImportGraph(distDir, entryScripts) {
  const visited = new Set(entryScripts);
  const queue = [...entryScripts];
  while (queue.length > 0) {
    const relative = queue.shift();
    const absolute = join(distDir, relative);
    if (!existsSync(absolute)) continue;
    const source = readFileSync(absolute, 'utf8');
    for (const dependency of findStaticJsImports(source, relative)) {
      if (!visited.has(dependency)) {
        visited.add(dependency);
        queue.push(dependency);
      }
    }
  }
  return visited;
}

function findStaticJsImports(source, importerRelativePath) {
  const imports = [];
  const importRe = /(?:import|export)\s+(?:[^'"()]+?\s+from\s+)?["']([^"']+\.js)["']/g;
  for (const match of source.matchAll(importRe)) {
    const specifier = match[1];
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue;
    imports.push(resolveDistSpecifier(importerRelativePath, specifier));
  }
  return imports;
}

function resolveDistSpecifier(importerRelativePath, specifier) {
  if (specifier.startsWith('/')) return specifier.replace(/^\//, '');
  return resolve(dirname(join('/', importerRelativePath)), specifier)
    .replace(/^\\?\//, '')
    .replaceAll('\\', '/');
}

function checkBundleBudget(distDir, budget) {
  const bundleBudget = budget.bundle;
  if (!bundleBudget) return [];

  const jsFiles = walkFiles(distDir).filter(
    (file) => file.endsWith('.js') && basename(file) !== 'sw.js',
  );
  const initialScripts = findInitialScripts(distDir);
  const failures = [];
  let initialTotal = 0;
  let speculativeTotal = 0;

  for (const file of jsFiles) {
    const relative = file.slice(distDir.length + 1).replaceAll('\\', '/');
    const size = gzipSize(file);
    if (initialScripts.has(relative)) {
      initialTotal += size;
      speculativeTotal += size;
    } else if (relative.includes('route-') || relative.includes('vendor-')) {
      if (size > bundleBudget.maxLazyChunkGzipBytes) {
        failures.push(
          `${relative} gzip ${formatBytes(size)} exceeds lazy chunk budget ${formatBytes(bundleBudget.maxLazyChunkGzipBytes)}`,
        );
      }
    }
  }

  if (initialTotal > bundleBudget.initialJsGzipBytes) {
    failures.push(
      `Initial JS gzip ${formatBytes(initialTotal)} exceeds budget ${formatBytes(bundleBudget.initialJsGzipBytes)}`,
    );
  }
  if (speculativeTotal > bundleBudget.maxSpeculativeJsGzipBytes) {
    failures.push(
      `Speculative JS gzip ${formatBytes(speculativeTotal)} exceeds budget ${formatBytes(bundleBudget.maxSpeculativeJsGzipBytes)}`,
    );
  }

  console.log(
    `Initial JS gzip: ${formatBytes(initialTotal)} across ${initialScripts.size} entry/preload scripts`,
  );
  return failures;
}

function findLighthouseReports(path) {
  if (!path || !existsSync(path)) return [];
  const stat = statSync(path);
  const candidates = stat.isDirectory() ? walkFiles(path) : [path];
  return candidates.filter((file) => file.endsWith('.json'));
}

function routeBudgetFor(urlOrPath, budget) {
  const pathname = safePathname(urlOrPath);
  return budget.routes?.find((route) => matchRoute(route.path, pathname))?.budgets ?? null;
}

function safePathname(urlOrPath) {
  try {
    return new globalThis.URL(urlOrPath).pathname;
  } catch {
    return urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
  }
}

function matchRoute(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(':') || part === pathParts[index]);
}

function checkLighthouseBudget(lighthousePath, budget) {
  const reports = findLighthouseReports(lighthousePath);
  if (lighthousePath && reports.length === 0) {
    return [`No Lighthouse JSON reports found at ${lighthousePath}`];
  }

  const failures = [];
  for (const report of reports) {
    const json = readJson(report);
    const lhr = json.lhr ?? json;
    if (!lhr.audits) continue;
    const routeBudget = routeBudgetFor(lhr.finalUrl ?? lhr.requestedUrl ?? '/', budget);
    if (!routeBudget) continue;

    checkMetric(failures, report, 'largest-contentful-paint', lhr.audits, routeBudget.lcpMs);
    checkMetric(
      failures,
      report,
      'experimental-interaction-to-next-paint',
      lhr.audits,
      routeBudget.inpMs,
      'interaction-to-next-paint',
    );
    checkMetric(failures, report, 'cumulative-layout-shift', lhr.audits, routeBudget.cls);
    checkMetric(failures, report, 'total-blocking-time', lhr.audits, routeBudget.tbtMs);
  }
  return failures;
}

function checkMetric(failures, report, auditName, audits, budgetValue, label = auditName) {
  if (budgetValue === undefined) return;
  const numericValue = audits[auditName]?.numericValue;
  if (typeof numericValue !== 'number') return;
  if (numericValue > budgetValue) {
    failures.push(
      `${basename(report)} ${label} ${round(numericValue)} exceeds budget ${budgetValue}`,
    );
  }
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function formatBytes(bytes) {
  return `${Math.round(bytes / 1024)} KiB`;
}

const args = parseArgs(process.argv.slice(2));
const cwd = process.cwd();
const budgetPath = resolve(cwd, args.get('budget') ?? 'apps/web/performance.budget.json');
const distDir = resolve(cwd, args.get('dist') ?? 'apps/web/dist');
const lighthousePath = args.has('lighthouse') ? resolve(cwd, args.get('lighthouse')) : null;

const budget = readJson(budgetPath);
const failures = [
  ...checkBundleBudget(distDir, budget),
  ...checkLighthouseBudget(lighthousePath, budget),
];

if (failures.length > 0) {
  console.error('Performance budget check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Performance budgets passed for ${budgetPath.slice(dirname(cwd).length + 1)}`);
