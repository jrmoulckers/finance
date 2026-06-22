# AI Agent Incident-Response Runbook

> **Scope.** How to detect, contain, and recover from **AI-agent misbehavior** in
> this repository: prompt injection, credential/secret exposure, runaway or
> incorrect merges, and destructive operations. This is the operational companion
> to [`governance.md`](governance.md) (the NIST AI RMF "Manage" function) and
> [`restrictions.md`](restrictions.md) (the human-gated operations that bound agent
> behavior).
>
> **Audience.** Repo maintainers, the `security-reviewer` agent, and the
> `ai-ops-engineer` agent. When in doubt, **a human decides** — agents must not
> self-clear an incident.

## Severity levels

| Sev    | Definition                                                                                 | Examples                                                                                 | Target response |
| ------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------- |
| **S1** | Active or likely exposure of secrets/financial data, or unauthorized change reached `main` | Leaked token in a commit; RLS-bypassing change merged; mass file deletion pushed         | Immediate       |
| **S2** | Contained bad change on a branch/PR; no merge to `main`; no confirmed data exposure        | Prompt-injected PR caught in review; destructive command attempted but blocked by a hook | Same day        |
| **S3** | Suspicious agent behavior, no impact                                                       | Agent looped on a task; produced low-quality output; tried a gated op and stopped        | Best effort     |

## Threat playbooks

### 1. Prompt injection (malicious instructions in issue/PR/file/tool output)

**Indicators:** an agent suddenly changes scope, edits files outside its work
package, tries to exfiltrate env vars, disables a check, or "follows instructions"
found in issue text, a dependency README, an MCP tool response, or web content.

**Contain**

1. Stop the agent/session (do not let it push further).
2. If a PR is open, **do not merge.** Convert to draft.
3. Quarantine the source: identify which input carried the injected instruction
   (issue body, fetched URL, MCP `memory`/`context7` response, dependency file).

**Eradicate / recover**

4. Discard the branch (`git worktree remove`, delete the branch) or hard-reset to
   the last known-good commit. Re-do the work from a clean prompt.
5. Edit/redact the malicious source input (issue/comment) so it cannot re-trigger.
6. If the injection came from an MCP server, disable that server in
   [`.vscode/mcp.json`](../../.vscode/mcp.json) until reviewed (see
   [`mcp.md`](mcp.md) → permission matrix; `filesystem`, `memory`, and `context7`
   are the highest-risk).

**Prevent:** least-privilege MCP scope, never auto-trust tool/web output as
instructions, keep the `filesystem` MCP root secret-free, and keep work packages
file-exclusive so out-of-scope edits stand out in review.

### 2. Credential / secret exposure

**Indicators:** gitleaks/TruffleHog hit, a secret-looking string in a diff, a token
printed to logs, or `.env`/`*.key`/`secrets/**` read by an agent or MCP server.

**Contain (S1 — treat any real secret as compromised)**

1. **Rotate the credential immediately** — do not wait to confirm exposure scope.
   (Supabase token, GitHub PAT, signing key, API key, etc.)
2. If it reached `main`, the secret is in history: rotation is mandatory even after
   removal, because the value is permanently recoverable from the git history.
3. Revoke any sessions/tokens derived from it.

**Eradicate / recover**

4. Remove the secret from the codebase; replace with an env-var reference and a
   `*.example` placeholder (per [`restrictions.md`](restrictions.md) Category 7).
5. If only on a branch: amend/rebase to drop it, force-with-lease the branch.
6. If on `main`: file an S1, rotate (already done), and have a human decide whether
   history rewrite (`git filter-repo`) is warranted vs. rotation-only.
7. Add/extend a `.gitleaks.toml` rule so the specific pattern is caught next time.

**Prevent:** blocking gitleaks + TruffleHog (already required via the gatekeeper),
pre-commit/pre-push secret scan, terminal denylist for `.env*`/`secrets/**` reads
in [`.vscode/settings.json`](../../.vscode/settings.json), and never passing secrets
on argv (MCP tokens flow via env — see `mcp.json`).

### 3. Runaway / incorrect merge

**Indicators:** a PR merged with red or skipped required checks, a self-merge of a
PR the agent did **not** author, a merge while `CONFLICTING`/`DIRTY`, or a flood of
auto-created PRs.

**Contain**

1. Identify the merge commit: `git log --merges origin/main -n 20`.
2. Assess blast radius: did staging auto-deploy? Did it touch schema, RLS, auth,
   or money-movement code?

**Eradicate / recover**

3. **Revert** the merge commit: `git revert -m 1 <merge-sha>`, open a PR, and land
   it through the normal gate. Human revert authority always wins.
4. If a bad **migration** was applied, do **not** improvise SQL — use the matching
   `down/<name>.down.sql` and have a human review before applying (see
   [`restrictions.md`](restrictions.md) Category 8). The
   `Reverse Migration Coverage` check guarantees a down file exists.
5. Pause the offending agent/fleet; review its prompt and the quality gate that let
   it through.

**Prevent:** the self-merge policy is **own-authored PRs only, after CI green AND
`MERGEABLE`** (see [Control Environment](responsible-ai.md#the-control-environment));
cross-author merges stay human-gated; "Include administrators" + required
gatekeeper check (once enabled — see [`branch-protection.md`](../../.github/branch-protection.md))
make the gate non-bypassable.

### 4. Destructive operation (bulk delete, history rewrite, DB drop)

**Indicators:** `rm -rf`/`Remove-Item -Recurse`, wildcard deletes, `DROP`/`TRUNCATE`,
`DELETE` without `WHERE`, `git push --force` (non-lease), or a force-push to a shared
branch.

**Contain & recover**

1. Most of these are blocked pre-merge by the terminal denylist and hooks. If one
   landed: recover deleted files from git (`git restore`, `git reflog`,
   `git fsck --lost-found`).
2. For DB destructive ops: these are human-gated and must never run against
   staging/production from an agent. If one ran against a local dev DB only, restore
   from the migration `up`/`down` pair. If against shared infra, escalate to a human
   DBA immediately — **agents must stop.**

**Prevent:** [`restrictions.md`](restrictions.md) Categories 5 & 8, the terminal
denylist, branch protection (no force-push, no deletions on `main`).

## Standard response loop (all incidents)

1. **Detect** — CI alert, review catch, hook block, or human report.
2. **Triage** — assign Sev (S1–S3); for S1 page a human immediately.
3. **Contain** — stop the agent; prevent merge/push; quarantine the input.
4. **Eradicate** — revert/reset/rotate as per the relevant playbook.
5. **Recover** — re-do the work from a clean prompt through the normal gate.
6. **Document** — append an entry to the incident log (below) and, for S1/S2, add a
   note to [`CHANGELOG.md`](CHANGELOG.md).
7. **Learn** — add a control (denylist rule, hook, required check, prompt guardrail)
   so the same class can't recur. Update this runbook.

## Incident log

Record S1/S2 incidents here (newest first). Keep PII/secrets **out** of this log —
reference issue/PR numbers, not values.

| Date | Sev | Class | Summary                      | Issue/PR | Control added |
| ---- | --- | ----- | ---------------------------- | -------- | ------------- |
| —    | —   | —     | _No incidents recorded yet._ | —        | —             |

## Related

- [`governance.md`](governance.md) — NIST AI RMF crosswalk (this runbook is the "Manage" control)
- [`restrictions.md`](restrictions.md) — human-gated operations (Categories 1–8)
- [`responsible-ai.md`](responsible-ai.md) — the real control environment
- [`mcp.md`](mcp.md) — MCP server permissions and supply-chain cautions
- [`.github/branch-protection.md`](../../.github/branch-protection.md) — required checks and human setup

---

_Last reviewed: 2026-06. Owner: `security-reviewer` + `ai-ops-engineer`. Run a
tabletop drill of playbooks 1–4 at least once per quarter and update the log._
