# ADR-0023: Standardized Structured Error Handling Across Clients

## Status

Proposed

## Date

2026-05-15

## Context

Finance is a multi-platform application (iOS, Android, Web, Windows) sharing business logic through KMP packages. Currently, each platform handles errors differently:

- **Web (TypeScript)**: Hooks capture errors as `string | null` in state — no structured error types. Recovery logic relies on string matching (e.g., checking if an error message contains "network" to decide whether to retry).
- **Android/Windows (Kotlin)**: Can use Kotlin exceptions and sealed classes, but there is no shared error taxonomy in `packages/core/` or `packages/sync/`.
- **iOS (Swift)**: Swift's `Error` protocol is separate from Kotlin exceptions; bridging requires explicit mapping.

### Problems

1. **String-typed errors prevent programmatic recovery.** When a sync operation fails, the caller cannot distinguish "network timeout" from "schema mismatch" from "auth expired" without parsing error messages — messages that may change without notice.
2. **Inconsistent user messaging.** The same error (e.g., duplicate transaction) produces different messages on each platform, confusing users who switch between devices.
3. **Error reporting is noisy.** Without error codes or categories, crash reporting tools (Sentry) group errors by message string, fragmenting identical errors with slightly different messages into separate issues.
4. **No i18n for errors.** Error messages are hardcoded in English; the existing i18n framework in `packages/core/` is not used for error strings.
5. **No distinction between user-facing and diagnostic errors.** Some errors should be shown to the user ("Budget limit exceeded"); others are internal ("SQLDelight schema version mismatch"). The current approach conflates both.

### Design Constraints

- The error model must work across all KMP targets: `commonMain`, `iosMain`, `androidMain`, `jvmMain`, `jsMain`.
- Platform-native error conventions must be respected (Swift `Error`, Kotlin `Exception`, TypeScript `Error` / result types).
- Error messages displayed to users must go through the i18n layer.
- Errors must carry enough context for debugging without exposing sensitive financial data.

## Decision

**Define a shared error hierarchy in `packages/core/` using Kotlin sealed classes, with platform-native presentation adapters and i18n-driven user-facing messages.**

### Error Hierarchy

```kotlin
// packages/core/src/commonMain/kotlin/com/finance/core/error/

/**
 * Base class for all Finance domain errors.
 * Every error has a machine-readable code, a diagnostic message,
 * and an optional cause chain.
 */
sealed class FinanceError(
    val code: ErrorCode,
    val diagnosticMessage: String,
    override val cause: Throwable? = null,
) : Exception(diagnosticMessage, cause) {

    /** Errors related to data validation and business rules. */
    sealed class Validation(code: ErrorCode, message: String) :
        FinanceError(code, message) {
        class InvalidAmount(message: String) :
            Validation(ErrorCode.VALIDATION_INVALID_AMOUNT, message)
        class DuplicateRecord(message: String) :
            Validation(ErrorCode.VALIDATION_DUPLICATE, message)
        class RequiredFieldMissing(val field: String) :
            Validation(ErrorCode.VALIDATION_REQUIRED, "Missing: $field")
        class BudgetExceeded(message: String) :
            Validation(ErrorCode.VALIDATION_BUDGET_EXCEEDED, message)
    }

    /** Errors from the sync engine. */
    sealed class Sync(
        code: ErrorCode,
        message: String,
        cause: Throwable? = null,
    ) : FinanceError(code, message, cause) {
        class NetworkUnavailable(cause: Throwable? = null) :
            Sync(ErrorCode.SYNC_NETWORK, "Network unavailable", cause)
        class AuthExpired :
            Sync(ErrorCode.SYNC_AUTH_EXPIRED, "Authentication expired")
        class ConflictDetected(val tableName: String, val recordId: String) :
            Sync(ErrorCode.SYNC_CONFLICT, "Conflict on $tableName/$recordId")
        class SchemaMismatch(val expected: Int, val actual: Int) :
            Sync(ErrorCode.SYNC_SCHEMA_MISMATCH, "Schema: expected $expected, got $actual")
    }

    /** Errors from local storage operations. */
    sealed class Storage(
        code: ErrorCode,
        message: String,
        cause: Throwable? = null,
    ) : FinanceError(code, message, cause) {
        class DatabaseCorrupted(cause: Throwable? = null) :
            Storage(ErrorCode.STORAGE_CORRUPTED, "Database corrupted", cause)
        class MigrationFailed(
            val fromVersion: Int,
            val toVersion: Int,
            cause: Throwable? = null,
        ) : Storage(ErrorCode.STORAGE_MIGRATION, "Migration $fromVersion to $toVersion failed", cause)
        class RecordNotFound(val table: String, val id: String) :
            Storage(ErrorCode.STORAGE_NOT_FOUND, "Not found: $table/$id")
    }

    /** Errors from external service integrations. */
    sealed class External(
        code: ErrorCode,
        message: String,
        cause: Throwable? = null,
    ) : FinanceError(code, message, cause) {
        class RateLimited(val retryAfterSeconds: Int?) :
            External(ErrorCode.EXTERNAL_RATE_LIMITED, "Rate limited")
        class ServiceUnavailable(val service: String, cause: Throwable? = null) :
            External(ErrorCode.EXTERNAL_UNAVAILABLE, "Service unavailable: $service", cause)
    }
}
```

### Error Codes

```kotlin
// packages/core/src/commonMain/kotlin/com/finance/core/error/ErrorCode.kt

enum class ErrorCode(
    val value: String,
    val isUserFacing: Boolean,
    val isRetryable: Boolean,
) {
    // Validation
    VALIDATION_INVALID_AMOUNT("V001", true, false),
    VALIDATION_DUPLICATE("V002", true, false),
    VALIDATION_REQUIRED("V003", true, false),
    VALIDATION_BUDGET_EXCEEDED("V004", true, false),

    // Sync
    SYNC_NETWORK("S001", true, true),
    SYNC_AUTH_EXPIRED("S002", true, false),
    SYNC_CONFLICT("S003", true, false),
    SYNC_SCHEMA_MISMATCH("S004", false, false),

    // Storage
    STORAGE_CORRUPTED("D001", false, false),
    STORAGE_MIGRATION("D002", false, false),
    STORAGE_NOT_FOUND("D003", false, false),

    // External
    EXTERNAL_RATE_LIMITED("E001", true, true),
    EXTERNAL_UNAVAILABLE("E002", true, true),
}
```

### Result Type

```kotlin
// packages/core/src/commonMain/kotlin/com/finance/core/error/FinanceResult.kt

sealed class FinanceResult<out T> {
    data class Success<T>(val value: T) : FinanceResult<T>()
    data class Failure(val error: FinanceError) : FinanceResult<Nothing>()

    val isSuccess: Boolean get() = this is Success
    val isFailure: Boolean get() = this is Failure

    fun getOrNull(): T? = (this as? Success)?.value
    fun errorOrNull(): FinanceError? = (this as? Failure)?.error

    inline fun <R> map(transform: (T) -> R): FinanceResult<R> = when (this) {
        is Success -> Success(transform(value))
        is Failure -> this
    }

    inline fun onSuccess(action: (T) -> Unit): FinanceResult<T> {
        if (this is Success) action(value)
        return this
    }

    inline fun onFailure(action: (FinanceError) -> Unit): FinanceResult<T> {
        if (this is Failure) action(error)
        return this
    }
}
```

### Platform Presentation

Each platform maps `FinanceError` to platform-native error presentation:

- **Web (TypeScript)**: The `bridge.ts` file exports a `FinanceErrorInfo` interface with `code`, `isRetryable`, and `userMessage` (resolved via i18n). Hooks set `error: FinanceErrorInfo | null` instead of `string | null`.
- **Android/Windows (Kotlin)**: Use `FinanceError` directly. ViewModel maps to UI state using `ErrorCode.isUserFacing` to decide whether to show a user message or log silently.
- **iOS (Swift)**: A Swift `FinanceErrorBridge` wraps the KMP sealed class, conforming to Swift's `LocalizedError` protocol. `errorDescription` returns the i18n-resolved message.

### i18n Integration

User-facing error messages are resolved through the existing i18n framework in `packages/core/`:

```kotlin
// Error message keys follow the pattern: error.<code>
// e.g., error.V001 = "The amount entered is not valid."
//       error.S001 = "Unable to sync. Check your internet connection."

fun FinanceError.userMessage(i18n: I18nProvider): String? {
    if (!code.isUserFacing) return null
    return i18n.getString("error.${code.value}")
}
```

## Alternatives Considered

### Error Code Enum Only (No Sealed Hierarchy)

Define error codes as an enum and pass them alongside plain string messages, without a class hierarchy.

**Rejected because:**

- Loses type-safe context (e.g., `SchemaMismatch` carries `expected` and `actual` versions; a flat enum cannot).
- Cannot leverage Kotlin's `when` exhaustiveness checking for error handling branches.
- Error creation sites would need to manually pair codes with messages — error-prone.

### Platform-Independent Error Strings with Code Prefix

Format all error messages as `[V001] Invalid amount` and parse the code from the prefix on each platform.

**Rejected because:**

- String parsing is fragile and defeats the purpose of structured errors.
- Cannot carry typed metadata (retry delay, field name, schema version).
- Violates the i18n requirement — hardcoded English in error strings.

### Adopt Arrow-kt or kotlin-result Library

Use an established Kotlin result/error library for the `Result` type.

**Rejected because:**

- Arrow-kt is a large dependency with many features beyond error handling — violates simplicity principle.
- `kotlin-result` is lightweight but adds an external dependency for a small amount of code that is straightforward to maintain in-house.
- The custom `FinanceResult` type can be tailored to include Finance-specific convenience methods.

## Consequences

### Positive

- Errors are machine-readable across all platforms — programmatic recovery (retry, re-auth, conflict resolution) works without string parsing.
- User-facing messages are consistent and i18n-ready — the same error produces the same message on all platforms.
- Sentry/crash reporting groups errors by `ErrorCode` — cleaner signal-to-noise ratio.
- The `isRetryable` flag enables automatic retry logic in the sync engine and hooks.
- The `isUserFacing` flag prevents internal diagnostic errors from leaking to users.

### Negative

- Migration effort: existing error paths in all four platforms must be updated to use the new types.
- The sealed class hierarchy must be extended as new error cases arise — requires a KMP package release for each new error type.
- TypeScript bridge requires manual or generated mapping until Phase 4 of ADR-0021.
- iOS Swift Export must handle the sealed class mapping — adds complexity to the Swift bridge layer.

## Implementation Notes

- **Package location**: `packages/core/src/commonMain/kotlin/com/finance/core/error/` — three files: `FinanceError.kt`, `ErrorCode.kt`, `FinanceResult.kt`.
- **Migration priority**: Start with `packages/sync/` error paths (highest impact on data integrity), then `packages/core/` business logic, then platform-specific code.
- **Web migration**: Update hook `UseEntityResult` interface to use `error: FinanceErrorInfo | null` with typed fields instead of `string | null`. Add a `FinanceErrorInfo` type to `bridge.ts`.
- **Monitoring integration**: Extend `CrashReporter` interface in `packages/core/src/commonMain/kotlin/com/finance/core/monitoring/` to accept `FinanceError` with structured metadata.
- **Diagnostic-only errors**: Errors where `isUserFacing == false` are logged to crash reporting but surfaced to users as a generic "Something went wrong" message with an error code for support reference.
- **Sensitive data**: `diagnosticMessage` must NEVER contain financial amounts, account numbers, or PII. Error context should use IDs and table names only.
