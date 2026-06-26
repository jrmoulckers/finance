# Install dependencies

Runs **`npm install`** at the repository root, installing dependencies for every
workspace — `apps/*`, `packages/*`, `services/*`, and `tools/*`.

This is safe to run repeatedly: npm skips work that is already up to date, and
the **Check Dev Environment** step does this automatically when needed.
