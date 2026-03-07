#!/usr/bin/env node
// Usage: node tools/setup.js [--help]
// One-command setup for the Finance monorepo — validates prerequisites,
// installs dependencies, configures git hooks, and runs the first build.

const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const supportsColor =
  process.stdout.isTTY && !process.env.NO_COLOR;

const fmt = {
  green: (s) => (supportsColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s) => (supportsColor ? `\x1b[31m${s}\x1b[0m` : s),
  cyan: (s) => (supportsColor ? `\x1b[36m${s}\x1b[0m` : s),
  bold: (s) => (supportsColor ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s) => (supportsColor ? `\x1b[2m${s}\x1b[0m` : s),
};

const ok = (msg) => console.log(`  ${fmt.green("✅")} ${msg}`);
const fail = (msg) => console.log(`  ${fmt.red("❌")} ${msg}`);

// ── --help ────────────────────────────────────────────────────────────────────

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
${fmt.bold("Finance Monorepo Setup")}

Validates prerequisites, installs dependencies, configures git hooks,
and runs the first build.

${fmt.bold("Usage:")}
  node tools/setup.js
  npm run setup

${fmt.bold("Options:")}
  --help, -h   Show this help message
`);
  process.exit(0);
}

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

let failures = 0;

console.log(`\n${fmt.bold("🔍 Checking prerequisites...")}\n`);

// Node.js >= 22
const nodeVersion = run("node", ["--version"]);
if (nodeVersion) {
  const parts = semver(nodeVersion);
  if (gte(parts, [22, 0, 0])) {
    ok(`Node.js ${nodeVersion.replace(/^v/, "")}`);
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

// npm (informational — comes with Node)
const npmVersion = run("npm", ["--version"]);
if (npmVersion) {
  ok(`npm ${npmVersion}`);
} else {
  fail(`npm not found (should ship with Node.js)`);
  failures++;
}

// JDK 21
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

// Git >= 2.40
const gitVersionRaw = run("git", ["--version"]);
if (gitVersionRaw) {
  const parts = semver(gitVersionRaw);
  if (gte(parts, [2, 40, 0])) {
    ok(`Git ${parts.join(".")}`);
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

if (failures > 0) {
  console.log(
    `\n${fmt.red("⛔")} ${failures} prerequisite(s) missing — fix the issues above and re-run ${fmt.cyan("npm run setup")}.\n`,
  );
  process.exit(1);
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
