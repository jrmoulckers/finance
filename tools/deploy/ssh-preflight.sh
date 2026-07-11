#!/usr/bin/env bash
# =============================================================================
# ssh-preflight.sh — fail fast with an actionable diagnostic when the staging
# deploy host is unreachable (#2794).
# =============================================================================
#
# The staging deploy SSHes into an Azure VM to rebuild apps/web/dist and update
# the backend Docker Compose stack. When DEPLOY_HOST is stale/rotated or the VM
# is down, a bare `ssh` fast-fails in ~4s with a cryptic "Connection refused" /
# "Could not resolve hostname" error. That reads like a code/CI regression when
# it is really an infrastructure/secret issue.
#
# This helper probes TCP reachability and scans the SSH host key BEFORE the real
# `ssh` runs, so the failure is:
#   - fast and unambiguous (TCP unreachable vs. SSH not responding),
#   - clearly attributed to infra/secrets (with a GitHub step-summary note),
#   - non-cryptic (points operators at DEPLOY_HOST / the VM / the NSG).
#
# On success it appends the scanned host key to known_hosts so the subsequent
# `ssh -o BatchMode=yes` call has a trusted entry and never blocks on a prompt.
#
# Usage:
#   tools/deploy/ssh-preflight.sh <host> [port] [known_hosts_path]
#
# Env:
#   SSH_PREFLIGHT_TIMEOUT   per-probe timeout in seconds (default 15)
#   GITHUB_STEP_SUMMARY     optional; a human-readable summary is appended here
#
# Exit codes: 0 = reachable (host key recorded); 1 = unreachable; 2 = bad usage.
# =============================================================================
set -euo pipefail

HOST="${1:-}"
PORT="${2:-22}"
KNOWN_HOSTS="${3:-${HOME}/.ssh/known_hosts}"
TIMEOUT_SECS="${SSH_PREFLIGHT_TIMEOUT:-15}"

if [ -z "$HOST" ]; then
  echo "::error::ssh-preflight: DEPLOY_HOST is empty — the staging secret is not configured. See #2794."
  exit 2
fi

summary() {
  # Best-effort: only write when running inside GitHub Actions.
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$@" >> "$GITHUB_STEP_SUMMARY" || true
  fi
}

mkdir -p "$(dirname "$KNOWN_HOSTS")"

# 1) TCP reachability — distinguishes "VM down / DNS failure / firewall" (this
#    check fails) from "reachable but auth/SSH problem" (this check passes).
if ! timeout "$TIMEOUT_SECS" bash -c ": < /dev/tcp/${HOST}/${PORT}" 2>/dev/null; then
  echo "::error::Staging VM unreachable: cannot open TCP ${HOST}:${PORT} within ${TIMEOUT_SECS}s (DNS failure, host down, or firewall). Infra/secret issue — see #2794."
  summary \
    "### ❌ Staging VM unreachable (#2794)" \
    "" \
    "Could not open a TCP connection to \`${HOST}:${PORT}\` within ${TIMEOUT_SECS}s." \
    "" \
    "This is an infrastructure/secret issue, **not** a code regression. Verify:" \
    "- The staging Azure VM is powered on and reachable at \`DEPLOY_HOST\`." \
    "- \`DEPLOY_HOST\` resolves to the VM's current address (not a rotated/stale one)." \
    "- Port \`${PORT}\` is open in the VM's network security group / firewall."
  exit 1
fi

# 2) Host-key scan — populates known_hosts and confirms an SSH daemon is
#    actually answering (TCP can be open while sshd is down/misconfigured).
if ! ssh-keyscan -T "$TIMEOUT_SECS" -p "$PORT" -H "$HOST" >> "$KNOWN_HOSTS" 2>/dev/null \
  || ! grep -q . "$KNOWN_HOSTS"; then
  echo "::error::ssh-keyscan returned no host key for ${HOST}:${PORT}; TCP is open but SSH is not responding. Infra issue — see #2794."
  summary \
    "### ❌ Staging SSH not responding (#2794)" \
    "" \
    "TCP \`${HOST}:${PORT}\` is open but no SSH host key was returned." \
    "Confirm \`sshd\` is running on the VM and that \`DEPLOY_SSH_KEY\` / \`DEPLOY_USER\` are current."
  exit 1
fi

echo "ssh-preflight: ${HOST}:${PORT} reachable; host key recorded in ${KNOWN_HOSTS}."
