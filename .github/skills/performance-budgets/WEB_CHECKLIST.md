# Web Performance Budget Checklist

- [ ] Route budget failure identifies route, metric, actual, and max.
- [ ] Initial and speculative JS gzip totals are checked after build artifacts exist.
- [ ] New heavy dependencies are lazy-loaded or replaced with existing utilities.
- [ ] Offline local data paints before network/sync work blocks the UI.
- [ ] Waivers are narrow, dated, issue-linked, and not used to hide regressions.
