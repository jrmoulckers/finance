# Issue Triage Report

> **Generated**: 2025-07-17
> **Open issues triaged**: 247
> **Scope**: All open feature requests and enhancements from competitive research

## Table of Contents

- [1. Thematic Categories](#1-thematic-categories)
  - [1.1 Household & Shared Finances](#11-household--shared-finances-multi-user)
  - [1.2 Accessibility & Inclusive Design](#12-accessibility--inclusive-design)
  - [1.3 Security & Privacy UX](#13-security--privacy-ux)
  - [1.4 Financial Logic & Calculations](#14-financial-logic--calculations)
  - [1.5 Investment & Wealth Management](#15-investment--wealth-management)
  - [1.6 Visualizations & Charts](#16-visualizations--charts)
  - [1.7 AI & Intelligence Features](#17-ai--intelligence-features)
  - [1.8 Platform UX Enhancements](#18-platform-ux-enhancements)
  - [1.9 Integrations & Import/Export](#19-integrations--importexport)
  - [1.10 Onboarding & Education](#110-onboarding--education)
  - [1.11 Alpha Launch](#111-alpha-launch)
- [2. Duplicate & Overlapping Issues](#2-duplicate--overlapping-issues)
- [3. Proposed Milestone Assignments](#3-proposed-milestone-assignments)
- [4. Sprint-Ready Batches](#4-sprint-ready-batches)
- [5. Issues Needing Human Design Decisions](#5-issues-needing-human-design-decisions)

---

## 1. Thematic Categories

### 1.1 Household & Shared Finances (Multi-User)

**27 issues** — The largest cohesive feature area. Covers partner/family accounts, child/teen finances, shared budgets, and collaborative workflows.

#### Core Household Infrastructure (P0 for v2.0)

| #    | Title                                                        | Priority | Labels                   |
| ---- | ------------------------------------------------------------ | -------- | ------------------------ |
| 1780 | Household roles and permissions activation                   | High     | feature, platform:shared |
| 1779 | Household invitation flow with privacy-by-default onboarding | High     | feature, platform:shared |
| 1781 | Selective account sharing for mine/yours/ours finances       | High     | feature, platform:shared |
| 1784 | Shared household budget with flex and category modes         | High     | feature, platform:shared |
| 1786 | Shared savings goals linked to shared finances               | High     | feature, platform:shared |
| 1716 | Household "mine only" privacy boundaries                     | High     | feature, security        |

#### Household Collaboration

| #    | Title                                                         | Priority | Labels                   |
| ---- | ------------------------------------------------------------- | -------- | ------------------------ |
| 1785 | Privacy-aware household dashboard and net worth view          | Medium   | feature, platform:shared |
| 1783 | Per-category sharing and edit permissions                     | Medium   | feature, platform:shared |
| 1782 | Private transaction marking inside shared households          | Medium   | feature, platform:shared |
| 1794 | Recurring shared expenses with auto-split                     | Medium   | feature, platform:shared |
| 1792 | Expense groups with flexible split methods                    | Medium   | feature, platform:shared |
| 1793 | Debt simplification and settlement tracker                    | Medium   | feature, platform:shared |
| 1790 | Partner review queue and tag-for-review workflow              | Medium   | feature, platform:shared |
| 1789 | In-context transaction collaboration                          | Medium   | feature, platform:shared |
| 1791 | Purchase discussion requests above a household threshold      | Low      | feature, enhancement     |
| 1787 | Per-member goal contribution tracking                         | Medium   | feature, platform:shared |
| 1788 | Goal projections and milestone celebrations                   | Medium   | feature, platform:shared |
| 1722 | Partner and household onboarding assistant                    | Medium   | feature, ui              |
| 1733 | Household offboarding and shared-history export               | Medium   | feature, platform:shared |
| 1744 | Collaborative wealth planning with partner and advisor access | Medium   | feature, financial-logic |

#### Child & Teen Accounts

| #    | Title                                             | Priority | Labels                   |
| ---- | ------------------------------------------------- | -------- | ------------------------ |
| 1796 | Child and teen sub-accounts with managed roles    | Medium   | feature, platform:shared |
| 1797 | Automated allowance transfers                     | Medium   | feature, platform:shared |
| 1798 | Chore-linked rewards with approval workflow       | Medium   | feature, platform:shared |
| 1799 | Child savings goals with kid-friendly progress UX | Medium   | feature, platform:shared |
| 1800 | Teen category-based spending limits               | Low      | feature, platform:shared |
| 1728 | Parent approval requests for child spending       | Low      | feature, platform:shared |
| 1729 | Kids financial education feed                     | Low      | feature, enhancement     |
| 1731 | Unusual activity alerts for dependents            | Medium   | feature, platform:shared |

#### Caregiver & Advisor Access

| #    | Title                                                   | Priority | Labels                   |
| ---- | ------------------------------------------------------- | -------- | ------------------------ |
| 1795 | Financial advisor or coach read-only access             | Low      | feature, platform:shared |
| 1730 | Caregiver or guardian access for dependent finances     | Low      | feature, platform:shared |
| 1727 | Anti-coercion safeguards for shared-finance permissions | Medium   | feature, security        |

---

### 1.2 Accessibility & Inclusive Design

**9 issues** — WCAG 2.2 compliance and inclusive design features.

| #    | Title                                                  | Priority | Labels                         |
| ---- | ------------------------------------------------------ | -------- | ------------------------------ |
| 1699 | Reduced-motion compliance for all finance interactions | High     | accessibility, ui, enhancement |
| 1693 | Color-independent financial status indicators          | High     | accessibility, visualization   |
| 1689 | Spoken currency and amount announcements               | High     | accessibility, ui, enhancement |
| 1684 | Full screen-reader parity across platforms             | High     | accessibility, ui, enhancement |
| 1680 | Dynamic type and font scaling parity                   | High     | accessibility, ui, enhancement |
| 1708 | Accessibility preferences step in onboarding           | Medium   | accessibility, ui, enhancement |
| 1703 | Cognitive simplification mode                          | Medium   | accessibility, ui              |
| 1664 | Quiet hours and focus-aware notification suppression   | Medium   | accessibility, ui              |
| 1732 | Simplified elder and caregiver accessibility mode      | Low      | feature, enhancement           |

---

### 1.3 Security & Privacy UX

**24 issues** — Privacy controls, encryption UX, consent management, and security transparency.

#### Critical Privacy Infrastructure

| #    | Title                                                      | Priority | Labels                |
| ---- | ---------------------------------------------------------- | -------- | --------------------- |
| 1641 | Granular consent management with proof and easy withdrawal | High     | feature, security     |
| 1636 | Privacy dashboard with full data inventory                 | High     | feature, security     |
| 1621 | Local-only onboarding path                                 | High     | feature, security     |
| 1612 | Cross-platform app privacy shell                           | High     | feature, security     |
| 1687 | Manual-first trust experience and no-credential-storage    | High     | security, enhancement |

#### Privacy Controls

| #    | Title                                                      | Priority | Labels                |
| ---- | ---------------------------------------------------------- | -------- | --------------------- |
| 1719 | Biometric-protected sensitive categories                   | Medium   | feature, security     |
| 1723 | Encrypted memo handling with redaction and export controls | Medium   | security, enhancement |
| 1682 | Connection audit log and access history                    | Medium   | feature, security     |
| 1677 | Third-party connection transparency and revocation center  | Medium   | feature, security     |
| 1673 | Privacy-preserving crash reporting controls                | Medium   | security, enhancement |
| 1668 | Verified no-telemetry mode with network transparency       | Medium   | feature, security     |
| 1663 | Active devices and remote revoke                           | Medium   | feature, security     |
| 1658 | Selective record erasure controls                          | Medium   | feature, security     |
| 1654 | Self-service data access request package                   | Medium   | feature, security     |
| 1643 | Public privacy mode for balances and amounts               | Medium   | feature, ui           |
| 1616 | Global privacy mode for masking balances and amounts       | Medium   | security, enhancement |
| 1613 | Widget privacy masking across mobile surfaces              | Medium   | ui, enhancement       |
| 1627 | Accountless historical import for evaluation and migration | Medium   | feature, security     |

#### Security Transparency

| #    | Title                                                       | Priority | Labels                |
| ---- | ----------------------------------------------------------- | -------- | --------------------- |
| 1692 | End-to-end encryption explainer and verification center     | Medium   | security, enhancement |
| 1697 | Encryption details center for at-rest, in-transit, and keys | Low      | security, enhancement |
| 1706 | Security transparency center and public report cadence      | Low      | security, enhancement |
| 1711 | VPN and Tor compatibility policy                            | Low      | security, enhancement |
| 1778 | Differential-privacy benchmarking opt-in                    | Low      | feature, security     |
| 1632 | Self-hosted sync option for privacy-focused power users     | Low      | feature, security     |

---

### 1.4 Financial Logic & Calculations

**54 issues** — The largest category. Budgeting engines, debt management, tax tools, savings automation, and cash flow analytics.

#### Budgeting Engine (Core)

| #    | Title                                                        | Priority | Labels                       |
| ---- | ------------------------------------------------------------ | -------- | ---------------------------- |
| 1558 | Zero-based budgeting mode with Ready to Assign               | High     | feature, financial-logic     |
| 1559 | Envelope budgeting with move-money workflow                  | Medium   | feature, financial-logic     |
| 1560 | Budget method selector with starter templates                | Medium   | feature, financial-logic     |
| 1561 | Pay-yourself-first automatic allocation rules                | Medium   | feature, financial-logic     |
| 1562 | True-expenses and sinking-fund target cadences               | Medium   | feature, financial-logic     |
| 1563 | Flex budgeting with fixed, non-monthly, and flexible buckets | Medium   | feature, financial-logic     |
| 1565 | Paycheck-aligned budget periods                              | Medium   | feature, financial-logic     |
| 1566 | Variable-income budgeting mode                               | High     | feature, financial-logic     |
| 1567 | Adaptive starter budgets from spending history               | High     | feature, financial-logic     |
| 1570 | Budget history with copy-forward navigation                  | Medium   | financial-logic, enhancement |

#### Debt & Loan Management

| #    | Title                                                        | Priority | Labels                       |
| ---- | ------------------------------------------------------------ | -------- | ---------------------------- |
| 1662 | Debt payoff planner with avalanche and snowball strategies   | High     | feature, financial-logic     |
| 1681 | Student-loan optimizer with IDR and PSLF comparisons         | High     | feature, financial-logic     |
| 1685 | BNPL aggregation dashboard                                   | High     | feature, financial-logic     |
| 1690 | BNPL loan-stacking and payment-collision alerts              | High     | financial-logic, enhancement |
| 1676 | Debt-paydown goals linked to liability accounts              | Medium   | financial-logic, enhancement |
| 1671 | Debt interest tracker and cost-of-debt insights              | Medium   | financial-logic, enhancement |
| 1666 | Extra-payment impact simulator                               | Medium   | financial-logic, enhancement |
| 1691 | Mortgage amortization, equity growth, and PMI removal alerts | Low      | financial-logic, enhancement |

#### Tax & Self-Employment

| #    | Title                                                       | Priority | Labels                       |
| ---- | ----------------------------------------------------------- | -------- | ---------------------------- |
| 1757 | Self-Employment Tax Workspace                               | High     | feature, visualization       |
| 1705 | Quarterly estimated-tax calculator for freelancers          | High     | feature, financial-logic     |
| 1700 | Business, personal, and split-expense separation engine     | Medium   | feature, financial-logic     |
| 1695 | Tax-deductible transaction tagging and year-end summaries   | Medium   | feature, financial-logic     |
| 1709 | Mileage deduction log with manual and assisted trip capture | Medium   | feature, financial-logic     |
| 1649 | Capital-gains and annual tax summary reporting              | Medium   | feature, financial-logic     |
| 1645 | Tax-loss harvesting opportunities and wash-sale guardrails  | Medium   | feature, financial-logic     |
| 1660 | Tax-location and asset-placement optimizer                  | Medium   | feature, financial-logic     |
| 1653 | Tax-advantaged contribution tracking across account types   | Medium   | feature, financial-logic     |
| 1714 | Expat and foreign-account tax threshold tracking            | Low      | financial-logic, enhancement |

#### Cash Flow & Spending Analytics

| #    | Title                                                      | Priority | Labels                       |
| ---- | ---------------------------------------------------------- | -------- | ---------------------------- |
| 1587 | Cash flow analytics tab with income, spend, and net income | High     | feature, financial-logic     |
| 1569 | Credit-card payment reservation automation                 | High     | feature, financial-logic     |
| 1590 | Safe-to-spend guardrails with minimum balance floors       | Medium   | feature, financial-logic     |
| 1576 | Daily spending line with projected month-end spend         | Medium   | feature, financial-logic     |
| 1574 | Merchant-level spending insights                           | Medium   | financial-logic, enhancement |
| 1582 | Inflation-adjusted year-over-year category comparison      | Medium   | financial-logic, enhancement |
| 1584 | Sankey money-flow report                                   | Medium   | feature, financial-logic     |
| 1607 | Weekly and monthly spending digest recaps                  | Medium   | financial-logic, enhancement |
| 1579 | Calendar heatmap spending view                             | Low      | financial-logic, enhancement |
| 1564 | Values-based budget tags and spending-alignment insights   | Low      | financial-logic, enhancement |

#### Savings & Goals

| #    | Title                                                | Priority | Labels                       |
| ---- | ---------------------------------------------------- | -------- | ---------------------------- |
| 1644 | Linked-account savings goals with automatic progress | High     | feature, financial-logic     |
| 1635 | Rule-based savings transfers and sweep automations   | High     | feature, financial-logic     |
| 1593 | Subscription rationalization dashboard               | High     | feature, financial-logic     |
| 1650 | Emergency-runway calculator                          | Medium   | feature, financial-logic     |
| 1652 | Home-purchase savings readiness tracker              | Medium   | feature, financial-logic     |
| 1640 | Savings challenges and no-spend programs             | Medium   | financial-logic, enhancement |
| 1630 | Round-up savings automation                          | Medium   | feature, financial-logic     |
| 1568 | Month-ahead buffer goal                              | Medium   | feature, financial-logic     |
| 1647 | AI-suggested savings goals from cash-flow patterns   | Medium   | financial-logic, enhancement |

#### Transaction Management

| #    | Title                                                    | Priority | Labels                       |
| ---- | -------------------------------------------------------- | -------- | ---------------------------- |
| 1572 | Transaction rules center with advanced matching logic    | Medium   | feature, financial-logic     |
| 1571 | Transaction review queue with mark-as-reviewed workflow  | Medium   | feature, financial-logic     |
| 1573 | Bulk recategorization and bulk transaction edits         | Medium   | financial-logic, enhancement |
| 1611 | Receipt OCR quick-entry flow                             | Medium   | feature, financial-logic     |
| 1626 | Cross-platform transaction notes and receipt attachments | Medium   | financial-logic, enhancement |
| 1615 | Itemized receipt parsing with auto-split categorization  | Low      | financial-logic, enhancement |
| 1620 | Warranty and return-window reminders tied to receipts    | Low      | financial-logic, enhancement |

#### Subscriptions

| #    | Title                                                       | Priority | Labels                       |
| ---- | ----------------------------------------------------------- | -------- | ---------------------------- |
| 1601 | Free-trial expiry tracking                                  | Medium   | feature, financial-logic     |
| 1598 | Subscription price-increase and recurring anomaly alerts    | Medium   | financial-logic, enhancement |
| 1596 | Subscription cancellation tracker and guided follow-through | Medium   | financial-logic, enhancement |
| 1604 | Subscription lifecycle management with pause and archive    | Low      | financial-logic, enhancement |

#### Real Estate & Property

| #    | Title                                                      | Priority | Labels                   |
| ---- | ---------------------------------------------------------- | -------- | ------------------------ |
| 1678 | Property value sync and home-equity tracking               | Medium   | feature, financial-logic |
| 1686 | Rental property cash-flow, ROI, and tax-category dashboard | Low      | feature, financial-logic |

#### Crypto & Alternative Assets

| #    | Title                                                     | Priority | Labels                       |
| ---- | --------------------------------------------------------- | -------- | ---------------------------- |
| 1672 | Crypto tax lots and DeFi/staking income tracking          | Medium   | feature, financial-logic     |
| 1667 | Crypto portfolio aggregation across exchanges and wallets | Medium   | feature, financial-logic     |
| 1696 | Alternative asset and collectibles tracking               | Low      | financial-logic, enhancement |

---

### 1.5 Investment & Wealth Management

**28 issues** — Retirement planning, portfolio analytics, FIRE, equity compensation, and wealth projections.

#### Retirement Planning

| #    | Title                                                       | Priority | Labels                   |
| ---- | ----------------------------------------------------------- | -------- | ------------------------ |
| 1721 | Retirement readiness score and contribution-gap planner     | High     | feature, financial-logic |
| 1679 | Retirement Monte Carlo Planner with Scenario Modeling       | High     | feature, visualization   |
| 1735 | What-if scenario modeler for major wealth decisions         | High     | feature, financial-logic |
| 1743 | Interactive What-If Scenario Modeler                        | High     | feature, visualization   |
| 1726 | Monte Carlo retirement planner and recession simulator      | Medium   | feature, financial-logic |
| 1737 | Retirement withdrawal strategy and tax-sequencing optimizer | Medium   | feature, financial-logic |
| 1736 | Guaranteed-income integration for Social Security, pensions | Medium   | feature, financial-logic |
| 1688 | Retirement Withdrawal and Tax Strategy Optimizer            | Medium   | feature, visualization   |
| 1683 | Retirement Readiness Score, Income Gap, SS Estimator        | Medium   | feature, visualization   |
| 1738 | 529 and HSA planning workspace                              | Medium   | feature, financial-logic |

#### Portfolio Analytics

| #    | Title                                                     | Priority | Labels                       |
| ---- | --------------------------------------------------------- | -------- | ---------------------------- |
| 1595 | Target-vs-actual asset allocation dashboard               | High     | analytics, financial-logic   |
| 1588 | Lot-level position detail and cost-basis tracking         | High     | feature, financial-logic     |
| 1585 | Investment account taxonomy and tax-treatment metadata    | High     | financial-logic, enhancement |
| 1625 | Investment fee analyzer and long-term fee-drag calculator | High     | feature, financial-logic     |
| 1694 | Portfolio Asset Allocation and Rebalancing Workspace      | Medium   | feature, visualization       |
| 1702 | Investment Fee Drag and 401(k) Fee Analyzer               | Medium   | feature, visualization       |
| 1698 | Portfolio Benchmark, Concentration, and Risk Analytics    | Low      | visualization, enhancement   |
| 1609 | Benchmark comparison and custom benchmark builder         | Medium   | analytics, financial-logic   |
| 1603 | Sector, style, and concentration exposure analysis        | Medium   | analytics, financial-logic   |
| 1600 | Rebalancing planner and drift alerts                      | Medium   | analytics, financial-logic   |
| 1592 | Brokerage trade import with duplicate-safe reconciliation | Medium   | feature, financial-logic     |
| 1617 | Risk-adjusted analytics and portfolio stress testing      | Low      | analytics, financial-logic   |

#### FIRE & Financial Independence

| #    | Title                                                       | Priority | Labels                   |
| ---- | ----------------------------------------------------------- | -------- | ------------------------ |
| 1715 | FIRE dashboard with FI%, CoastFI, and savings-rate progress | Medium   | feature, financial-logic |
| 1675 | FIRE Progress Dashboard                                     | Medium   | feature, visualization   |

#### Equity & Compensation

| #    | Title                                                   | Priority | Labels                   |
| ---- | ------------------------------------------------------- | -------- | ------------------------ |
| 1712 | Equity Compensation Tracker                             | Low      | feature, visualization   |
| 1710 | Equity-compensation tracker for RSUs, options, and ESPP | Low      | feature, financial-logic |
| 1704 | Private-company and angel investment tracker            | Low      | feature, financial-logic |

#### Passive Income

| #    | Title                                               | Priority | Labels                   |
| ---- | --------------------------------------------------- | -------- | ------------------------ |
| 1639 | DRIP, yield-on-cost, and passive-income projections | Medium   | feature, financial-logic |
| 1631 | Dividend calendar with forward income estimates     | Medium   | feature, financial-logic |

#### Wealth Insights

| #    | Title                                                    | Priority | Labels                       |
| ---- | -------------------------------------------------------- | -------- | ---------------------------- |
| 1742 | Personalized wealth-insights digest and NL assistant     | High     | feature, financial-logic, ai |
| 1740 | Investment research workspace with screener and calendar | Low      | analytics, financial-logic   |
| 1739 | ESG score display and ethical-screening alerts           | Low      | feature, financial-logic     |
| 1746 | Investment Recession Simulator                           | Low      | feature, visualization       |

---

### 1.6 Visualizations & Charts

**17 issues** — Dashboard widgets, timelines, trackers, and planning visualizations.

| #    | Title                                                     | Priority | Labels                       |
| ---- | --------------------------------------------------------- | -------- | ---------------------------- |
| 1724 | Sankey Money Flow Visualization                           | Medium   | feature, visualization       |
| 1747 | Monthly and Weekly Narrative Financial Digests            | Medium   | feature, visualization       |
| 1670 | Anonymous Peer Spending Benchmarks by Life Stage          | Medium   | feature, visualization       |
| 1720 | Tax-Advantaged Contribution Tracker (IRA, HSA, FSA)       | Medium   | feature, visualization       |
| 1717 | Dividend, Interest, and Passive Income Tracker            | Low      | feature, visualization       |
| 1707 | Tax Location and Tax-Loss Harvesting Insights             | Low      | feature, visualization       |
| 1745 | Net Worth Timeline with Life Event Milestones             | Low      | visualization, enhancement   |
| 1741 | Calendar Heatmap Spending View                            | Low      | visualization, enhancement   |
| 1578 | Net worth timeline with milestones and asset-class rollup | High     | financial-logic, enhancement |
| 1775 | Financial wellness score dashboard                        | Low      | feature, ui                  |
| 1774 | Estate and End-of-Life Financial Inventory                | Low      | feature, visualization       |
| 1771 | Home Purchase Readiness Tracker                           | Medium   | feature, visualization       |
| 1769 | Life Event Planning Framework                             | Medium   | feature, visualization       |
| 1767 | Job Loss Financial Runway Calculator                      | Medium   | feature, visualization       |
| 1765 | Scholarship and Financial Aid Tracker                     | Low      | feature, visualization       |
| 1763 | Education Funding Planner (529 and Tuition Projection)    | Medium   | feature, visualization       |
| 1761 | Student Loan Payoff Optimizer with PSLF Calculator        | High     | feature, visualization       |

---

### 1.7 AI & Intelligence Features

**12 issues** — ML categorization, NL queries, proactive coaching, and personalized insights.

| #    | Title                                                       | Priority | Labels                       |
| ---- | ----------------------------------------------------------- | -------- | ---------------------------- |
| 1633 | AI Natural Language Financial Query Engine                  | High     | feature, ai                  |
| 1637 | Proactive Overspend and Cash-Flow Coach                     | High     | feature, ai                  |
| 1742 | Personalized wealth-insights digest and NL assistant        | High     | feature, financial-logic, ai |
| 1642 | Personalized AI Financial Recommendations                   | Medium   | feature, ai                  |
| 1661 | Contextual "Explain This" Financial Education Assistant     | Medium   | feature, ai                  |
| 1753 | Receipt OCR and Itemized Transaction Splitting              | Low      | feature, ai                  |
| 1751 | Financial Decision Alignment Score                          | Low      | feature, ai                  |
| 1748 | AI-Suggested Savings Goals and Contribution Nudges          | Low      | feature, ai                  |
| 1665 | Personalized Financial Literacy Learning Path               | Low      | feature, ai                  |
| 1656 | Financial Wellness Insights (Mood Correlation and Anxiety)  | Low      | feature, ai                  |
| 1545 | ML-based transaction auto-categorization from merchant data | —        | enhancement, stretch         |
| 1752 | Natural-language voice transaction capture                  | Low      | feature, ui                  |

---

### 1.8 Platform UX Enhancements

**24 issues** — Notifications, widgets, haptics, gestures, and platform-specific UI.

#### Notifications & Digests

| #    | Title                                                     | Priority | Labels          |
| ---- | --------------------------------------------------------- | -------- | --------------- |
| 1674 | Personalized weekly financial health digest               | Medium   | feature, ui     |
| 1669 | Daily, weekly, and monthly spending digests               | Medium   | feature, ui     |
| 1659 | Transaction confirmation notifications and activity cards | Medium   | feature, ui     |
| 1655 | Channel-specific notification preferences                 | Medium   | ui, enhancement |
| 1651 | Net-worth and goal milestone notifications                | Low      | feature, ui     |
| 1648 | Spending pace and predictive overspend alerts             | Medium   | ui, enhancement |
| 1646 | Configurable budget, goal, and balance threshold alerts   | Medium   | feature, ui     |

#### Gestures, Haptics & Navigation

| #    | Title                                                   | Priority | Labels          |
| ---- | ------------------------------------------------------- | -------- | --------------- |
| 1766 | Home-screen contextual spending insights                | Medium   | ui, enhancement |
| 1764 | Drag-and-drop recategorization in transaction workflows | Low      | ui, enhancement |
| 1762 | Cross-platform undo recovery pattern                    | Medium   | ui, enhancement |
| 1760 | Swipe actions for transaction triage                    | Medium   | ui, enhancement |
| 1758 | Distinct haptic warning for threshold-crossing saves    | Low      | ui, enhancement |
| 1756 | Haptic confirmation on transaction save                 | Medium   | ui, enhancement |
| 1725 | Stable navigation and muscle-memory guardrails          | Low      | ui, enhancement |
| 1634 | Swipeable contextual insight cards                      | Medium   | ui, enhancement |
| 1638 | Reorderable watchlists and tracked lists                | Low      | feature, ui     |

#### Platform-Specific

| #    | Title                                                | Priority | Labels                    |
| ---- | ---------------------------------------------------- | -------- | ------------------------- |
| 1754 | Android quick-entry assistant and launcher shortcuts | Low      | feature, platform:android |
| 1749 | iPad split view and multitasking optimization        | Low      | platform:ios, ui          |
| 1629 | Upcoming bills widget and calendar card              | Medium   | feature, ui               |
| 1623 | Apple Watch quick-entry flow                         | Low      | feature, platform:ios     |
| 1618 | Apple Watch glanceable budget status                 | Low      | feature, platform:ios     |
| 1608 | iOS home-screen budget widget suite                  | Medium   | feature, platform:ios     |
| 1605 | iOS lock-screen quick-entry widget                   | Medium   | feature, platform:ios     |

#### Messaging Integrations (Stretch)

| #    | Title                                                | Priority | Labels                    |
| ---- | ---------------------------------------------------- | -------- | ------------------------- |
| 1500 | Android RCS Business Messaging for financial updates | —        | platform:android, stretch |
| 1499 | Apple Messages for Business for financial updates    | —        | platform:ios, stretch     |

---

### 1.9 Integrations & Import/Export

**18 issues** — Bank connections, data import/export, subscription management, and third-party connectors.

#### Bank Connectivity

| #    | Title                                                         | Priority | Labels                   |
| ---- | ------------------------------------------------------------- | -------- | ------------------------ |
| 1586 | Open Banking Direct Feeds for Supported Institutions          | High     | feature, integration     |
| 1575 | Multi-Aggregator Bank Connectivity with Automatic Failover    | High     | feature, integration     |
| 1583 | Third-Party Connector Permissions and Read-Only Safety Center | High     | feature, integration     |
| 1580 | Imported Transaction Provenance and Correct Date Handling     | High     | integration, enhancement |
| 1577 | Bank Connection Health Center with Staleness Indicators       | High     | integration, enhancement |
| 1591 | BNPL Aggregation and Loan Stacking Alerts                     | High     | feature, integration     |
| 1589 | International Bank Connection Support                         | Medium   | feature, integration     |
| 1594 | Neobank and Crypto Account Integration                        | Medium   | feature, integration     |
| 1602 | Universal Legacy Import Formats and Migration Suite           | High     | feature, integration     |

#### Data Import & Migration

| #    | Title                                                | Priority | Labels                   |
| ---- | ---------------------------------------------------- | -------- | ------------------------ |
| 1599 | Bank Statement PDF Parser and Importer               | Medium   | feature, integration     |
| 1606 | Hybrid Manual Account Reconciliation for Unsupported | Medium   | integration, enhancement |

#### Third-Party Services

| #    | Title                                                        | Priority | Labels                   |
| ---- | ------------------------------------------------------------ | -------- | ------------------------ |
| 1619 | Subscription Intelligence with Cancellation and Price Alerts | Medium   | feature, integration     |
| 1614 | Financial Automation Rule Engine                             | Medium   | feature, integration     |
| 1622 | International Remittance Cost Optimizer                      | Low      | feature, integration     |
| 1628 | Enhanced Merchant Detail Integrations for Amazon and Venmo   | Low      | integration, enhancement |
| 1610 | Personal Data API and Webhooks for Power Users               | Low      | feature, integration     |
| 1597 | Real Estate Auto-Valuation Sync                              | Low      | feature, integration     |

#### Messaging Platforms

| #    | Title                             | Priority | Labels                 |
| ---- | --------------------------------- | -------- | ---------------------- |
| 1755 | Variable Income Adaptive Budgeter | High     | feature, visualization |

---

### 1.10 Onboarding & Education

**9 issues** — Life-event wizards, financial education content, and guided experiences.

| #    | Title                                                          | Priority | Labels                 |
| ---- | -------------------------------------------------------------- | -------- | ---------------------- |
| 1718 | Beginner setup templates and guided budgeting starter modes    | Medium   | feature, ui            |
| 1713 | Contextual feature tooltips instead of long tutorials          | Medium   | ui, enhancement        |
| 1770 | In-app financial education and "explain this" content          | Low      | feature, ui            |
| 1773 | Emotional spending and mood correlation journal                | Low      | feature, ui            |
| 1772 | Relationship Transition Finance Wizard                         | Low      | feature, visualization |
| 1776 | Expat and Foreign Account Tax Compliance Alerts                | Low      | feature, visualization |
| 1777 | Privacy-preserving accountability partner and group challenges | Low      | feature, security, ui  |
| 1665 | Personalized Financial Literacy Learning Path                  | Low      | feature, ai            |
| 1661 | Contextual "Explain This" Financial Education Assistant        | Medium   | feature, ai            |

---

### 1.11 Alpha Launch

**6 issues** — Pre-existing alpha launch preparation tasks.

| #    | Title                                                     | Priority | Labels                     |
| ---- | --------------------------------------------------------- | -------- | -------------------------- |
| 1243 | End-to-end alpha verification across all platforms        | Critical | alpha-launch, effort:l     |
| 1248 | Submit alpha builds to app stores & deploy web            | Low      | effort:m                   |
| 1244 | Obtain Windows code signing certificate                   | Low      | platform:windows, effort:s |
| 1242 | Register Google Play Console & generate Android keystore  | Low      | platform:android, effort:s |
| 1241 | Configure OAuth providers (Google & Apple Sign-In)        | Low      | effort:s                   |
| 1239 | Enroll in Apple Developer Program & configure iOS signing | Low      | platform:ios, effort:m     |

---

## 2. Duplicate & Overlapping Issues

The following issue pairs/groups have significant overlap and should be consolidated before implementation. **Recommendation**: Keep the more detailed issue, close the other with a cross-reference.

### High-Confidence Duplicates (should consolidate)

| Group                          | Issues       | Recommendation                                                       |
| ------------------------------ | ------------ | -------------------------------------------------------------------- |
| What-If Scenario Modeler       | #1735, #1743 | Merge — identical concept (wealth decisions vs. interactive modeler) |
| Equity Compensation Tracker    | #1712, #1710 | Merge — #1710 has richer detail (RSUs, options, ESPP)                |
| Monte Carlo Retirement Planner | #1679, #1726 | Merge — #1679 includes scenario modeling; #1726 adds recession sim   |
| Retirement Readiness Score     | #1683, #1721 | Merge — #1721 is more actionable (contribution-gap planner)          |
| FIRE Dashboard                 | #1675, #1715 | Merge — #1715 is more detailed (FI%, CoastFI, savings-rate)          |
| Investment Fee Analyzer        | #1702, #1625 | Merge — nearly identical scope, #1625 includes long-term drag calc   |
| Calendar Heatmap Spending      | #1741, #1579 | Merge — identical visualization concept                              |
| Net Worth Timeline             | #1745, #1578 | Merge — #1578 has asset-class rollup detail                          |
| Sankey Money Flow              | #1724, #1584 | Merge — visualization (#1724) vs. report (#1584)                     |
| Privacy/Balance Masking        | #1643, #1616 | Merge — same concept: hide balances and amounts                      |
| Expat Tax Tracking             | #1776, #1714 | Merge — foreign-account tax compliance features                      |
| Variable-Income Budgeting      | #1755, #1566 | Merge — identical concept, different scope framing                   |
| Student Loan Optimizer         | #1761, #1681 | Merge — #1681 has IDR/PSLF comparisons detail                        |
| Home Purchase Readiness        | #1771, #1652 | Merge — tracker vs. readiness tracker                                |

### Partial Overlaps (need differentiation or scoping)

| Group                   | Issues                            | Notes                                                                                           |
| ----------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| BNPL Features           | #1685, #1690, #1591               | Dashboard (#1685), alerts (#1690), integration (#1591) — related but distinct scopes            |
| AI Savings Suggestions  | #1748, #1647                      | Both suggest savings goals from patterns — different framing                                    |
| Spending Digests        | #1669, #1607, #1747               | Daily/weekly/monthly — different delivery mechanisms                                            |
| Portfolio Analytics     | #1698, #1609, #1603               | Benchmarks, comparisons, exposure — could be one workspace                                      |
| Asset Allocation        | #1694, #1595                      | Rebalancing workspace vs. target-vs-actual dashboard                                            |
| Retirement Withdrawal   | #1688, #1737                      | Tax strategy optimizer — similar scope, different detail                                        |
| Subscription Management | #1593, #1596, #1598, #1604, #1619 | Rationalization, cancellation, price alerts, lifecycle, intelligence — could be unified feature |
| Financial Education     | #1770, #1661, #1665               | "Explain this", learning path, education content — related                                      |
| Receipt/OCR             | #1753, #1611, #1615               | OCR splitting, quick-entry, itemized parsing — stages of same feature                           |

---

## 3. Proposed Milestone Assignments

### `v1.1-accessibility` — WCAG Compliance and Inclusive Design

**9 issues** — All accessibility-labeled issues. These are compliance requirements, not optional features.

| #    | Title                                                  | Sprint Priority |
| ---- | ------------------------------------------------------ | --------------- |
| 1684 | Full screen-reader parity across platforms             | Sprint 1        |
| 1680 | Dynamic type and font scaling parity                   | Sprint 1        |
| 1699 | Reduced-motion compliance for all finance interactions | Sprint 1        |
| 1693 | Color-independent financial status indicators          | Sprint 1        |
| 1689 | Spoken currency and amount announcements               | Sprint 2        |
| 1708 | Accessibility preferences step in onboarding           | Sprint 2        |
| 1703 | Cognitive simplification mode                          | Sprint 3        |
| 1664 | Quiet hours and focus-aware notification suppression   | Sprint 3        |
| 1732 | Simplified elder and caregiver accessibility mode      | Sprint 3        |

### `v1.1-security` — Security and Privacy UX Improvements

**16 issues** — Core privacy controls required before household features or third-party integrations.

| #    | Title                                                      | Sprint Priority |
| ---- | ---------------------------------------------------------- | --------------- |
| 1641 | Granular consent management with proof and easy withdrawal | Sprint 1        |
| 1636 | Privacy dashboard with full data inventory                 | Sprint 1        |
| 1687 | Manual-first trust experience and no-credential-storage    | Sprint 1        |
| 1612 | Cross-platform app privacy shell                           | Sprint 1        |
| 1621 | Local-only onboarding path                                 | Sprint 2        |
| 1719 | Biometric-protected sensitive categories                   | Sprint 2        |
| 1682 | Connection audit log and access history                    | Sprint 2        |
| 1677 | Third-party connection transparency and revocation center  | Sprint 2        |
| 1668 | Verified no-telemetry mode with network transparency       | Sprint 3        |
| 1663 | Active devices and remote revoke                           | Sprint 3        |
| 1658 | Selective record erasure controls                          | Sprint 3        |
| 1654 | Self-service data access request package                   | Sprint 3        |
| 1673 | Privacy-preserving crash reporting controls                | Sprint 3        |
| 1723 | Encrypted memo handling with redaction and export controls | Sprint 3        |
| 1643 | Public privacy mode for balances and amounts               | Sprint 2        |
| 1613 | Widget privacy masking across mobile surfaces              | Sprint 2        |

### `v1.1-financial` — Core Financial Feature Enhancements

**35 issues** — Budgeting engine, debt management, cash flow, transaction management, and savings.

| #    | Title                                                        | Sprint Priority |
| ---- | ------------------------------------------------------------ | --------------- |
| 1558 | Zero-based budgeting mode with Ready to Assign               | Sprint 1        |
| 1566 | Variable-income budgeting mode                               | Sprint 1        |
| 1567 | Adaptive starter budgets from spending history               | Sprint 1        |
| 1587 | Cash flow analytics tab                                      | Sprint 1        |
| 1578 | Net worth timeline with milestones and asset-class rollup    | Sprint 1        |
| 1559 | Envelope budgeting with move-money workflow                  | Sprint 2        |
| 1560 | Budget method selector with starter templates                | Sprint 2        |
| 1569 | Credit-card payment reservation automation                   | Sprint 2        |
| 1662 | Debt payoff planner with avalanche and snowball strategies   | Sprint 2        |
| 1644 | Linked-account savings goals with automatic progress         | Sprint 2        |
| 1635 | Rule-based savings transfers and sweep automations           | Sprint 3        |
| 1593 | Subscription rationalization dashboard                       | Sprint 3        |
| 1685 | BNPL aggregation dashboard                                   | Sprint 3        |
| 1705 | Quarterly estimated-tax calculator for freelancers           | Sprint 3        |
| 1757 | Self-Employment Tax Workspace                                | Sprint 3        |
| 1572 | Transaction rules center with advanced matching logic        | Sprint 4        |
| 1571 | Transaction review queue with mark-as-reviewed workflow      | Sprint 4        |
| 1561 | Pay-yourself-first automatic allocation rules                | Sprint 4        |
| 1562 | True-expenses and sinking-fund target cadences               | Sprint 4        |
| 1563 | Flex budgeting with fixed, non-monthly, and flexible buckets | Sprint 4        |
| 1565 | Paycheck-aligned budget periods                              | Sprint 4        |
| 1590 | Safe-to-spend guardrails with minimum balance floors         | Sprint 5        |
| 1576 | Daily spending line with projected month-end spend           | Sprint 5        |
| 1574 | Merchant-level spending insights                             | Sprint 5        |
| 1650 | Emergency-runway calculator                                  | Sprint 5        |
| 1695 | Tax-deductible transaction tagging and year-end summaries    | Sprint 5        |
| 1649 | Capital-gains and annual tax summary reporting               | Sprint 5        |
| 1700 | Business, personal, and split-expense separation engine      | Sprint 6        |
| 1573 | Bulk recategorization and bulk transaction edits             | Sprint 6        |
| 1630 | Round-up savings automation                                  | Sprint 6        |
| 1568 | Month-ahead buffer goal                                      | Sprint 6        |
| 1601 | Free-trial expiry tracking                                   | Sprint 6        |
| 1570 | Budget history with copy-forward navigation                  | Sprint 6        |
| 1681 | Student-loan optimizer with IDR and PSLF comparisons         | Sprint 7        |
| 1690 | BNPL loan-stacking and payment-collision alerts              | Sprint 7        |

### `v2.0-household` — Multi-User and Household Features

**27 issues** — Requires v1.1-security privacy controls as a foundation.

| #    | Title                                                        | Sprint Priority |
| ---- | ------------------------------------------------------------ | --------------- |
| 1780 | Household roles and permissions activation                   | Sprint 1        |
| 1779 | Household invitation flow with privacy-by-default onboarding | Sprint 1        |
| 1781 | Selective account sharing for mine/yours/ours finances       | Sprint 1        |
| 1716 | Household "mine only" privacy boundaries                     | Sprint 1        |
| 1784 | Shared household budget with flex and category modes         | Sprint 2        |
| 1786 | Shared savings goals linked to shared finances               | Sprint 2        |
| 1785 | Privacy-aware household dashboard and net worth view         | Sprint 2        |
| 1783 | Per-category sharing and edit permissions                    | Sprint 2        |
| 1782 | Private transaction marking inside shared households         | Sprint 3        |
| 1794 | Recurring shared expenses with auto-split                    | Sprint 3        |
| 1792 | Expense groups with flexible split methods                   | Sprint 3        |
| 1790 | Partner review queue and tag-for-review workflow             | Sprint 3        |
| 1789 | In-context transaction collaboration                         | Sprint 4        |
| 1787 | Per-member goal contribution tracking                        | Sprint 4        |
| 1788 | Goal projections and milestone celebrations                  | Sprint 4        |
| 1793 | Debt simplification and settlement tracker                   | Sprint 4        |
| 1722 | Partner and household onboarding assistant                   | Sprint 4        |
| 1791 | Purchase discussion requests above a household threshold     | Sprint 5        |
| 1727 | Anti-coercion safeguards for shared-finance permissions      | Sprint 5        |
| 1733 | Household offboarding and shared-history export              | Sprint 5        |
| 1796 | Child and teen sub-accounts with managed roles               | Sprint 6        |
| 1797 | Automated allowance transfers                                | Sprint 6        |
| 1799 | Child savings goals with kid-friendly progress UX            | Sprint 6        |
| 1798 | Chore-linked rewards with approval workflow                  | Sprint 7        |
| 1800 | Teen category-based spending limits                          | Sprint 7        |
| 1728 | Parent approval requests for child spending                  | Sprint 7        |
| 1731 | Unusual activity alerts for dependents                       | Sprint 7        |

### `v2.0-wealth` — Investment and Wealth Management

**28 issues** — Advanced investment features requiring v1.1-financial as a foundation.

| #    | Title                                                         | Sprint Priority |
| ---- | ------------------------------------------------------------- | --------------- |
| 1585 | Investment account taxonomy and tax-treatment metadata        | Sprint 1        |
| 1588 | Lot-level position detail and cost-basis tracking             | Sprint 1        |
| 1595 | Target-vs-actual asset allocation dashboard                   | Sprint 1        |
| 1625 | Investment fee analyzer and long-term fee-drag calculator     | Sprint 2        |
| 1721 | Retirement readiness score and contribution-gap planner       | Sprint 2        |
| 1679 | Retirement Monte Carlo Planner with Scenario Modeling         | Sprint 2        |
| 1735 | What-if scenario modeler for major wealth decisions           | Sprint 3        |
| 1600 | Rebalancing planner and drift alerts                          | Sprint 3        |
| 1609 | Benchmark comparison and custom benchmark builder             | Sprint 3        |
| 1592 | Brokerage trade import with duplicate-safe reconciliation     | Sprint 3        |
| 1715 | FIRE dashboard with FI%, CoastFI, and savings-rate progress   | Sprint 4        |
| 1737 | Retirement withdrawal strategy and tax-sequencing optimizer   | Sprint 4        |
| 1736 | Guaranteed-income integration for SS, pensions, annuities     | Sprint 4        |
| 1653 | Tax-advantaged contribution tracking across account types     | Sprint 4        |
| 1645 | Tax-loss harvesting opportunities and wash-sale guardrails    | Sprint 5        |
| 1660 | Tax-location and asset-placement optimizer                    | Sprint 5        |
| 1639 | DRIP, yield-on-cost, and passive-income projections           | Sprint 5        |
| 1631 | Dividend calendar with forward income estimates               | Sprint 5        |
| 1603 | Sector, style, and concentration exposure analysis            | Sprint 5        |
| 1672 | Crypto tax lots and DeFi/staking income tracking              | Sprint 6        |
| 1667 | Crypto portfolio aggregation across exchanges and wallets     | Sprint 6        |
| 1738 | 529 and HSA planning workspace                                | Sprint 6        |
| 1678 | Property value sync and home-equity tracking                  | Sprint 6        |
| 1744 | Collaborative wealth planning with partner and advisor access | Sprint 7        |
| 1742 | Personalized wealth-insights digest and NL assistant          | Sprint 7        |

### `backlog` — Low Priority / Future Consideration

**All remaining issues** not assigned above, including:

- Alpha launch tasks (#1239–#1248)
- Stretch/experimental features (#1500, #1499, #1545)
- Low-priority visualizations (#1774, #1765, #1746, #1741, #1712, etc.)
- Low-priority integrations (#1622, #1628, #1610, #1597)
- Low-priority UX enhancements (#1764, #1758, #1725, #1638, etc.)
- Caregiver/advisor access (#1795, #1730, #1729)
- Lifestyle planning (#1772, #1773, #1774, #1775, #1776, #1777)
- Duplicate issues (keep the more detailed variant; backlog the duplicate)

---

## 4. Sprint-Ready Batches

These are groups of 3–5 related issues that can be assigned to agents with no design decisions required. Each batch has clear acceptance criteria in the issue bodies and well-defined scope.

### Batch 1: Accessibility Foundation (v1.1-accessibility Sprint 1)

**Agent**: @accessibility-reviewer (review) + platform agents (implementation)

| #    | Title                                                  |
| ---- | ------------------------------------------------------ |
| 1684 | Full screen-reader parity across platforms             |
| 1680 | Dynamic type and font scaling parity                   |
| 1699 | Reduced-motion compliance for all finance interactions |
| 1693 | Color-independent financial status indicators          |

**Why sprint-ready**: WCAG 2.2 AA compliance — standards are well-defined, no product decisions needed.

### Batch 2: Privacy Dashboard & Consent (v1.1-security Sprint 1)

**Agent**: @kmp-engineer (core) + platform agents (UI)

| #    | Title                                                 |
| ---- | ----------------------------------------------------- |
| 1641 | Granular consent management with proof and withdrawal |
| 1636 | Privacy dashboard with full data inventory            |
| 1612 | Cross-platform app privacy shell                      |

**Why sprint-ready**: Privacy requirements are compliance-driven (GDPR/CCPA). Acceptance criteria are clear.

### Batch 3: Budgeting Engine Core (v1.1-financial Sprint 1)

**Agent**: @kmp-engineer (shared logic) + @finance-domain (calculations)

| #    | Title                                          |
| ---- | ---------------------------------------------- |
| 1558 | Zero-based budgeting mode with Ready to Assign |
| 1566 | Variable-income budgeting mode                 |
| 1567 | Adaptive starter budgets from spending history |

**Why sprint-ready**: Well-established budgeting paradigms (YNAB, EveryDollar patterns). Acceptance criteria included.

### Batch 4: Cash Flow & Net Worth Views (v1.1-financial Sprint 1)

**Agent**: @kmp-engineer (data) + platform agents (visualization)

| #    | Title                                                     |
| ---- | --------------------------------------------------------- |
| 1587 | Cash flow analytics tab                                   |
| 1578 | Net worth timeline with milestones and asset-class rollup |
| 1576 | Daily spending line with projected month-end spend        |

**Why sprint-ready**: Standard financial visualizations — no novel design decisions.

### Batch 5: Debt Management Suite (v1.1-financial Sprint 2–3)

**Agent**: @finance-domain (logic) + @kmp-engineer (models)

| #    | Title                                           |
| ---- | ----------------------------------------------- |
| 1662 | Debt payoff planner with avalanche and snowball |
| 1685 | BNPL aggregation dashboard                      |
| 1690 | BNPL loan-stacking and payment-collision alerts |
| 1681 | Student-loan optimizer with IDR and PSLF        |

**Why sprint-ready**: Financial math is well-defined. Strategies (avalanche/snowball) are industry standard.

### Batch 6: Bank Connectivity Foundation (v1.1 Integration)

**Agent**: @backend-engineer (API) + @kmp-engineer (sync)

| #    | Title                                                   |
| ---- | ------------------------------------------------------- |
| 1575 | Multi-Aggregator Bank Connectivity with Failover        |
| 1577 | Bank Connection Health Center with Staleness Indicators |
| 1580 | Imported Transaction Provenance and Date Handling       |
| 1583 | Third-Party Connector Permissions and Safety Center     |

**Why sprint-ready**: Backend infrastructure with clear API boundaries. No UX design decisions.

### Batch 7: Household Foundation (v2.0-household Sprint 1)

**Agent**: @backend-engineer (RLS) + @kmp-engineer (models) + platform agents (UI)

| #    | Title                                             |
| ---- | ------------------------------------------------- |
| 1780 | Household roles and permissions activation        |
| 1779 | Household invitation flow with privacy-by-default |
| 1781 | Selective account sharing for mine/yours/ours     |
| 1716 | Household "mine only" privacy boundaries          |

**Why sprint-ready**: Schema additions already approved in copilot-instructions (household_id, owner_id). Architecture is defined.

### Batch 8: Investment Data Layer (v2.0-wealth Sprint 1)

**Agent**: @kmp-engineer (models) + @backend-engineer (schema)

| #    | Title                                                  |
| ---- | ------------------------------------------------------ |
| 1585 | Investment account taxonomy and tax-treatment metadata |
| 1588 | Lot-level position detail and cost-basis tracking      |
| 1595 | Target-vs-actual asset allocation dashboard            |

**Why sprint-ready**: Data modeling work with clear financial standards (cost-basis methods, asset classes).

### Batch 9: Notification & Alert System (Platform UX)

**Agent**: @kmp-engineer (core) + platform agents

| #    | Title                                                   |
| ---- | ------------------------------------------------------- |
| 1646 | Configurable budget, goal, and balance threshold alerts |
| 1648 | Spending pace and predictive overspend alerts           |
| 1659 | Transaction confirmation notifications                  |
| 1655 | Channel-specific notification preferences               |

**Why sprint-ready**: Standard notification patterns. No novel interaction design needed.

### Batch 10: Tax & Self-Employment (v1.1-financial Sprint 3)

**Agent**: @finance-domain + @kmp-engineer

| #    | Title                                                     |
| ---- | --------------------------------------------------------- |
| 1757 | Self-Employment Tax Workspace                             |
| 1705 | Quarterly estimated-tax calculator for freelancers        |
| 1695 | Tax-deductible transaction tagging and year-end summaries |
| 1709 | Mileage deduction log with manual and assisted capture    |

**Why sprint-ready**: Tax calculation formulas are well-defined. IRS schedules provide clear specs.

---

## 5. Issues Needing Human Design Decisions

These issues have ambiguous scope, competing design approaches, or require product/architecture choices before agent work can begin.

### Architecture Decisions Needed (consult @architect)

| #    | Issue                                                | Decision Needed                                                                              |
| ---- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1632 | Self-hosted sync option                              | Architecture: How does self-hosted sync coexist with PowerSync? What's the deployment model? |
| 1610 | Personal Data API and Webhooks                       | API design: What data is exposed? Rate limits? Auth model? Security review required.         |
| 1614 | Financial Automation Rule Engine                     | Architecture: Where do rules execute (edge vs. server)? How do they interact with sync?      |
| 1633 | AI Natural Language Financial Query Engine           | Architecture: On-device vs. cloud LLM? Privacy implications for financial data.              |
| 1742 | Personalized wealth-insights digest and NL assistant | Architecture: Same as #1633 — AI infrastructure decision.                                    |
| 1545 | ML-based transaction auto-categorization             | Architecture: On-device ML model selection, training data pipeline, privacy review.          |

### Product Decisions Needed (human PM)

| #    | Issue                                            | Decision Needed                                                                      |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1670 | Anonymous Peer Spending Benchmarks               | Privacy: What data is shared? How is anonymization guaranteed? Needs privacy review. |
| 1778 | Differential-privacy benchmarking opt-in         | Privacy: Epsilon values, data collection scope, user consent model.                  |
| 1777 | Privacy-preserving accountability partner        | Product: Social features scope — how far do we go? Risk of feature creep.            |
| 1727 | Anti-coercion safeguards                         | Product + Legal: What constitutes coercion? How do we detect/prevent? Sensitive UX.  |
| 1773 | Emotional spending and mood correlation journal  | Product: Scope of mental health features — liability concerns, clinical validity.    |
| 1656 | Financial Wellness Insights (Mood/Anxiety Score) | Product: Same as #1773 — mental health feature scope and liability.                  |
| 1751 | Financial Decision Alignment Score               | Product: How is "alignment" defined? What values framework?                          |
| 1774 | Estate and End-of-Life Financial Inventory       | Legal: Inheritance law varies by jurisdiction. How do we handle this responsibly?    |
| 1772 | Relationship Transition Finance Wizard           | Legal + Product: Divorce/separation financial guidance — liability concerns.         |

### Design Decisions Needed (consult @design-engineer)

| #    | Issue                                             | Decision Needed                                                            |
| ---- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| 1703 | Cognitive simplification mode                     | Design: What gets simplified? How do we avoid "dumbing down" the app?      |
| 1732 | Simplified elder and caregiver accessibility mode | Design: Overlaps with #1703 — needs unified approach to simplified modes.  |
| 1752 | Natural-language voice transaction capture        | Design: Voice UX patterns, error handling, confirmation flows.             |
| 1725 | Stable navigation and muscle-memory guardrails    | Design: What navigation changes are allowed? How do we version navigation? |

---

## Appendix: Issue Count Summary

| Category                         | Count  | High Priority | Medium Priority | Low Priority |
| -------------------------------- | ------ | ------------- | --------------- | ------------ |
| Household & Shared Finances      | 27     | 6             | 17              | 4            |
| Accessibility & Inclusive Design | 9      | 5             | 3               | 1            |
| Security & Privacy UX            | 24     | 5             | 14              | 5            |
| Financial Logic & Calculations   | 54     | 13            | 33              | 8            |
| Investment & Wealth Management   | 28     | 8             | 14              | 6            |
| Visualizations & Charts          | 17     | 2             | 8               | 7            |
| AI & Intelligence Features       | 12     | 3             | 2               | 7            |
| Platform UX Enhancements         | 24     | 0             | 14              | 10           |
| Integrations & Import/Export     | 18     | 7             | 7               | 4            |
| Onboarding & Education           | 9      | 0             | 3               | 6            |
| Alpha Launch                     | 6      | 1             | 0               | 5            |
| **Overlapping (duplicates)**     | **28** | —             | —               | —            |
| **Total unique issues**          | ~228   | 50            | 115             | 63           |

> **Note**: Some issues appear in multiple categories (e.g., #1742 is both AI and Wealth Management). The "overlapping" count reflects issues recommended for consolidation.
