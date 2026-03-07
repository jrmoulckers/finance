# ============================================================================
# Finance App — R8/ProGuard Rules
# ============================================================================
# These rules ensure that R8 does not strip or obfuscate classes required
# at runtime by serialization, reflection, or the SQLDelight database layer.
# ============================================================================

# ── Data Models ───────────────────────────────────────────────────────────────────
# Keep all model classes and their members — kotlinx-serialization and
# PowerSync use reflection or generated serializers that reference fields
# by name.
-keepclassmembers class com.finance.models.** { *; }

# ── Database Layer ────────────────────────────────────────────────────────────────
# Keep SQLDelight-generated database classes and query interfaces intact.
-keep class com.finance.db.** { *; }

# ── kotlinx-serialization ────────────────────────────────────────────────────────
# Keep serializer companion objects and generated serializer classes.
-keepclassmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclasseswithmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep @Serializable-annotated classes from being renamed so that
# JSON field names remain consistent with server expectations.
-keep @kotlinx.serialization.Serializable class * { *; }

# ── Kotlin Metadata ─────────────────────────────────────────────────────────────
# Required for kotlin-reflect and serialization to read class metadata.
-keep class kotlin.Metadata { *; }

# ── Coroutines ────────────────────────────────────────────────────────────────
# Prevent stripping of coroutine internals used by Ktor and sync engine.
-dontwarn kotlinx.coroutines.**
-keep class kotlinx.coroutines.** { *; }

# ── PowerSync ─────────────────────────────────────────────────────────────────
# Keep PowerSync SDK classes that are accessed via reflection.
-dontwarn com.powersync.**
-keep class com.powersync.** { *; }

# ── Ktor Client ───────────────────────────────────────────────────────────────
# Keep Ktor engine and serialization integration classes.
-dontwarn io.ktor.**
-keep class io.ktor.** { *; }

# ── General ───────────────────────────────────────────────────────────────────
# Preserve source file names and line numbers for crash reports.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
