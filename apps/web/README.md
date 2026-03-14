# @finance/web

Progressive Web App for the Finance multi-platform financial tracking application.
Built with React, TypeScript, and Vite - consuming shared KMP business logic.

## Prerequisites

- **Node.js** >= 22.0.0
- **npm** >= 10.x (ships with Node 22)
- Design tokens built (`npm run build:tokens` from repo root)

## Getting Started

### 1. Install dependencies

From the **repository root** (npm workspaces):

```bash
npm install
```

### 2. Build design tokens (if not already built)

```bash
npm run build:tokens
```

### 3. Start the dev server

```bash
npm run dev -w apps/web
```

The app starts at [http://localhost:5173](http://localhost:5173).

## Available Scripts

| Script               | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Start Vite dev server with HMR           |
| `npm run build`      | Type-check + production build to `dist/` |
| `npm run preview`    | Serve the production build locally       |
| `npm run type-check` | Run TypeScript compiler (no emit)        |
| `npm run lint`       | Lint source files with ESLint            |
| `npm run test`       | Run tests with Vitest                    |
| `npm run test:watch` | Run tests in watch mode                  |
| `npm run clean`      | Remove `dist/` output directory          |

## Project Structure

```
apps/web/
|-- index.html                  # HTML entry point
|-- package.json                # Dependencies & scripts
|-- tsconfig.json               # Strict TypeScript config
|-- vite.config.ts              # Vite bundler configuration
|-- vite-env.d.ts               # Vite client type declarations
|-- public/                     # Static assets (copied to dist/)
+-- src/
    |-- main.tsx                # React root with BrowserRouter
    |-- App.tsx                 # Root component with navigation shell
    |-- routes.tsx              # Route definitions (lazy-loaded pages)
    |-- pages/                  # Page components (code-split)
    |   |-- Dashboard.tsx
    |   |-- Accounts.tsx
    |   |-- Transactions.tsx
    |   |-- Budgets.tsx
    |   |-- Goals.tsx
    |   +-- Settings.tsx
    |-- kmp/                    # KMP integration layer
    |   |-- bridge.ts           # TypeScript interfaces mirroring KMP models
    |   +-- README.md           # KMP connection guide
    +-- theme/                  # Design token consumption
        |-- tokens.css          # CSS custom property imports
        +-- theme.ts            # TypeScript theme object
```

## KMP Integration

The `src/kmp/bridge.ts` file defines TypeScript interfaces that mirror the
Kotlin Multiplatform shared models (`packages/models/`). See
[`src/kmp/README.md`](src/kmp/README.md) for instructions on connecting to
the compiled KMP JS/WASM module.

## Design Tokens

Theme values (colors, spacing, typography, shadows) come from the shared
design token package (`packages/design-tokens/`):

- **CSS custom properties** - imported via `src/theme/tokens.css`
- **TypeScript constants** - exported from `src/theme/theme.ts`

The app respects `prefers-color-scheme`, `prefers-reduced-motion`, and
`prefers-contrast` media queries automatically.

## Accessibility

- Semantic HTML is used as the primary accessibility mechanism
- ARIA attributes are added only when native semantics are insufficient
- All interactive elements are keyboard-accessible
- Focus is managed with visible `:focus-visible` outlines
- Skip-to-content link is provided for keyboard users
- Route loading states use `aria-live` regions

## Security

- **CSP headers** are configured in `vite.config.ts` (no inline scripts, no `eval`)
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- Financial data at rest will be encrypted via the Web Crypto API (SubtleCrypto)

## Building for Production

```bash
npm run build -w apps/web
```

Output is written to `apps/web/dist/`. Serve with any static file server.
