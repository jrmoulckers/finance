// SPDX-License-Identifier: BUSL-1.1

/**
 * Tax calculation engine exports.
 *
 * Provides federal income tax, self-employment tax, and quarterly
 * estimated tax calculations for self-employed individuals.
 */

export * from './types';
export * from './federal-brackets';
export * from './self-employment-tax';
export * from './quarterly-estimates';
export * from './tax-loss-harvesting';
export * from './capital-gains';
export * from './contribution-tracker';
export * from './deduction-tagger';
export * from './mileage-log';
