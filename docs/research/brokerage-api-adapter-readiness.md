# Brokerage API adapter readiness matrix (#2631)

## Decision options

| Provider | Fit | Auth/storage | Gaps | Recommended path |
| --- | --- | --- | --- | --- |
| Plaid Investments | Broad account coverage and normalized holdings/transactions. | Backend OAuth/link token flow; tokens stored server-side only. | Paid access, sandbox coverage varies by institution. | Best first live aggregator after backend token vault exists. |
| OFX/QFX direct | Useful credential-light import/export bridge. | Local file import; no long-lived token required for files. | Inconsistent broker support and schemas. | Keep as CSV/QFX manual adapter fallback. |
| Interactive Brokers | Strong for power users and intraday data. | Backend gateway/session handling required. | Operationally complex; not a simple client-side adapter. | Later advanced adapter. |
| Schwab/Fidelity | High user value where APIs/enrollment are available. | OAuth/API enrollment; backend proxy and token vault required. | Availability and approval constraints. | Track as provider-specific live adapters. |
| Robinhood export fallback | Practical when API access is unavailable. | User-supplied export files only. | Limited automation. | Support via manual import normalization. |
| Coinbase/Kraken | Useful for crypto balances/trades. | Read-only API keys/OAuth, backend storage/proxy. | Credentials required; venue-specific schemas. | Share connector abstractions with crypto modules. |

## Sandbox checklist

- Use deterministic fixtures for positions, trades, dividends, fees, transfers, partial fills, and symbol aliases.
- Require backend-held OAuth/API tokens before any live connector.
- Keep browser code limited to local files, provider status, and normalized read models.
- Preserve CSV/QFX fallback for unsupported providers.

## Recommendation

Implement data-source-agnostic engines and manual/file adapters now. Defer live provider connectors until credentials, enrollment, and a backend token boundary are available.
