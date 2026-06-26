# Full setup & first build

Runs **`npm run setup`**, the heavyweight one-command path:

1. Validate prerequisites (Node.js, JDK 21, Docker, Git)
2. `npm install`
3. Configure git hooks
4. Build every package (Kotlin Multiplatform + Turborepo)

> The first build compiles the Kotlin Multiplatform packages, so it can take a
> few minutes the first time. Subsequent builds are cached and much faster.
