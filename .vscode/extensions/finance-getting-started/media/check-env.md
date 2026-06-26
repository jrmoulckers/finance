# Check your dev environment

Runs **`npm run check-devenv`** in the integrated terminal. It:

- ✅ Verifies **Node.js** (the one tool you must install yourself), **JDK 21**, and **Docker**
- 🩹 **Auto-installs** npm dependencies when `node_modules` is missing or stale
- 🧭 Prints the exact command to fix anything it can't safely install itself

> **Node.js is required to run this check** — a Node script can't install Node.
> If `node` isn't found, install it from <https://nodejs.org/> and reopen the folder.
