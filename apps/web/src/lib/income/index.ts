// SPDX-License-Identifier: BUSL-1.1

/**
 * Public surface for the expected-income feature (engine + local store).
 *
 * Imported only by the lazily-loaded ExpectedIncomePage, so it does not add
 * weight to any other route's bundle.
 *
 * Refs #2193
 */

export * from './expected-income';
export * from './expected-income-store';
