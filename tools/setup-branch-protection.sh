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
#
# NOT idempotent with respect to live state. The REST call is a *full
# replacement* of the branch's protection config, so re-running reverts any
# setting that was applied out-of-band (UI, another script) and is not restated
# in the payload below. The pre-flight diff prints exactly what will change
# before anything is written — read it rather than assuming a re-run is a no-op.

set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
BRANCH="${2:-main}"

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

# ---------------------------------------------------------------------------
# Pre-flight: show what this PUT will actually change.
# ---------------------------------------------------------------------------
# Read-only. The desired context list is derived from $PAYLOAD above rather than
# restated here, so the diff can never disagree with what gets applied.

desired_contexts="$(printf '%s\n' "$PAYLOAD" \
  | grep -o '"context": *"[^"]*"' \
  | sed 's/.*"context": *"\(.*\)"/\1/' \
  | sort)"

# Contexts the "Required Checks Gatekeeper" aggregates via its `needs:` list and
# its "Aggregate required security checks" step (.github/workflows/ci-security.yml).
# Only used to soften the removal warning below; if this list goes stale the
# script warns about a context that is in fact covered, which is the safe
# direction to be wrong in.
gatekeeper_covered="CodeQL Analysis (java-kotlin)
CodeQL Analysis (javascript-typescript)
Dependency Review
Gradle Dependency Check
License Compliance
Secret Detection
Secret Scan (gitleaks)
npm Audit"

echo "Reading current protection for ${REPO}@${BRANCH} ..."
# One read, emitted as 8 ordered lines. Contexts are joined on US (\037) because
# check names contain spaces and '&'.
# Branch the on gh's exit status, not on empty output: an unprotected branch
# returns a 404 whose JSON body still satisfies every `//` default below, which
# would otherwise render as a diff full of blank "current" values.
protection_query='[
      (.required_status_checks.contexts // [] | join("\u001f")),
      (.required_status_checks.strict // false),
      (.required_pull_request_reviews.required_approving_review_count // 0),
      (.required_pull_request_reviews.require_code_owner_reviews // false),
      (.required_pull_request_reviews.require_last_push_approval // false),
      (.enforce_admins.enabled // false),
      (.required_conversation_resolution.enabled // false),
      (.required_linear_history.enabled // false)
    ] | map(tostring) | join("\n")'

if current="$(gh api "repos/${REPO}/branches/${BRANCH}/protection" \
      -H "Accept: application/vnd.github+json" \
      --jq "$protection_query" 2>/dev/null)"; then
  :
else
  current=""
fi

# Desired scalars are read back out of $PAYLOAD so they are never stated twice.
pv() {
  printf '%s\n' "$PAYLOAD" \
    | grep -o "\"$1\": *[^,}]*" \
    | head -1 \
    | sed 's/.*: *//' \
    | tr -d ' "'
}

echo
if [ -z "$current" ]; then
  echo "Current state: branch is NOT protected, or protection is unreadable with"
  echo "this token. Everything in the payload will be applied as new."
else
  cur_contexts="$(printf '%s\n' "$current" | sed -n '1p' | tr '\037' '\n' | sed '/^$/d' | sort)"

  echo "Required status checks"
  echo "----------------------"
  added="$(comm -13 <(printf '%s\n' "$cur_contexts") <(printf '%s\n' "$desired_contexts"))"
  removed="$(comm -23 <(printf '%s\n' "$cur_contexts") <(printf '%s\n' "$desired_contexts"))"

  printf '%s\n' "$added" | while IFS= read -r c; do
    [ -n "$c" ] && echo "  + will become required: $c"
  done

  printf '%s\n' "$removed" | while IFS= read -r c; do
    [ -z "$c" ] && continue
    if printf '%s\n' "$gatekeeper_covered" | grep -Fxq "$c"; then
      echo "  - will stop being required: $c  (still enforced via Gatekeeper)"
    else
      echo "  ! will stop being required: $c  ** NOT aggregated by the Gatekeeper **"
    fi
  done

  if [ -z "$added" ] && [ -z "$removed" ]; then
    echo "  (no change)"
  fi

  echo
  echo "Other settings (current -> desired)"
  echo "-----------------------------------"
  field() {
    label="$1"; cur="$2"; desired="$3"
    if [ "$cur" = "$desired" ]; then
      echo "  = ${label}: ${cur}"
    else
      echo "  * ${label}: ${cur} -> ${desired}"
    fi
  }
  field "strict (up to date)"        "$(printf '%s\n' "$current" | sed -n '2p')" "$(pv strict)"
  field "required approving reviews" "$(printf '%s\n' "$current" | sed -n '3p')" "$(pv required_approving_review_count)"
  field "require code owner reviews" "$(printf '%s\n' "$current" | sed -n '4p')" "$(pv require_code_owner_reviews)"
  field "require last push approval" "$(printf '%s\n' "$current" | sed -n '5p')" "$(pv require_last_push_approval)"
  field "enforce for administrators" "$(printf '%s\n' "$current" | sed -n '6p')" "$(pv enforce_admins)"
  field "conversation resolution"    "$(printf '%s\n' "$current" | sed -n '7p')" "$(pv required_conversation_resolution)"
  field "linear history"             "$(printf '%s\n' "$current" | sed -n '8p')" "$(pv required_linear_history)"
fi

echo
echo "About to apply branch protection to ${REPO}@${BRANCH}."
echo "This OVERWRITES the existing protection config for that branch."
echo "Lines marked '!' or '*' above are changes you may not have intended."
read -r -p "Continue? [y/N] " confirm
case "$confirm" in
  [yY][eE][sS]|[yY]) ;;
  *) echo "Aborted."; exit 1 ;;
esac

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
