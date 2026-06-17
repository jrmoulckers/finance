# Connected P2P provider options and consent model (#2646)

## Provider options

| Source | Feasibility | Notes |
| --- | --- | --- |
| Plaid/aggregators | Medium for bank-side transfers, low for full P2P app context. | Can see linked bank transactions but often misses request/payment metadata. |
| Venmo exports | Medium manual fallback. | User exports are credential-free but not reliably automated. |
| Cash App statements | Medium manual fallback. | Statement imports can support reimbursement matching without live credentials. |
| Official consumer APIs | Low. | Consumer-grade APIs are limited or unavailable for many P2P apps. |

## Consent and retention

- Treat P2P data as sensitive social graph data: counterparties, memos, and reimbursements need explicit import consent.
- Store only normalized local records needed for matching, overrides, and audit trail.
- Do not store live tokens in browser storage; use backend token vault if a provider is later approved.

## Recommendation

Implement manual import and local matching first. Keep live connections behind a provider abstraction and require explicit consent, retention controls, and backend token storage before enabling aggregator/P2P connectors.
