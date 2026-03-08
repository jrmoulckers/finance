# Microsoft Store Submission Guide

Step-by-step guide for packaging and publishing the Finance Windows desktop app to the Microsoft Store via MSIX.

## Overview

| Item | Value |
|---|---|
| **Package format** | MSIX |
| **Build tool** | Compose Desktop → `packageMsi` / MSIX tooling |
| **CI workflow** | `.github/workflows/windows-ci.yml` |
| **Manifest template** | `apps/windows/packaging/AppxManifest.xml` |
| **Minimum OS** | Windows 10 1809 (build 17763) |

## Prerequisites

1. **Microsoft Partner Center account** — [Register here](https://partner.microsoft.com/dashboard)
2. **Code-signing certificate** — Required for MSIX signing; obtained through Partner Center or a trusted CA
3. **Windows SDK 10.0.22621+** — Includes `makeappx.exe` and `signtool.exe`
4. **JDK 21** — For building the Compose Desktop application via Gradle

## 1. Reserve Your App Name

1. Sign in to [Partner Center](https://partner.microsoft.com/dashboard)
2. Navigate to **Apps and games → New product → MSIX or PWA app**
3. Reserve the name **Finance** (or your preferred display name)
4. Note the **Package Identity Name** and **Publisher Identity** — these go into `AppxManifest.xml`

## 2. Build the Application

From the repository root:

```bash
# Build the desktop application
./gradlew :apps:windows:build

# Generate the MSI installer (used as intermediate artifact)
./gradlew :apps:windows:packageMsi
```

The MSI output is located at:
```
apps/windows/build/compose/binaries/main/msi/Finance-1.0.0.msi
```

## 3. Create the MSIX Package

### Option A: Convert MSI → MSIX (MSIX Packaging Tool)

1. Install the [MSIX Packaging Tool](https://learn.microsoft.com/windows/msix/packaging-tool/tool-overview) from the Microsoft Store
2. Launch the tool → **Application package** → **Create your package on this computer**
3. Select the MSI installer from step 2
4. Review and edit the package information (ensure it matches Partner Center reservation)
5. Save the `.msix` file

### Option B: Manual MSIX creation (makeappx)

```powershell
# 1. Prepare a staging directory with app files
$stagingDir = "build\msix-staging"
New-Item -ItemType Directory -Path $stagingDir -Force

# 2. Copy application files from the Compose Desktop output
Copy-Item -Recurse "apps\windows\build\compose\binaries\main\app\*" $stagingDir

# 3. Copy the manifest (substitute placeholder values first)
Copy-Item "apps\windows\packaging\AppxManifest.xml" "$stagingDir\AppxManifest.xml"

# 4. Create the MSIX package
& "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\makeappx.exe" `
    pack /d $stagingDir /p "build\Finance.msix" /o
```

## 4. Sign the MSIX Package

```powershell
# Sign with your code-signing certificate
& "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" `
    sign /fd SHA256 /a /f "path\to\certificate.pfx" /p "$env:MSIX_CERT_PASSWORD" `
    "build\Finance.msix"
```

> **⚠️ Important:** Never commit certificates or passwords to source control. Use GitHub Actions secrets (`MSIX_SIGNING_CERT`, `MSIX_CERT_PASSWORD`) in CI pipelines.

## 5. Test the Package Locally

```powershell
# Install the MSIX package locally for testing
Add-AppPackage -Path "build\Finance.msix"

# Verify installation
Get-AppPackage -Name "*Finance*"

# Uninstall after testing
Get-AppPackage -Name "*Finance*" | Remove-AppPackage
```

## 6. Submit to Microsoft Store

### Via Partner Center

1. Go to [Partner Center](https://partner.microsoft.com/dashboard) → your app reservation
2. Start a new **Submission**
3. Fill in:
   - **Packages** — Upload the signed `.msix` file
   - **Store listings** — Description, screenshots, category (Finance)
   - **Pricing and availability** — Free / Paid, market selection
   - **Age ratings** — Complete the IARC questionnaire
   - **Properties** — Category: **Personal finance**, privacy policy URL
4. **Submit for certification**

### Certification Timeline

| Phase | Typical Duration |
|---|---|
| Validation | Minutes |
| Certification review | 1–3 business days |
| Publishing | Hours after approval |

## 7. CI/CD Integration

The `windows-ci.yml` workflow handles build and packaging automatically:

```yaml
# Triggered on pushes/PRs affecting apps/windows/** or packages/**
# See .github/workflows/windows-ci.yml for full configuration
```

### Future Enhancements

- **Automated MSIX signing** — Use a GitHub Actions secret to store the PFX certificate and sign during CI
- **Store submission API** — Automate submission via the [Microsoft Store submission API](https://learn.microsoft.com/windows/uwp/monetize/create-and-manage-submissions-using-windows-store-services)
- **Flight rings** — Configure package flights for beta testing before production rollout

## 8. Updating the App

1. Bump the version in `apps/windows/build.gradle.kts`:
   ```kotlin
   nativeDistributions {
       packageVersion = "1.1.0"  // Increment per release
   }
   ```
2. Update `AppxManifest.xml` version to match (or use CI substitution)
3. Build, package, sign, and submit a new version through Partner Center

## Troubleshooting

### "Publisher does not match the signing certificate"

Ensure the `Publisher` field in `AppxManifest.xml` exactly matches the subject of your code-signing certificate:
```
Publisher="CN=Your Publisher Name, O=Your Org, L=City, S=State, C=US"
```

### "Package dependency not satisfied"

Check the `TargetDeviceFamily` minimum version in the manifest. Windows 10 1809 (build 17763) is the minimum supported version for most MSIX features.

### MSI build fails with "WiX Toolset not found"

The Compose Desktop MSI packaging requires [WiX Toolset v3](https://wixtoolset.org/) on the build machine. Install it or use the CI workflow which provisions it automatically.

## References

- [MSIX Documentation](https://learn.microsoft.com/windows/msix/)
- [Partner Center Documentation](https://learn.microsoft.com/windows/apps/publish/)
- [MSIX Packaging Tool](https://learn.microsoft.com/windows/msix/packaging-tool/tool-overview)
- [Store Submission API](https://learn.microsoft.com/windows/uwp/monetize/create-and-manage-submissions-using-windows-store-services)
- [Compose Desktop Packaging](https://github.com/JetBrains/compose-multiplatform/tree/master/tutorials/Native_distributions_and_local_execution)
