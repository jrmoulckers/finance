# Webpack Configuration

This directory contains Webpack configuration fragments that are automatically
merged by Kotlin/JS when running browser tests.

- `sqljs.js` — Copies the `@cashapp/sqldelight-sqljs-worker` file so that
  `WebWorkerDriver` can locate it during test execution.
