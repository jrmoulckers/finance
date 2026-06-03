// SPDX-License-Identifier: BUSL-1.1

/**
 * Inline SVG icons used by the primary navigation.
 *
 * Each icon is a 24×24 viewBox stroke icon — the consuming component
 * controls size and colour via CSS. Icons inherit `currentColor` so they
 * pick up the active / hover / muted nav states automatically.
 */

import type { FC } from 'react';

interface IconProps {
  className?: string;
}

const Svg: FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

export const DashboardIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </Svg>
);

export const AccountsIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
    <path d="M7 15h2" />
  </Svg>
);

export const TransactionsIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M4 7h12" />
    <path d="M13 4l3 3-3 3" />
    <path d="M20 17H8" />
    <path d="M11 20l-3-3 3-3" />
  </Svg>
);

export const BillsIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6" />
    <path d="M9 12h6" />
    <path d="M9 16h4" />
  </Svg>
);

export const InvestmentsIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </Svg>
);

export const SubscriptionsIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <path d="M3 21v-5h5" />
  </Svg>
);

export const BudgetsIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M21 12a9 9 0 1 1-9-9" />
    <path d="M21 12h-9V3" />
  </Svg>
);

export const GoalsIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" />
  </Svg>
);

export const PlanningIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="M8 14h2" />
    <path d="M14 14h2" />
    <path d="M8 18h2" />
    <path d="M14 18h2" />
  </Svg>
);

export const CategoriesIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="3" width="8" height="8" rx="1" />
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
  </Svg>
);

export const InsightsIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M9 21h6" />
    <path d="M10 17h4" />
    <path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1.5 1.7 1.7 2.5h4.6c.2-.8.9-1.7 1.7-2.5A6 6 0 0 0 12 3z" />
  </Svg>
);

export const CashFlowIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M3 17l5-5 4 4 4-6 5 5" />
    <path d="M3 21h18" />
  </Svg>
);

export const NetWorthIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M12 3v18" />
    <path d="M18 7c-1.5-1.5-3.5-2-6-2-3 0-5 1.5-5 3.5S9 12 12 12s5 1 5 3.5-2 3.5-5 3.5c-2.5 0-4.5-.5-6-2" />
  </Svg>
);

export const ReportsIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
    <path d="M9 17v-3" />
    <path d="M12 17v-5" />
    <path d="M15 17v-2" />
  </Svg>
);

export const AchievementsIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <circle cx="12" cy="9" r="6" />
    <path d="M9 14l-2 7 5-3 5 3-2-7" />
  </Svg>
);

export const WatchlistsIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
  </Svg>
);

export const HouseholdIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M21 19c0-2.2-1.7-4-4-4" />
  </Svg>
);

export const BankIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M3 10l9-6 9 6" />
    <path d="M5 10v8" />
    <path d="M9 10v8" />
    <path d="M15 10v8" />
    <path d="M19 10v8" />
    <path d="M3 21h18" />
  </Svg>
);

export const ImportIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </Svg>
);

export const PrivacyIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);

export const MoreIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </Svg>
);

export const ChevronDownIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const CloseIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </Svg>
);

export const SettingsIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);

export const KeyboardIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 9h.01" />
    <path d="M10 9h.01" />
    <path d="M14 9h.01" />
    <path d="M18 9h.01" />
    <path d="M6 13h.01" />
    <path d="M10 13h.01" />
    <path d="M14 13h.01" />
    <path d="M18 13h.01" />
    <path d="M8 17h8" />
  </Svg>
);

export const SignOutIcon: FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);
