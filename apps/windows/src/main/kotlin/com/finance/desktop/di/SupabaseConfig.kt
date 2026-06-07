// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

/** Supabase runtime configuration for the Windows auth client. */
internal data class SupabaseConfig(
    val url: String,
    val anonKey: String,
) {
    companion object {
        const val URL_ENV_VAR = "SUPABASE_URL"
        const val ANON_KEY_ENV_VAR = "SUPABASE_ANON_KEY"

        fun fromEnvironment(environment: Map<String, String> = System.getenv()): SupabaseConfig {
            val url = environment[URL_ENV_VAR]?.trim().orEmpty()
            val anonKey = environment[ANON_KEY_ENV_VAR]?.trim().orEmpty()
            val missing = buildList {
                if (url.isBlank()) add(URL_ENV_VAR)
                if (anonKey.isBlank()) add(ANON_KEY_ENV_VAR)
            }

            if (missing.isNotEmpty()) {
                throw IllegalStateException(missingConfigurationMessage(missing))
            }

            return SupabaseConfig(url = url, anonKey = anonKey)
        }

        fun missingConfigurationMessage(missing: List<String>): String {
            return buildString {
                append("Finance is not configured. Set ")
                append(URL_ENV_VAR)
                append(" and ")
                append(ANON_KEY_ENV_VAR)
                append(" environment variables and restart Finance.")
                append(System.lineSeparator())
                append(System.lineSeparator())
                append("Missing: ")
                append(missing.joinToString(", "))
                append(System.lineSeparator())
                append(System.lineSeparator())
                append("On Windows, set them in System Properties → Environment Variables, or run:")
                append(System.lineSeparator())
                append("setx ")
                append(URL_ENV_VAR)
                append(" \"https://<project>.supabase.co\"")
                append(System.lineSeparator())
                append("setx ")
                append(ANON_KEY_ENV_VAR)
                append(" \"<anon-key>\"")
                append(System.lineSeparator())
                append(System.lineSeparator())
                append("Restart Finance after updating environment variables.")
            }
        }
    }
}
