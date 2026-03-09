// Copy the SQLDelight sql.js worker file so the Karma test runner can load it.
// KMP's JS browser test runner uses Webpack, which needs this plugin to
// make the worker script available at the expected URL.

const CopyWebpackPlugin = require("copy-webpack-plugin");

config.plugins.push(
  new CopyWebpackPlugin({
    patterns: [
      {
        from: "../../node_modules/@cashapp/sqldelight-sqljs-worker/sqljs.worker.js",
        to: "sqljs.worker.js",
      },
    ],
  })
);
