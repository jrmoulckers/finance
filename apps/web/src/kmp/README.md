# KMP Integration - Web Bridge

This directory contains the TypeScript interface definitions that mirror the
Kotlin Multiplatform (KMP) shared models defined in `packages/models/`.

## Architecture

```
+-------------------------+     +--------------------------+
|  KMP Shared Module      |     |  Web App (React)         |
|  packages/models/       |     |  apps/web/               |
|                         |     |                          |
|  Kotlin data classes ---+-->  |  bridge.ts interfaces    |
|  (Account, Transaction, |     |  (Account, Transaction,  |
|   Budget, Goal, etc.)   |     |   Budget, Goal, etc.)    |
+--------+----------------+     +--------------------------+
         |
         |  Kotlin/JS compiler
         v
+-------------------------+
|  JS artifact            |
|  build/js/packages/     |
|  finance-models/        |
+-------------------------+
```

## How to Connect to the Compiled KMP JS Module

### 1. Build the KMP JS target

From the repository root:

```bash
./gradlew :packages:models:jsProductionLibraryDistribution
```

This produces a JS bundle in `packages/models/build/dist/js/productionLibrary/`.

### 2. Link the KMP artifact

Add the built artifact as a dependency. Two approaches:

**Option A - Direct file reference (development):**

In `vite.config.ts`, add an alias pointing to the compiled JS:

```ts
resolve: {
  alias: {
    "@finance/kmp": resolve(
      __dirname,
      "../../packages/models/build/dist/js/productionLibrary"
    ),
  },
},
```

**Option B - npm workspace link (production):**

Add a `package.json` in the KMP build output and reference it as a workspace:

```json
{
  "dependencies": {
    "@finance/kmp": "file:../../packages/models/build/dist/js/productionLibrary"
  }
}
```

### 3. Create an adapter module

Create `adapter.ts` in this directory to map KMP JS objects to bridge types:

```ts
// Example adapter (actual shape depends on Kotlin/JS compiler output)
import * as kmp from '@finance/kmp';
import type { Account } from './bridge';

export function toAccount(kmpAccount: kmp.com.finance.models.Account): Account {
  return {
    id: kmpAccount.id.value,
    householdId: kmpAccount.householdId.value,
    name: kmpAccount.name,
    type: kmpAccount.type.name as Account['type'],
    currency: {
      code: kmpAccount.currency.code,
      decimalPlaces: kmpAccount.currency.decimalPlaces,
    },
    currentBalance: { amount: Number(kmpAccount.currentBalance.amount) },
    isArchived: kmpAccount.isArchived,
    sortOrder: kmpAccount.sortOrder,
    icon: kmpAccount.icon,
    color: kmpAccount.color,
    createdAt: kmpAccount.createdAt.toString(),
    updatedAt: kmpAccount.updatedAt.toString(),
    deletedAt: kmpAccount.deletedAt?.toString() ?? null,
    syncVersion: Number(kmpAccount.syncVersion),
    isSynced: kmpAccount.isSynced,
  };
}
```

### 4. WASM alternative

If targeting Kotlin/WASM instead of Kotlin/JS:

```bash
./gradlew :packages:models:wasmJsBrowserDistribution
```

The WASM output works similarly but loads via `WebAssembly.instantiate()`.
Update the adapter to handle the WASM memory model for value types.

## Type Safety Contract

The `bridge.ts` interfaces are the **single source of truth** for web-side
type definitions. They must stay in sync with the KMP models:

| KMP Model             | Bridge Interface  |
| --------------------- | ----------------- |
| `Account`             | `Account`         |
| `Transaction`         | `Transaction`     |
| `Budget`              | `Budget`          |
| `Goal`                | `Goal`            |
| `Category`            | `Category`        |
| `User`                | `User`            |
| `Household`           | `Household`       |
| `HouseholdMember`     | `HouseholdMember` |
| `Cents` (value class) | `Cents`           |
| `Currency` (value)    | `Currency`        |
| `SyncId` (value)      | `SyncId` (string) |

When KMP models change, update `bridge.ts` accordingly and run `npm run type-check`
to catch any downstream breakage.
