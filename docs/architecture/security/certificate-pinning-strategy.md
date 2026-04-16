<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Certificate Pinning Strategy — Finance App

**Issue:** #329
**Date:** 2025-07-27
**Author:** Security & Privacy Reviewer
**Status:** Assessment Complete — Implementation Specification
**MASVS Control:** MASVS-NETWORK-5

---

## Executive Summary

Certificate pinning is a defence-in-depth control that binds the Finance app to
specific TLS certificates or public keys for its backend endpoints (Supabase API,
PowerSync). This prevents man-in-the-middle attacks from compromised Certificate
Authorities, corporate proxy inspection, or rogue devices with injected trust anchors.

For a financial application handling transaction data, account balances, and spending
patterns, certificate pinning is a **HIGH-priority** network security control.

### Current State

| Platform   | Pinning Status                     | Reference Audit Finding               |
| ---------- | ---------------------------------- | ------------------------------------- |
| Android    | NOT IMPLEMENTED                    | Security Audit v1 N-1, Pre-launch M-6 |
| iOS        | NOT IMPLEMENTED                    | Security Audit v1 N-1, Pre-launch M-6 |
| Web        | N/A (browser-managed, CT enforced) | —                                     |
| Windows    | NOT IMPLEMENTED                    | Security Audit v1 N-1, Pre-launch M-6 |
| KMP (Ktor) | NOT IMPLEMENTED                    | MASVS-NETWORK audit L-4               |

### Risk Without Pinning

| Threat                             | Likelihood | Impact   | Risk Level |
| ---------------------------------- | ---------- | -------- | ---------- |
| Compromised CA issuing rogue cert  | Low        | CRITICAL | MEDIUM     |
| Corporate MITM proxy interception  | Medium     | HIGH     | HIGH       |
| Rogue Wi-Fi with SSL inspection    | Medium     | HIGH     | HIGH       |
| State-level adversary              | Low        | CRITICAL | MEDIUM     |
| Malware with injected trust anchor | Medium     | CRITICAL | HIGH       |

---

## Threat Model

### Assets Protected

- OAuth tokens (access + refresh)
- Financial transaction data (amounts, payees, dates)
- Account balances and household membership
- Passkey authentication challenges and assertions
- User PII (email, display name)

### Attack Vectors Mitigated

1. **Compromised CA:** An attacker obtains a valid certificate for `*.supabase.co`
   from a compromised or coerced CA. Without pinning, the client trusts this
   certificate and the attacker can intercept all API traffic.

2. **Corporate MITM Proxy:** Enterprise environments routinely deploy TLS-intercepting
   proxies (Zscaler, Bluecoat, etc.) that inject their root CA into managed devices.
   Pinning prevents these proxies from intercepting financial data.

3. **Rogue Wi-Fi / Evil Twin:** Public Wi-Fi with ARP spoofing + SSL stripping or
   a custom CA certificate trick. Pinning ensures the app only trusts the expected
   backend certificate chain.

4. **Compromised Device Trust Store:** Malware that installs a root CA into the
   system trust store. Pinning overrides the system trust store for pinned domains.

### Attack Vectors NOT Mitigated

- Compromised server-side private key (server compromise)
- Attacks on the pinning mechanism itself (root/jailbreak → bypass)
- First-connection attacks if pins are not shipped with the app
- Certificate Transparency log compromise (Web only)

---

## Pinning Strategy: Subject Public Key Information (SPKI) Hash

### Why SPKI Over Leaf Certificate

| Approach              | Rotation Impact                         | Renewal Risk                     | Recommended           |
| --------------------- | --------------------------------------- | -------------------------------- | --------------------- |
| Leaf certificate hash | Must update app on every cert renewal   | HIGH — missed renewal = outage   | No                    |
| Intermediate CA hash  | Stable across cert renewals             | LOW — only changes if CA changes | **Yes (primary)**     |
| SPKI public key hash  | Stable if key is reused across renewals | LOWEST                           | **Yes (recommended)** |

**Recommendation:** Pin the **SPKI hash of the intermediate CA** used by Supabase
(currently Let's Encrypt or AWS Certificate Manager depending on deployment), with
a **backup pin** of an alternative intermediate CA.

### Pin Set

```
Primary Pin:   sha256/<SUPABASE_INTERMEDIATE_CA_SPKI_HASH>
Backup Pin 1:  sha256/<ALTERNATIVE_INTERMEDIATE_CA_SPKI_HASH>
Backup Pin 2:  sha256/<NEXT_GEN_INTERMEDIATE_CA_SPKI_HASH>
```

> **IMPORTANT:** The actual pin values MUST be derived from the live Supabase
> certificate chain at deployment time. Use `openssl s_client` to extract:
>
> ```bash
> openssl s_client -connect <project>.supabase.co:443 -servername <project>.supabase.co </dev/null 2>/dev/null \
>   | openssl x509 -pubkey -noout \
>   | openssl pkey -pubin -outform DER \
>   | openssl dgst -sha256 -binary \
>   | base64
> ```

### Pin Expiry and Rotation

- **Max-Age:** 60 days (allows 2 monthly release cycles for pin rotation)
- **Backup pins:** Always include at least 2 backup pins from different CAs
- **Monitoring:** Alert if certificate chain changes detected in CI
- **Emergency bypass:** Feature flag to disable pinning (requires app update)

---

## Platform Implementation Specifications

### 1. Android — `network_security_config.xml`

**File:** `apps/android/src/main/res/xml/network_security_config.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Production: Pin Supabase and PowerSync domains -->
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">supabase.co</domain>
        <domain includeSubdomains="true">powersync.journeyapps.com</domain>
        <pin-set expiration="2025-10-01">
            <!-- Primary: Intermediate CA SPKI hash -->
            <pin digest="SHA-256">PLACEHOLDER_PRIMARY_PIN=</pin>
            <!-- Backup: Alternative intermediate CA -->
            <pin digest="SHA-256">PLACEHOLDER_BACKUP_PIN_1=</pin>
            <!-- Backup: Next-gen intermediate CA -->
            <pin digest="SHA-256">PLACEHOLDER_BACKUP_PIN_2=</pin>
        </pin-set>
    </domain-config>

    <!-- Dev/Debug: Allow user-added CAs (Charles Proxy, etc.) -->
    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />
            <certificates src="system" />
        </trust-anchors>
    </debug-overrides>

    <!-- Base config: No cleartext traffic anywhere -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

**AndroidManifest.xml addition:**

```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ... >
```

**Android-specific considerations:**

- `debug-overrides` ONLY active when `android:debuggable="true"` (debug builds)
- `expiration` date triggers a graceful fallback to system trust on expiry
- `includeSubdomains="true"` covers project-specific subdomains
- Requires API 24+ (already met: `minSdk = 26`)

### 2. iOS — `NSPinnedDomains` (App Transport Security)

**File:** `apps/ios/Finance/Info.plist`

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSPinnedDomains</key>
    <dict>
        <key>supabase.co</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSPinnedCAIdentities</key>
            <array>
                <dict>
                    <key>SPKI-SHA256-BASE64</key>
                    <string>PLACEHOLDER_PRIMARY_PIN=</string>
                </dict>
                <dict>
                    <key>SPKI-SHA256-BASE64</key>
                    <string>PLACEHOLDER_BACKUP_PIN_1=</string>
                </dict>
            </array>
        </dict>
        <key>powersync.journeyapps.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSPinnedCAIdentities</key>
            <array>
                <dict>
                    <key>SPKI-SHA256-BASE64</key>
                    <string>PLACEHOLDER_PRIMARY_PIN=</string>
                </dict>
                <dict>
                    <key>SPKI-SHA256-BASE64</key>
                    <string>PLACEHOLDER_BACKUP_PIN_2=</string>
                </dict>
            </array>
        </dict>
    </dict>
</dict>
```

**iOS-specific considerations:**

- `NSPinnedDomains` is enforced by ATS at the OS level — cannot be bypassed by app code
- No debug bypass — use a separate `Info.plist` for debug builds or a runtime check
- `NSPinnedCAIdentities` pins to CA certificates (not leaf), matching our SPKI strategy
- Requires iOS 14+ (already met: deployment target iOS 17)

### 3. Windows/JVM (Ktor Client)

**File:** `packages/sync/src/jvmMain/kotlin/com/finance/sync/network/CertificatePinning.kt`

```kotlin
// Ktor CIO engine with certificate pinning
val httpClient = HttpClient(CIO) {
    engine {
        https {
            // Pin Supabase intermediate CA
            addKeyStore(
                keyStore = buildPinKeyStore(
                    "sha256/PLACEHOLDER_PRIMARY_PIN=",
                    "sha256/PLACEHOLDER_BACKUP_PIN_1=",
                ),
                keyAlias = ""
            )
        }
    }
}
```

Alternatively, use OkHttp engine (recommended for better pinning support):

```kotlin
val okHttpClient = OkHttpClient.Builder()
    .certificatePinner(
        CertificatePinner.Builder()
            .add("*.supabase.co",
                "sha256/PLACEHOLDER_PRIMARY_PIN=",
                "sha256/PLACEHOLDER_BACKUP_PIN_1=")
            .add("*.powersync.journeyapps.com",
                "sha256/PLACEHOLDER_PRIMARY_PIN=",
                "sha256/PLACEHOLDER_BACKUP_PIN_2=")
            .build()
    )
    .build()

val httpClient = HttpClient(OkHttp) {
    engine { preconfigured = okHttpClient }
}
```

**Windows/JVM-specific considerations:**

- OkHttp provides the most mature certificate pinning API on JVM
- Ktor CIO engine pinning is less flexible (whole keystore)
- Consider using OkHttp engine for Android+JVM/Windows, CIO for other targets
- Pin values should be injected via build configuration, not hardcoded

### 4. Web — Certificate Transparency (CT) + Expect-CT

**No client-side pinning is possible** in web browsers. Instead:

- **Certificate Transparency:** Modern browsers enforce CT by default (Chrome, Firefox, Safari)
- **Expect-CT header:** Add to Edge Function responses:
  ```
  Expect-CT: max-age=86400, enforce
  ```
- **CAA DNS records:** Add DNS CAA records to restrict which CAs can issue for the domain:
  ```
  finance.app. CAA 0 issue "letsencrypt.org"
  finance.app. CAA 0 issuewild "letsencrypt.org"
  ```

### 5. KMP Shared Code — Expect/Actual Pattern

**File:** `packages/sync/src/commonMain/kotlin/com/finance/sync/network/CertificatePinner.kt`

```kotlin
/**
 * Platform-agnostic certificate pinning configuration.
 *
 * Each platform provides its own implementation:
 * - Android: Handled by network_security_config.xml (OS-level)
 * - iOS: Handled by NSPinnedDomains in Info.plist (OS-level)
 * - JVM/Windows: OkHttp CertificatePinner
 *
 * The common interface allows the sync engine to verify that pinning
 * is active and report failures to the monitoring system.
 */
expect object CertificatePinner {
    /** Whether certificate pinning is active on this platform. */
    val isEnabled: Boolean

    /** Validate that the pin configuration is loaded and valid. */
    fun validateConfiguration(): Result<Unit>
}
```

---

## Operational Considerations

### Pin Rotation Procedure

1. **30 days before expiry:** CI job alerts that pin expiry is approaching
2. **Developer extracts new pins** from production certificate chain
3. **Update pin values** in `network_security_config.xml`, `Info.plist`, and Ktor config
4. **Deploy app update** through normal release pipeline
5. **Old pins remain valid** until expiry (overlap period)
6. **Monitor pin validation failures** via `SyncHealthMonitor` crash reports

### Failure Modes and Mitigations

| Failure Mode                         | Impact                                  | Mitigation                                                                  |
| ------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------- |
| Certificate rotated, app not updated | Connection failure for all users        | Backup pins; pin expiry with graceful fallback; forced app update mechanism |
| Supabase changes CA provider         | Connection failure if new CA not pinned | Monitor CT logs; include backup pins from multiple CAs                      |
| Debug build with proxy               | Proxy intercepted, connection refused   | Android `debug-overrides`; iOS separate debug Info.plist                    |
| Pin expiry reached                   | Falls back to system trust (Android)    | Set generous expiry; monitor via CI                                         |

### Testing Strategy

1. **Unit tests:** Verify pin values are syntactically valid SHA-256 base64
2. **Integration tests:** Connect to production endpoint and verify TLS handshake
3. **Negative tests:** Use mitmproxy with custom CA to verify pinning rejects
4. **CI monitoring:** Weekly job to extract live certificate chain and compare against pinned values
5. **Canary deployment:** Roll out pinning to 5% of users first, monitor connection errors

---

## Recommendations

### Must Do (Before Enabling Pinning)

| Priority | Action                                                 | Effort  |
| -------- | ------------------------------------------------------ | ------- |
| P0       | Extract current Supabase certificate chain SPKI hashes | 1 hour  |
| P0       | Identify and pin backup CAs (at least 2)               | 1 hour  |
| P0       | Create `network_security_config.xml` for Android       | 2 hours |
| P0       | Add `NSPinnedDomains` to iOS `Info.plist`              | 2 hours |
| P0       | Set up OkHttp CertificatePinner for JVM/Windows        | 4 hours |
| P0       | Add Expect-CT header to Edge Function responses        | 1 hour  |

### Should Do (Within Sprint)

| Priority | Action                                      | Effort  |
| -------- | ------------------------------------------- | ------- |
| P1       | CI job to monitor certificate chain changes | 4 hours |
| P1       | Feature flag for emergency pin bypass       | 4 hours |
| P1       | Document pin rotation runbook in ops/       | 2 hours |
| P1       | Add CAA DNS records                         | 1 hour  |

### Future Improvements

| Priority | Action                                                 | Effort  |
| -------- | ------------------------------------------------------ | ------- |
| P2       | Certificate Transparency log monitoring                | 1 day   |
| P2       | Pin validation failure reporting via SyncHealthMonitor | 4 hours |
| P2       | Automated pin extraction and PR creation in CI         | 1 day   |

---

## Privacy Considerations

Certificate pinning itself does not introduce privacy concerns. However:

- **Pin failure reports** sent to monitoring MUST NOT include the full certificate chain
  (which could reveal the user's network environment or corporate proxy identity)
- **Connection error messages** surfaced to users should be generic ("Connection
  security error") without revealing pinning details that could help an attacker
- **Debug-mode bypass** must NEVER be enabled in production builds — verify via CI

---

## References

- OWASP MASVS v2: MASVS-NETWORK-5 (Certificate Pinning)
- OWASP Mobile Testing Guide: Testing Custom Certificate Stores and Certificate Pinning
- Android Network Security Configuration: https://developer.android.com/privacy-and-security/security-config
- Apple NSPinnedDomains: https://developer.apple.com/documentation/bundleresources/information_property_list/nsapptransportsecurity/nspinneddomains
- OkHttp Certificate Pinning: https://square.github.io/okhttp/features/https/#certificate-pinning
- RFC 7469: Public Key Pinning Extension for HTTP (deprecated for HPKP, but SPKI hash format still used)
