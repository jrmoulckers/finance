# Branch protection (`main`)

`main` is protected in `jrmoulckers/finance` with the following rules:

## Required status checks

GitHub requires branches to be up to date before merging (`strict: true`) and the following checks to pass:

- `ESLint & Prettier`
- `Secret Detection`
- `CodeQL Analysis (javascript-typescript)`
- `CodeQL Analysis (java-kotlin)`
- `submit-gradle`

## Pull request review policy

- Pull requests are required before merge.
- Required approving reviews: `0` (solo-dev repo)
- Dismiss stale reviews when new commits are pushed: enabled

## Additional protections

- Enforce admins: disabled (admin override is allowed for emergencies)
- Required linear history: enabled
- Allow force pushes: disabled
- Allow deletions: disabled
- Push restrictions: none

## CLI verification

```powershell
gh api repos/jrmoulckers/finance/branches/main/protection
```

Expected highlights:

- `required_status_checks.strict = true`
- required contexts match the list above
- `required_pull_request_reviews.required_approving_review_count = 0`
- `required_linear_history.enabled = true`
- `allow_force_pushes.enabled = false`
- `allow_deletions.enabled = false`
