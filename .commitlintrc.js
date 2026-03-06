// @ts-check

/** @type {import("@commitlint/types").UserConfig} */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allow only the following commit types
    "type-enum": [
      2,
      "always",
      [
        "feat",     // A new feature
        "fix",      // A bug fix
        "docs",     // Documentation only changes
        "style",    // Changes that do not affect the meaning of the code
        "refactor", // A code change that neither fixes a bug nor adds a feature
        "test",     // Adding missing tests or correcting existing tests
        "chore",    // Other changes that don't modify src or test files
        "ci",       // Changes to CI configuration files and scripts
        "perf",     // A code change that improves performance
      ],
    ],
    // Enforce lowercase subject
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
    // Max header length
    "header-max-length": [2, "always", 100],
    // Warn if no issue reference (e.g., #123) in commit message
    "references-empty": [1, "never"],
  },
};

module.exports = config;
