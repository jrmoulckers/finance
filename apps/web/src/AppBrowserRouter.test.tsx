// SPDX-License-Identifier: BUSL-1.1

/**
 * Regression tests for navbar tab switching (#3551).
 *
 * Guards against react-router v7's default `startTransition`-wrapped navigation
 * leaving stale page content on screen. Every app route is a `lazy()` page
 * behind a shared `<Suspense>` boundary; with transitions enabled React keeps
 * the previously committed page **visible** while the incoming lazy chunk
 * suspends, so the URL/active-nav move but the content does not. `AppBrowserRouter`
 * pins `useTransitions={false}` so navigation is urgent: React hides the old
 * page, the shared Suspense boundary reveals its loader, and the new page commits
 * once its chunk resolves.
 *
 * The user-observable regression signal is **visibility**, not DOM presence:
 * React 19 keeps the outgoing page mounted-but-hidden (`display: none`) while a
 * sibling route suspends. Under the bug the old page stays *visible* with no
 * loader; with the fix it is *hidden* behind the loader. These tests exercise
 * the real `AppBrowserRouter` wrapper, so removing `useTransitions={false}`
 * makes the first test fail.
 */

import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation, useNavigate } from 'react-router';

import { AppBrowserRouter } from './AppBrowserRouter';

/** Mirrors the shared, reused Suspense wrapper every route uses in `routes.tsx`. */
function RouteBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div role="status">Loading page</div>}>{children}</Suspense>;
}

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <nav>
      <span data-testid="active-path">{location.pathname}</span>
      <button type="button" onClick={() => navigate('/accounts')}>
        Accounts nav
      </button>
      <button type="button" onClick={() => navigate('/transactions')}>
        Transactions nav
      </button>
    </nav>
  );
}

/**
 * Builds a fresh harness per test. `React.lazy` memoizes its factory for the
 * life of the component identity, so each test needs its own lazy components to
 * control suspension independently (a module-level lazy would leak resolved
 * state across tests).
 */
function setup() {
  const LazyAccounts = lazy(() => Promise.resolve({ default: () => <h1>Accounts Screen</h1> }));

  let resolveTransactions!: () => void;
  const LazyTransactions = lazy(
    () =>
      new Promise<{ default: ComponentType }>((resolve) => {
        resolveTransactions = () => resolve({ default: () => <h1>Transactions Screen</h1> });
      }),
  );

  window.history.replaceState(null, '', '/accounts');
  render(
    <AppBrowserRouter>
      <Sidebar />
      <Routes>
        <Route
          path="/accounts"
          element={
            <RouteBoundary>
              <LazyAccounts />
            </RouteBoundary>
          }
        />
        <Route
          path="/transactions"
          element={
            <RouteBoundary>
              <LazyTransactions />
            </RouteBoundary>
          }
        />
      </Routes>
    </AppBrowserRouter>,
  );

  return {
    resolveTransactions: () => resolveTransactions(),
  };
}

/** Resolve a pending lazy chunk and flush React's retry. */
async function resolveAndFlush(resolve: () => void) {
  await act(async () => {
    resolve();
    await Promise.resolve();
  });
}

describe('navbar tab switching (#3551)', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('hides the previous page and shows the loader immediately when switching to a still-loading tab', async () => {
    setup();
    expect(await screen.findByText('Accounts Screen')).toBeVisible();

    fireEvent.click(screen.getByText('Transactions nav'));

    // The URL and the router location both advance to the new tab...
    expect(window.location.pathname).toBe('/transactions');
    await waitFor(() =>
      expect(screen.getByTestId('active-path')).toHaveTextContent('/transactions'),
    );

    // ...the shared Suspense boundary reveals its loader while the chunk streams...
    await waitFor(() => expect(screen.getByRole('status')).toBeVisible());

    // ...and the stale Accounts content must NOT stay on screen. Under
    // react-router's default transition wrapping the suspending Transactions
    // chunk keeps the old Accounts page *visible* here — the core regression.
    expect(screen.getByText('Accounts Screen')).not.toBeVisible();
  });

  it('renders the destination page once its lazy chunk resolves', async () => {
    const { resolveTransactions } = setup();
    await screen.findByText('Accounts Screen');

    fireEvent.click(screen.getByText('Transactions nav'));
    await waitFor(() => expect(screen.getByRole('status')).toBeVisible());

    await resolveAndFlush(resolveTransactions);

    expect(await screen.findByText('Transactions Screen')).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/transactions');
  });

  it('supports switching back and forth between tabs', async () => {
    const { resolveTransactions } = setup();
    await screen.findByText('Accounts Screen');

    // Accounts -> Transactions (resolve the chunk so it commits).
    fireEvent.click(screen.getByText('Transactions nav'));
    await waitFor(() => expect(screen.getByRole('status')).toBeVisible());
    await resolveAndFlush(resolveTransactions);
    expect(await screen.findByText('Transactions Screen')).toBeVisible();

    // Transactions -> Accounts: content must follow the URL back. Accounts is
    // already resolved, so it commits synchronously and Transactions unmounts
    // outright (no hidden-but-present retention this time).
    fireEvent.click(screen.getByText('Accounts nav'));
    expect(await screen.findByText('Accounts Screen')).toBeVisible();
    expect(screen.queryByText('Transactions Screen')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/accounts');
  });
});
