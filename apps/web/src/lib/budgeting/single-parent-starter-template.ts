// SPDX-License-Identifier: BUSL-1.1

import type { BudgetStarterTemplate } from './starter-budget-templates';

export const SINGLE_PARENT_FAMILY_TEMPLATE: BudgetStarterTemplate = {
  id: 'family',
  name: 'Single Parent / Family',
  description:
    'A calm starter budget for caregivers balancing school needs, childcare, kid activities, and a small emergency buffer.',
  guidance:
    'Start with the categories that fit this month. Every amount is editable, and small buffers still help when kid costs pop up.',
  isAvailable: true,
  categories: [
    { emoji: '🏠', name: 'Housing', amountCents: 120_000, icon: 'home', color: '#7C3AED' },
    { emoji: '🛒', name: 'Groceries & Household', amountCents: 75_000, icon: 'utensils', color: '#16A34A' },
    { emoji: '🧸', name: 'Childcare', amountCents: 60_000, icon: 'heart-handshake', color: '#EC4899' },
    { emoji: '🎒', name: 'School', amountCents: 15_000, icon: 'graduation-cap', color: '#F59E0B' },
    { emoji: '⚽', name: 'Activities & Sports', amountCents: 12_500, icon: 'dumbbell', color: '#2563EB' },
    { emoji: '🎂', name: 'Birthdays & Parties', amountCents: 7_500, icon: 'gift', color: '#DB2777' },
    { emoji: '🚌', name: 'Field Trips', amountCents: 5_000, icon: 'bus', color: '#0EA5E9' },
    { emoji: '👕', name: 'Kids’ Clothing', amountCents: 20_000, icon: 'shirt', color: '#8B5CF6' },
    { emoji: '🛟', name: 'Family Emergency Buffer', amountCents: 25_000, icon: 'life-buoy', color: '#059669' },
  ],
};
