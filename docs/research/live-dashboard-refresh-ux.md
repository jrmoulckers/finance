# Live dashboard refresh UX and rate-limit controls (#2639)

## Refresh states

- `live`: quote/account data is within freshness policy.
- `refreshing`: user or scheduler requested an update.
- `delayed`: usable but beyond the fresh threshold.
- `stale`: beyond provider/asset freshness policy.
- `failed`: last refresh failed; keep last good snapshot visible.
- `market-closed`: equities/options can show delayed close values without alarming users.

## Rate limits and backoff

- Use source-specific minimum intervals and jittered exponential backoff after failures.
- Manual refresh should be visible but disabled while a source is actively refreshing or cooling down.
- Crypto can refresh more often because markets are 24/7, but still needs per-source throttles.
- Display last-success time and per-source failures; do not block the whole dashboard when one source fails.

## UX recommendation

Ship the local refresh-state model and stale badges now. Live connectors remain deferred until credentials and provider limits are known. Second-monitor layouts should favor compact status chips, volatile-asset warnings, and non-alarmist wording.
