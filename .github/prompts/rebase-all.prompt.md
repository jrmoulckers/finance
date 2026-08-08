---
name: rebase-all
description: Rebase all open PRs onto the latest default branch
parameters: []
built_ins: []
agent_dependencies: []
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Rebase All — Sync Every Open PR

Inventory open PRs and rebase only branches assigned to and owned by the current session.

## Runtime Contract

Read root `AGENTS.md` and applicable scoped `.github/instructions/`; in the canonical backbone, also
consult source `instructions/`. Stop before session/worktree creation or mutation when the runtime
cannot prove exact branch ownership and applicable authority.

## Execution Plan

### 1. Fetch and Inventory

```bash
git fetch origin <default-branch>
gh pr list --state open --limit 200 --json number,title,headRefName,headRefOid,headRepositoryOwner,isCrossRepository,author,mergeable,statusCheckRollup
```

List open PRs and note existing conflicts.

### 2. Filter by Ownership Before Isolation

For each PR, record exact head repository, branch, and OID. Continue only when the runtime/session
registry proves that the current session created and owns the branch, or the user explicitly assigns
that exact branch to this session and local authority permits rebasing it.

Author name alone is not proof of branch ownership. Fork PRs and human/shared branches are read-only
handoffs by default. Do not create/focus a session or worktree, checkout, rebase, push, or merge an
unowned branch.

### 3. Rebase Each Authorized PR

Process PRs sequentially to avoid worktree conflicts.

Prefer an app-native isolated PR/project session owned by this run. If app-native isolation is
unavailable, require a runtime-provided, explicitly approved worktree location that complies with
root/scoped authority; never invent a sibling path or reuse another session's worktree.

If the local branch does not exist, explicitly create it from the remote head:

```bash
git fetch origin <head-ref>:refs/remotes/origin/<head-ref>
git branch --track <local-branch> origin/<head-ref>
git worktree add <approved-worktree-path> <local-branch>
```

Require an empty `git status --porcelain`, reconfirm the recorded OID/ownership, then rebase:

```bash
git fetch origin <default-branch>
git rebase origin/<default-branch>
```

If the rebase succeeds:

1. Run the repo's relevant format/lint/type-check/test commands.
2. Reconfirm that the current session still owns and is authorized for the exact branch, then push
   with lease:
   ```bash
   git push --force-with-lease origin <branch>
   ```
3. Verify CI and mergeability:
   ```bash
   gh pr checks <number>
   gh pr view <number> --json mergeable,mergeStateStatus
   ```

If conflicts occur:

1. Auto-resolve only trivial conflicts you understand: whitespace, import order, regenerated artifacts, or lockfiles that can be recreated by the repo's package manager.
2. For semantic conflicts, abort and flag for human review:
   ```bash
   git rebase --abort
   ```
3. Record the conflicting files and recommended owner.

The lease push is forbidden for branches that are merely agent-authored, explicitly familiar, or
owned by another session. Never amend commits unless the user explicitly requests it and local
authority permits it.

### 4. Clean Up

Remove only a temporary worktree recorded as created and owned by this run, using its exact approved
path after the PR is pushed or the rebase is safely aborted:

```bash
git worktree remove <approved-owned-worktree-path>
```

Never recursively delete a worktree path and never remove a human/shared/unknown worktree.

### 5. Report

```markdown
## Rebase Report

### Successfully Rebased: X PRs
| PR | Branch | CI Status |
| --- | --- | --- |
| ... |

### Conflicts (Needs Human): X PRs
| PR | Branch | Conflicting Files |
| --- | --- | --- |
| ... |

### Already Up-to-Date: X PRs
| PR | Branch |
| --- | --- |
| ... |
```

Use `--force-with-lease` only for an authorized branch owned by the current session. Never use plain
`git push --force`.
