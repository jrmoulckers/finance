# Exchange API enrollment and key-management requirements (#2659)

## API permission matrix

| Exchange | Required permissions | Never request |
| --- | --- | --- |
| Coinbase | Read balances, accounts, transactions/fills. | Trade, transfer, withdrawal. |
| Kraken | Read-only balance, ledger, trades. | Order placement, withdrawal, funding writes. |
| CSV fallback | No API permissions. | Credentials of any kind. |

## Threat model and storage

- API keys/OAuth tokens must be handled by a backend proxy/token vault, not browser local storage.
- Keys must be read-only, scoped per exchange, encrypted at rest, revocable, and auditable.
- UI should surface revoked, expired, rate-limited, and permission-missing states distinctly.

## Enrollment checklist

- Confirm user has read-only API enrollment for the exchange.
- Verify sandbox/test account behavior where supported.
- Validate balances, trades, fees, staking/rewards, and timezone/currency normalization with fixtures.
- Provide manual CSV fallback for users who cannot or will not create keys.

## Recommendation

Keep the connector interfaces and manual/stub providers in web now. Defer live exchange connectors until read-only credentials and backend key management exist.
