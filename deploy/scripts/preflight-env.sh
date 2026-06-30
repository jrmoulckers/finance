#!/usr/bin/env bash
# SPDX-License-Identifier: BUSL-1.1
#
# preflight-env.sh — verify the auth-email environment before `docker compose up`.
#
# Catches the #1 cause of "password reset says it was sent but no email
# arrives": SMTP left unconfigured, or the /reset-password recovery redirect
# missing from the GoTrue allow list (AUTH_REDIRECT_URLS). Because the web UI
# is privacy-preserving (#3107) it always reports success, so a broken mail
# pipeline is otherwise invisible until a user complains.
#
# Prints variable NAMES and a pass/fail mark only — it NEVER prints the values,
# so it is safe to run in CI logs.
#
# Usage:
#   deploy/scripts/preflight-env.sh [path/to/.env]
#
# With no argument it loads deploy/.env (next to docker-compose.yml); if that
# file is absent it validates the already-exported environment instead.
#
# Exit code 0 = ready to deploy; 1 = one or more required settings missing.
#
# Refs #3179. Full setup + DNS (SPF/DKIM/DMARC) guide: docs/ops/password-reset-email.md.

set -euo pipefail

ENV_FILE="${1:-"$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"}"

if [[ -f "$ENV_FILE" ]]; then
  echo "Preflight: loading environment from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
else
  echo "Preflight: no env file at $ENV_FILE — validating the current environment"
fi

errors=0

# is_placeholder VALUE -> success (0) when empty or still a template placeholder.
is_placeholder() {
  local value="${1:-}"
  [[ -z "$value" ]] && return 0
  case "$value" in
  *YOUR_* | *your_* | CHANGE_ME* | changeme* | REPLACE_ME*) return 0 ;;
  *) return 1 ;;
  esac
}

# require VAR_NAME "hint" -> records an error when the var is unset/placeholder.
require() {
  local name="$1" hint="$2" value="${!1:-}"
  if is_placeholder "$value"; then
    echo "  x $name — missing or still a placeholder ($hint)"
    errors=$((errors + 1))
  else
    echo "  ok $name"
  fi
}

echo "Checking auth-email configuration..."

require SITE_URL "e.g. https://finance.example.com"
require SMTP_HOST "transactional SMTP host"
require SMTP_USER "SMTP username"
require SMTP_PASS "SMTP password / API key"
require SMTP_ADMIN_EMAIL "sender address on a verified domain"

# Cross-field check: the recovery redirect must be on the GoTrue allow list, or
# the reset link silently falls back to SITE_URL and never reaches /reset-password.
if is_placeholder "${AUTH_REDIRECT_URLS:-}"; then
  echo "  x AUTH_REDIRECT_URLS — missing or placeholder (must include the /reset-password URL)"
  errors=$((errors + 1))
elif ! is_placeholder "${SITE_URL:-}"; then
  reset_url="${SITE_URL%/}/reset-password"
  if [[ "${AUTH_REDIRECT_URLS}" != *"${reset_url}"* ]]; then
    echo "  x AUTH_REDIRECT_URLS — does not contain ${reset_url}"
    echo "      (GoTrue will drop the reset redirect and fall back to SITE_URL)"
    errors=$((errors + 1))
  else
    echo "  ok AUTH_REDIRECT_URLS (includes /reset-password)"
  fi
else
  echo "  ok AUTH_REDIRECT_URLS (set)"
fi

# SMTP_ADMIN_EMAIL sanity: must look like an address on a domain you control.
if ! is_placeholder "${SMTP_ADMIN_EMAIL:-}" && [[ "${SMTP_ADMIN_EMAIL:-}" != *"@"* ]]; then
  echo "  x SMTP_ADMIN_EMAIL — does not look like an email address"
  errors=$((errors + 1))
fi

echo
if ((errors > 0)); then
  echo "Preflight FAILED: $errors auth-email setting(s) need attention."
  echo "Password reset / magic-link / signup emails will NOT be delivered until these are set."
  echo "See docs/ops/password-reset-email.md for the full setup + DNS (SPF/DKIM/DMARC) steps."
  exit 1
fi

echo "Preflight OK: auth-email environment looks ready."
