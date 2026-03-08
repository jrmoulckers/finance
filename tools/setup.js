#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// Usage: node tools/setup.js [--help] [--check]
// One-command setup for the Finance monorepo — validates prerequisites,
// installs dependencies, configures git hooks, and runs the first build.
//
// --check   Run validation only (no install / build) and print a scorecard.

const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const root = path.resolve(__dirname, "..");

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const supportsColor =
  process.stdout.isTTY && !process.env.NO_COLOR;

const fmt = {
  green: (s) => (supportsColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s) => (supportsColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (supportsColor ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s) => (supportsColor ? `\x1b[36m${s}\x1b[0m` : s),
  bold: (s) => (supportsColor ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s) => (supportsColor ? `\x1b[2m${s}\x1b[0m` : s),
};

const ok = (msg) => console.log(`  ${fmt.green("✅")} ${msg}`);
const warn = (msg) => console.log(`  ${fmt.yellow("⚠️")}  ${msg}`);
const fail = (msg) => console.log(`  ${fmt.red("❌")} ${msg}`);
const info = (msg) => console.log(`  ${fmt.dim("ℹ")}  ${msg}`);

// ── --help ────────────────────────────────────────────────────────────────────

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
${fmt.bold("Finance Monorepo Setup")}

Validates prerequisites, installs dependencies, configures git hooks,
and runs the first build.

${fmt.bold("Usage:")}
  node tools/setup.js            Full setup (validate → install → build)
  node tools/setup.js --check    Validate only — print environment scorecard
  npm run setup

${fmt.bold("Options:")}
  --help, -h    Show this help message
  --check       Run validation only (no install / build)
`);
  process.exit(0);
}

const checkOnly = process.argv.includes("--check");

// ── Prerequisite checks ──────────────────────────────────────────────────────

/**
 * Run a command and return trimmed stdout, or null on failure.
 * @param {string} cmd
 * @param {string[]} args
 * @returns {string | null}
 */
function run(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Parse a semver-like version string into [major, minor, patch].
 * @param {string} raw
 * @returns {number[]}
 */
function semver(raw) {
  const m = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

/**
 * Return true when `actual` >= `required` (semver comparison).
 * @param {number[]} actual
 * @param {number[]} required
 * @returns {boolean}
 */
function gte(actual, required) {
  for (let i = 0; i < 3; i++) {
    if (actual[i] > required[i]) return true;
    if (actual[i] < required[i]) return false;
  }
  return true;
}

// Scorecard accumulators
let required_pass = 0;
let required_total = 0;
let optional_pass = 0;
let optional_total = 0;
let failures = 0;

console.log(`\n${fmt.bold("🔍 Checking prerequisites...")}\n`);

// ── Required: Node.js >= 22 ──────────────────────────────────────────────────

required_total++;
const nodeVersion = run("node", ["--version"]);
if (nodeVersion) {
  const parts = semver(nodeVersion);
  if (gte(parts, [22, 0, 0])) {
    ok(`Node.js ${nodeVersion.replace(/^v/, "")}`);
    required_pass++;
  } else {
    fail(
      `Node.js ${nodeVersion} — ${fmt.red("need >= 22")}. Install from https://nodejs.org/`,
    );
    failures++;
  }
} else {
  fail(`Node.js not found. Install from https://nodejs.org/`);
  failures++;
}

// ── Required: npm ────────────────────────────────────────────────────────────

required_total++;
const npmVersion = run("npm", ["--version"]);
if (npmVersion) {
  ok(`npm ${npmVersion}`);
  required_pass++;
} else {
  fail(`npm not found (should ship with Node.js)`);
  failures++;
}

// ── Required: JDK 21 ────────────────────────────────────────────────────────

required_total++;
const javaVersionRaw = run("java", ["-version"]);
const javacVersionRaw = run("javac", ["-version"]);
const jdkVersion = javacVersionRaw || javaVersionRaw;
if (jdkVersion) {
  const parts = semver(jdkVersion);
  if (parts[0] === 21) {
    const label = jdkVersion.includes("Temurin")
      ? jdkVersion
      : `JDK ${parts.join(".")}`;
    ok(label);
    required_pass++;
  } else {
    fail(
      `JDK ${parts.join(".")} detected — ${fmt.red("need JDK 21")}. Install Eclipse Temurin from https://adoptium.net/`,
    );
    failures++;
  }
} else {
  fail(
    `JDK not found. Install Eclipse Temurin 21 from https://adoptium.net/`,
  );
  failures++;
}

// ── Required: Git >= 2.40 ────────────────────────────────────────────────────

required_total++;
const gitVersionRaw = run("git", ["--version"]);
if (gitVersionRaw) {
  const parts = semver(gitVersionRaw);
  if (gte(parts, [2, 40, 0])) {
    ok(`Git ${parts.join(".")}`);
    required_pass++;
  } else {
    fail(
      `Git ${parts.join(".")} — ${fmt.red("need >= 2.40")}. Update from https://git-scm.com/`,
    );
    failures++;
  }
} else {
  fail(`Git not found. Install from https://git-scm.com/`);
  failures++;
}

// ── Required: Docker (needed for Supabase local dev) ─────────────────────────

required_total++;
const dockerVersionRaw = run("docker", ["--version"]);
if (dockerVersionRaw) {
  const parts = semver(dockerVersionRaw);
  ok(`Docker ${parts.join(".")}`);
  required_pass++;
  // Also check if the daemon is actually running
  const dockerPing = run("docker", ["info"]);
  if (!dockerPing) {
    warn(
      `Docker is installed but the daemon may not be running. Start Docker Desktop for Supabase local dev.`,
    );
  }
} else {
  fail(
    `Docker not found — required for Supabase local dev. Install from https://www.docker.com/products/docker-desktop/`,
  );
  failures++;
}

// ── Optional: ANDROID_HOME (Android development) ─────────────────────────────

console.log(`\n${fmt.bold("📱 Optional tooling...")}\n`);

optional_total++;
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (androidHome && fs.existsSync(androidHome)) {
  ok(`ANDROID_HOME = ${androidHome}`);
  optional_pass++;
} else if (androidHome) {
  warn(
    `ANDROID_HOME is set (${androidHome}) but the path does not exist`,
  );
} else {
  info(
    `ANDROID_HOME not set — only needed for Android development. See https://developer.android.com/studio`,
  );
}

// ── Optional: VS Code extensions ─────────────────────────────────────────────

console.log(`\n${fmt.bold("🧩 VS Code extensions...")}\n`);

/**
 * Return an array of recommended extension IDs from .vscode/extensions.json.
 * Returns [] if the file is missing or unparseable.
 * @returns {string[]}
 */
function loadRecommendedExtensions() {
  const extPath = path.join(root, ".vscode", "extensions.json");
  try {
    const raw = fs.readFileSync(extPath, "utf8");
    // Strip single-line comments (// ...) so JSON.parse succeeds
    const stripped = raw.replace(/\/\/.*$/gm, "");
    const parsed = JSON.parse(stripped);
    return Array.isArray(parsed.recommendations)
      ? parsed.recommendations
      : [];
  } catch {
    return [];
  }
}

/**
 * Best-effort check for whether a VS Code extension is installed.
 *
 * Strategy:
 *   1. Try `code --list-extensions` (works when VS Code / CLI is on PATH).
 *   2. Fall back to scanning the default extensions directory on disk.
 *
 * @returns {{ installed: string[], missing: string[] }}
 */
function checkVSCodeExtensions(recommended) {
  // Attempt 1: `code --list-extensions`
  const codeList = run("code", ["--list-extensions"]);
  if (codeList) {
    const installed = new Set(
      codeList.split(/\r?\n/).map((e) => e.trim().toLowerCase()),
    );
    const found = [];
    const missing = [];
    for (const ext of recommended) {
      if (installed.has(ext.toLowerCase())) {
        found.push(ext);
      } else {
        missing.push(ext);
      }
    }
    return { installed: found, missing };
  }

  // Attempt 2: scan default extensions directory
  const extDirs = [];
  const home = os.homedir();
  extDirs.push(path.join(home, ".vscode", "extensions"));
  if (process.platform === "linux") {
    extDirs.push(path.join(home, ".vscode-server", "extensions"));
  }

  /** @type {Set<string>} */
  const installedPrefixes = new Set();
  for (const dir of extDirs) {
    try {
      for (const entry of fs.readdirSync(dir)) {
        // Extension dirs look like "publisher.name-1.2.3"
        const m = entry.match(/^(.+?)-\d+/);
        if (m) installedPrefixes.add(m[1].toLowerCase());
      }
    } catch {
      // directory doesn't exist — skip
    }
  }

  if (installedPrefixes.size === 0) {
    return { installed: [], missing: recommended };
  }

  const found = [];
  const missing = [];
  for (const ext of recommended) {
    if (installedPrefixes.has(ext.toLowerCase())) {
      found.push(ext);
    } else {
      missing.push(ext);
    }
  }
  return { installed: found, missing };
}

const recommended = loadRecommendedExtensions();
if (recommended.length === 0) {
  info("No recommended extensions found in .vscode/extensions.json");
} else {
  const { installed, missing } = checkVSCodeExtensions(recommended);
  optional_total += recommended.length;
  optional_pass += installed.length;

  for (const ext of installed) {
    ok(ext);
  }
  for (const ext of missing) {
    warn(`${ext} — ${fmt.dim("not installed")}`);
  }

  if (missing.length > 0) {
    info(
      `Install missing extensions: ${fmt.cyan("code --install-extension <id>")}`,
    );
  }
}

// ── Scorecard ────────────────────────────────────────────────────────────────

console.log(`\n${fmt.bold("📊 Environment Scorecard")}`);
console.log(`${"─".repeat(48)}`);
console.log(
  `  Required   ${fmt.bold(`${required_pass}/${required_total}`)}  ${required_pass === required_total ? fmt.green("PASS") : fmt.red("FAIL")}`,
);
console.log(
  `  Optional   ${fmt.bold(`${optional_pass}/${optional_total}`)}  ${optional_pass === optional_total ? fmt.green("ALL") : fmt.yellow(`${optional_total - optional_pass} missing`)}`,
);
const total_pass = required_pass + optional_pass;
const total_total = required_total + optional_total;
const pct = total_total > 0 ? Math.round((total_pass / total_total) * 100) : 100;
const pctColor = pct === 100 ? fmt.green : pct >= 70 ? fmt.yellow : fmt.red;
console.log(`  Overall    ${pctColor(fmt.bold(`${pct}%`))}`);
console.log(`${"─".repeat(48)}\n`);

if (failures > 0) {
  console.log(
    `${fmt.red("⛔")} ${failures} required prerequisite(s) missing — fix the issues above and re-run ${fmt.cyan("npm run setup")}.\n`,
  );
  process.exit(1);
}

// ── --check exits here ───────────────────────────────────────────────────────

if (checkOnly) {
  console.log(
    `${fmt.green("✅")} All required checks passed. Run ${fmt.cyan("npm run setup")} (without --check) to install and build.\n`,
  );
  process.exit(0);
}

// ── Install dependencies ─────────────────────────────────────────────────────

console.log(`\n${fmt.bold("📦 Installing dependencies...")}\n`);

try {
  execFileSync("npm", ["install"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  ok("npm install complete");
} catch {
  fail("npm install failed — check the output above for details");
  process.exit(1);
}

// ── Configure git hooks ──────────────────────────────────────────────────────

console.log(`\n${fmt.bold("🔧 Configuring git hooks...")}\n`);

try {
  execFileSync("git", ["config", "core.hooksPath", "tools/git-hooks"], {
    cwd: root,
    stdio: "ignore",
  });
  ok("Hooks path set to tools/git-hooks");
} catch {
  fail("Could not configure git hooks — are you inside a git repository?");
  process.exit(1);
}

// ── First build ──────────────────────────────────────────────────────────────

console.log(`\n${fmt.bold("🏗️  Running first build...")}\n`);

try {
  execFileSync("npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  ok("Build successful");
} catch {
  fail("Build failed — check the output above for details");
  process.exit(1);
}

// ── Success ──────────────────────────────────────────────────────────────────

console.log(`
${fmt.bold(fmt.green("🎉 You're all set!"))} Next steps:
  ${fmt.cyan("•")} Run tests:               ${fmt.dim("npm test")}
  ${fmt.cyan("•")} Read the contribution guide: ${fmt.dim(".github/CONTRIBUTING.md")}
  ${fmt.cyan("•")} Start coding!
`);
