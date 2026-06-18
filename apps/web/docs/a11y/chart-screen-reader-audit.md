# Finance chart screen-reader audit

Scope: dashboard spending trends, planning trend charts, spending/category charts, and budget donut charts. Manual AT matrix to run: NVDA/Firefox, JAWS/Chrome, VoiceOver/Safari.

| Chart              | Routes                             | SR support status                                                                                                          | Remaining gaps                                                                    |
| ------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| SpendingTrendChart | Dashboard                          | Figure name, hidden summary, keyboard data navigator, data table fallback, and focused-point live announcements are wired. | Confirm Recharts SVG names in all browser/AT pairs.                               |
| TrendLineChart     | Planning and shared chart surfaces | Figure name, hidden summary, keyboard data navigator, data table fallback, and focused-point live announcements are wired. | Add route-specific summaries where pages provide comparison context.              |
| SpendingBarChart   | Dashboard visualizations           | Figure name, hidden summary, focusable categories, and live-region point announcement support are present.                 | Validate real Recharts cells receive roving tabindex in browser.                  |
| CategoryPieChart   | Dashboard visualizations           | Figure name, hidden summary, keyboardable D3 slices, visible legend, and focused-slice live announcements are wired.       | Confirm slice focus order matches legend order with VoiceOver.                    |
| BudgetDonutChart   | Budget surfaces                    | Figure name, hidden summary, focusable slices, center label, and live-region slice announcement support are present.       | Add an always-visible data table if budget slices grow beyond legend readability. |

Clear low-risk fixes completed in this pass: added live regions for focused bar, pie, and donut chart points, and connected trend chart keyboard announcements to the shared chart-summary helper.
