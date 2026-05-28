# Finance — Windows app

The Windows build of Finance is a Compose Desktop app packaged as an MSI via
jpackage. There are three supported ways to produce an installable binary:

| Flow                                                     | When to use                                                         | Trigger                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Local build script** (`tools/windows/build-local.ps1`) | Day-to-day dev. Iterate on Windows-only bugs without waiting on CI. | `pwsh tools/windows/build-local.ps1 [flags]`                          |
| **Rolling main build** (`build-windows-main.yml`)        | "I want the latest signed MSI from `main` right now."               | Auto-runs on every push to `main` that touches Windows-relevant code. |
| **Tagged release** (`release-windows.yml`)               | Cutting a versioned release for testers / stores.                   | `git tag v1.2.3-windows && git push --tags` (or `workflow_dispatch`). |

The two CI flows are intentionally split: the rolling-main build is
always-on with no approval gate, the tagged release goes through the
`staging`/`production` GitHub Environment approval before publishing.

---

## 1. Local build script — `tools/windows/build-local.ps1`

The script wraps the full edit → build → sign → install → run loop into a
single command so you don't need to memorize Gradle task names, msiexec
flags, or signtool incantations.

### Quickstart

```pwsh
# From repo root, in PowerShell 7+:
pwsh tools/windows/build-local.ps1 -Install -ForceUninstall -BackupData -Run
```

That call will:

1. Generate (or reuse) a per-machine self-signed code-signing certificate in
   `Cert:\CurrentUser\My` and export it to `tools/windows/dev-cert/<COMPUTERNAME>.pfx`
   (gitignored).
2. Run `./gradlew :apps:windows:packageMsi`.
3. Sign the produced MSI with that cert.
4. Snapshot any existing user data under `%LOCALAPPDATA%\Finance\{data,security}\`
   (legacy layout) and `%LOCALAPPDATA%\FinanceUserData\{data,security,settings}\`
   (new layout, post-[#1900](../../../../issues/1900)) to a timestamped sibling
   directory (because `-BackupData` was passed), then uninstall the old version.
5. Install the freshly-built MSI silently.
6. Launch `Finance.exe`.

> 💡 If you skip both `-BackupData` and `-NoBackup` and any user data is
> present, the script will **refuse** to uninstall and exit with code 2.
> That's the data-protection guard rail — see below.

1. Generate (or reuse) a per-machine self-signed code-signing certificate in
   `Cert:\CurrentUser\My` and export it to `tools/windows/dev-cert/<COMPUTERNAME>.pfx`
   (gitignored).
2. Run `./gradlew :apps:windows:packageMsi`.
3. Sign the produced MSI with that cert.
4. Snapshot any existing user data under `%LOCALAPPDATA%\Finance\{data,security}\`
   (legacy layout) and `%LOCALAPPDATA%\FinanceUserData\{data,security,settings}\`
   (new layout, post-[#1900](../../../../issues/1900)) to a timestamped sibling
   directory, then uninstall the old version.
5. Install the freshly-built MSI silently.
6. Launch `Finance.exe`.

### Flags

| Flag              | Effect                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `-Install`        | Run msiexec install after build (default: just build).                                                      |
| `-Run`            | Launch `Finance.exe` after install.                                                                         |
| `-Uninstall`      | Uninstall the currently-installed Finance MSI and exit.                                                     |
| `-InstallOnly`    | Skip the Gradle build; install whatever MSI is already on disk.                                             |
| `-ForceUninstall` | If an install exists at the target version, uninstall it first.                                             |
| `-NoSign`         | Skip signing. Fast local-only iteration. SmartScreen will object.                                           |
| `-BackupData`     | Snapshot user data to a timestamped sibling dir before uninstall.                                           |
| `-NoBackup`       | Acknowledge that uninstalling may destroy user data. Required (or `-BackupData`) when user data is present. |
| `-Clean`          | `./gradlew :apps:windows:clean` before building.                                                            |

The script lives at [`tools/windows/build-local.ps1`](../../tools/windows/build-local.ps1)
and is fully self-contained — no external dependencies beyond the Windows
SDK (for `signtool.exe`) and your already-installed JDK 21.

### Data-safety design

The Windows MSI installs `Finance.exe` and runtime resources to
`%LOCALAPPDATA%\Finance\`. As of [#1900](../../../../issues/1900) the app's
user data (SQLCipher DB, DPAPI-wrapped key, encrypted settings, GDPR consent)
lives in a sibling root, `%LOCALAPPDATA%\FinanceUserData\`, so a clean
uninstall no longer wipes user data. On first launch after upgrading from a
pre-#1900 build, the app transparently migrates any data still under the
legacy `%LOCALAPPDATA%\Finance\{data,security,settings}\` paths into the
new root.

Until that migration has run for every install on the machine the script
defends against accidental data loss at **both** the legacy and the new
location: any uninstall path (`-Uninstall`, or `-Install -ForceUninstall`
when an existing install is present) refuses to proceed if user data exists
under either root unless you opt in with either `-BackupData` (snapshot to a
timestamped sibling directory mirroring the on-disk layout) or `-NoBackup`
(proceed and accept the loss). If you really want to nuke local data, pass
`-NoBackup`.

### Why a per-machine self-signed cert?

- SmartScreen reputation does **not** transfer between dev certs across
  machines, so there's no value in sharing one.
- The cert lives in `Cert:\CurrentUser\My` and is exported encrypted with a
  password derived from `$env:COMPUTERNAME` — the PFX is useless on any
  other machine.
- The PFX export pattern `tools/windows/dev-cert/*.pfx` is gitignored
  (`.gitignore` explicit entry + global `*.pfx` rule).

---

## 2. Rolling-main CI build — `build-windows-main.yml`

[`.github/workflows/build-windows-main.yml`](../../.github/workflows/build-windows-main.yml)
auto-runs on every push to `main` that touches anything Windows could care
about (`apps/windows/**`, `packages/**`, `build-logic/**`, `gradle/**`,
top-level Gradle files, detekt config, or the workflow itself).

On every run it:

1. Builds the MSI via `./gradlew :apps:windows:packageMsi`.
2. Runs the Windows test suite. **Test failures fail the build.**
3. Signs the MSI when `WINDOWS_SIGNING_CERT_BASE64` and
   `WINDOWS_CERT_PASSWORD` repo secrets are present. Otherwise emits a
   `::warning::` and uploads unsigned.
4. Publishes (or force-overwrites) a pre-release tagged **`latest-main`**
   with two asset names:
   - `Finance-main.msi` — **stable URL** that always points at the most
     recent build. Use this for testers ("just grab the latest").
   - `Finance-main-<sha7>.msi` — versioned alias for forensic / bisect use.

The stable download URL is therefore:

```
https://github.com/jrmoulckers/finance/releases/download/latest-main/Finance-main.msi
```

`concurrency: cancel-in-progress: true` means a newer push supersedes an
in-flight build — only the latest `main` commit ever wins the rolling
release.

---

## 3. Tagged release — `release-windows.yml`

[`.github/workflows/release-windows.yml`](../../.github/workflows/release-windows.yml)
is reserved for cutting versioned releases. It triggers on `v*-windows` or
`v*` tag pushes and on manual `workflow_dispatch`. Each tag produces its
own permanent GitHub Release with auto-generated notes from the git log
since the previous tag.

Key differences from the rolling-main build:

- `cancel-in-progress: false` — every tag is a distinct artifact, never
  cancelled by a follow-up tag.
- Gated by a GitHub Environment approval (`staging` or `production`
  depending on `inputs.channel`).
- Always-sign when secrets are present (same env-mapped boolean as
  build-windows-main); the legacy `channel == 'store'` gate is gone.

### Cutting a Windows release

```bash
git fetch origin main
git checkout main && git pull
git tag v1.2.3-windows
git push origin v1.2.3-windows
```

Then approve the workflow in the GitHub UI when prompted.

---

## Signing secret setup

Both CI workflows look for two repo secrets:

- `WINDOWS_SIGNING_CERT_BASE64` — base64-encoded PFX file
- `WINDOWS_CERT_PASSWORD` — password for the PFX

To encode a PFX:

```pwsh
[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Set-Clipboard
```

Paste that into `Repo Settings → Secrets and variables → Actions → New
repository secret` as `WINDOWS_SIGNING_CERT_BASE64`. Both workflows
gracefully skip signing if either secret is missing, emit a `::warning::`,
and publish unsigned binaries.

The local script does **not** read these secrets — it uses its own
per-machine self-signed cert exclusively. That keeps real signing keys off
developer machines.

---

## SmartScreen on local / unsigned builds

Self-signed MSIs trip SmartScreen's "Windows protected your PC" dialog.
That's expected — click **More info → Run anyway**. Signed CI builds will
trip it too until our publisher reputation builds up over time.

---

## Troubleshooting

| Symptom                                           | Likely cause                                                                                                                   | Fix                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `MSI exit 1638` from the local script             | Another version is already installed.                                                                                          | Re-run with `-ForceUninstall`.                                                                                                             |
| `signtool: command not found`                     | Windows SDK not installed, or signtool not on PATH.                                                                            | The script searches `C:\Program Files (x86)\Windows Kits\10\bin\*\x64\` automatically; install the Windows 10/11 SDK if it can't find one. |
| App launches then dies immediately                | Likely a regression of [#1890](../../../../issues/1890) (JRE modules) — DB driver or DPAPI native libs missing.                | Check `%LOCALAPPDATA%\Finance\app\Finance.cfg` and the Windows event log.                                                                  |
| `no such table: <name>` warning on launch         | Regression of [#1893](../../../../issues/1893). The schema bootstrap isn't running.                                            | Confirm `Schema.synchronous()` is still wired in `DatabaseFactory.jvm.kt`.                                                                 |
| DB file starts with `SQLite format 3\0`           | Regression of [#1894](../../../../issues/1894) — running plain `org.xerial:sqlite-jdbc` instead of the Willena SQLCipher fork. | Confirm the top-level `configurations.matching` exclude in `packages/models/build.gradle.kts` is intact.                                   |
| Want to nuke local data and re-test fresh install | —                                                                                                                              | `pwsh tools/windows/build-local.ps1 -Uninstall -NoBackup` then re-run with `-Install -Run`.                                                |

---

## Related issues

- [#1899](../../../../issues/1899) — this PR: Windows build & release automation
- [#1900](../../../../issues/1900) — move Windows app data out of the MSI install root
- [#1890](../../../../issues/1890), [#1893](../../../../issues/1893),
  [#1894](../../../../issues/1894) — the original alpha-blocker bugs that
  motivated this tooling
