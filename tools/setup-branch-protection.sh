#!/usr/bin/env bash
#
# setup-branch-protection.sh — apply the documented `main` branch protection.
#
# ⚠️  HUMAN-RUN ONLY. AI agents MUST NOT execute this script — changing repo
#     settings is a human-gated operation (see docs/ai/restrictions.md Category 3
#     and AGENTS.md). It is committed as an auditable, repeatable implementation
#     of the settings described in .github/branch-protection.md so a maintainer
#     can apply them with one command instead of clicking through the UI.
#
# What it does:
#   * Requires the always-on "Required Checks Gatekeeper", "ESLint & Prettier",
#     and "Semantic PR Title" status checks.
#   * Requires 2 approving reviews + Code Owner review + dismiss-stale.
#   * Enforces for administrators ("Include administrators").
#   * Requires branches up to date, linear history, and conversation resolution.
#   * Disallows force pushes and deletions.
#
# Requirements: gh CLI authenticated with admin rights on the repo.
# Usage:
#   ./tools/setup-branch-protection.sh [owner/repo] [branch]
# Defaults: repo = current `gh repo view`, branch = main
#
# Review the JSON below against .github/branch-protection.md before running.
# Re-run safely; the PUT is idempotent (it replaces the protection config).

set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
BRANCH="${2:-main}"

echo "About to apply branch protection to ${REPO}@${BRANCH}."
echo "This OVERWRITES the existing protection config for that branch."
read -r -p "Continue? [y/N] " confirm
case "$confirm" in
  [yY][eE][sS]|[yY]) ;;
  *) echo "Aborted."; exit 1 ;;
esac

# Required status checks — must match the exact check names GitHub reports.
# Keep this list in sync with .github/branch-protection.md "Recommended minimum
# required set". The Gatekeeper transitively enforces the granular security jobs.
read -r -d '' PAYLOAD <<'JSON' || true
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "Required Checks Gatekeeper" },
      { "context": "ESLint & Prettier" },
      { "context": "Semantic PR Title" }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 2,
    "require_last_push_approval": true
  },
  "required_linear_history": true,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "restrictions": null
}
JSON

echo "$PAYLOAD" | gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/${REPO}/branches/${BRANCH}/protection" \
  --input -

echo
echo "✅ Branch protection applied to ${REPO}@${BRANCH}."
echo "Remaining human steps (cannot be set here):"
echo "  - Enable GHAS Secret scanning + Push protection, CodeQL, Dependency review."
echo "  - Add a real second Code Owner / reviewer team for the sensitive paths in .github/CODEOWNERS."
echo "  - Remove any '--admin' self-merge override from automation/runbooks."
