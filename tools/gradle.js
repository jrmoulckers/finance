#!/usr/bin/env node
// Usage: node tools/gradle.js <gradle-args...>
// Cross-platform Gradle wrapper — picks gradlew vs gradlew.bat automatically
// and resolves JDK 21 if available.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const wrapper =
  process.platform === "win32"
    ? path.join(root, "gradlew.bat")
    : path.join(root, "gradlew");

const env = { ...process.env };

// Auto-detect JDK 21 if JAVA_HOME isn't already set to one
if (!env.JAVA_HOME || !env.JAVA_HOME.includes("21")) {
  const candidates =
    process.platform === "win32"
      ? [
          path.join("C:", "Program Files", "Eclipse Adoptium"),
          path.join("C:", "Program Files", "Java"),
        ]
      : ["/usr/lib/jvm", "/Library/Java/JavaVirtualMachines"];

  for (const base of candidates) {
    try {
      const dirs = fs.readdirSync(base);
      const jdk21 = dirs.find((d) => d.includes("jdk-21"));
      if (jdk21) {
        const jdkPath =
          process.platform === "darwin"
            ? path.join(base, jdk21, "Contents", "Home")
            : path.join(base, jdk21);
        env.JAVA_HOME = jdkPath;
        env.PATH = path.join(jdkPath, "bin") + path.delimiter + env.PATH;
        break;
      }
    } catch {
      // Directory doesn't exist, try next
    }
  }
}

try {
  execFileSync(wrapper, process.argv.slice(2), {
    stdio: "inherit",
    cwd: root,
    env,
    shell: true,
  });
} catch (e) {
  process.exit(e.status ?? 1);
}
