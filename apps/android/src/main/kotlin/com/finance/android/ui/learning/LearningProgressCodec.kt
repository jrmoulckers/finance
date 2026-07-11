// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.learning

/**
 * Plain-text codec for [LearningState] (#2208).
 *
 * Uses a small line-based format instead of a JSON dependency. Learning IDs are
 * simple slugs (letters, digits, hyphens) so reserved delimiters never collide
 * with real content. Pure and deterministic, so it is directly unit-testable.
 *
 * Format:
 * ```
 * v1
 * meta<US>lastActivePathId<US>lastActiveModuleIndex<US>streakDays<US>lastActiveEpochDay
 * path<US>pathId<US>completedId,completedId<US>moduleId=score;moduleId=score
 * ```
 * where `<US>` is the unit-separator character.
 */
object LearningProgressCodec {

    private const val VERSION = "v1"
    private const val FIELD = '\u001F' // unit separator
    private const val LIST = ','
    private const val MAP_ENTRY = ';'
    private const val MAP_KV = '='

    /** Serializes [state] into a single string. */
    fun encode(state: LearningState): String {
        val sb = StringBuilder()
        sb.append(VERSION).append('\n')
        sb.append("meta")
            .append(FIELD).append(state.lastActivePathId ?: "")
            .append(FIELD).append(state.lastActiveModuleIndex)
            .append(FIELD).append(state.streakDays)
            .append(FIELD).append(state.lastActiveEpochDay)
            .append('\n')

        state.progress.values.forEach { progress ->
            val completed = progress.completedModuleIds.joinToString(LIST.toString())
            val scores = progress.quizScores.entries.joinToString(MAP_ENTRY.toString()) {
                "${it.key}$MAP_KV${it.value}"
            }
            sb.append("path")
                .append(FIELD).append(progress.pathId)
                .append(FIELD).append(completed)
                .append(FIELD).append(scores)
                .append('\n')
        }
        return sb.toString().trimEnd('\n')
    }

    /** Parses a string produced by [encode] back into a [LearningState]. */
    fun decode(encoded: String): LearningState {
        val lines = encoded.split('\n').filter { it.isNotBlank() }
        if (lines.isEmpty() || lines.first().trim() != VERSION) return LearningState()

        var lastActivePathId: String? = null
        var lastActiveModuleIndex = 0
        var streakDays = 0
        var lastActiveEpochDay = 0L
        val progress = LinkedHashMap<String, LearningProgress>()

        lines.drop(1).forEach { line ->
            val parts = line.split(FIELD)
            when (parts.firstOrNull()) {
                "meta" -> {
                    lastActivePathId = parts.getOrNull(1)?.ifBlank { null }
                    lastActiveModuleIndex = parts.getOrNull(2)?.toIntOrNull() ?: 0
                    streakDays = parts.getOrNull(3)?.toIntOrNull() ?: 0
                    lastActiveEpochDay = parts.getOrNull(4)?.toLongOrNull() ?: 0L
                }
                "path" -> {
                    val pathId = parts.getOrNull(1)?.ifBlank { null } ?: return@forEach
                    val completed = parts.getOrNull(2)
                        ?.split(LIST)
                        ?.filter { it.isNotBlank() }
                        ?.toSet()
                        ?: emptySet()
                    val scores = parts.getOrNull(3)
                        ?.split(MAP_ENTRY)
                        ?.filter { it.isNotBlank() }
                        ?.mapNotNull { entry ->
                            val kv = entry.split(MAP_KV)
                            val key = kv.getOrNull(0)
                            val value = kv.getOrNull(1)?.toFloatOrNull()
                            if (key != null && value != null) key to value else null
                        }
                        ?.toMap()
                        ?: emptyMap()
                    progress[pathId] = LearningProgress(
                        pathId = pathId,
                        completedModuleIds = completed,
                        quizScores = scores,
                    )
                }
            }
        }

        return LearningState(
            progress = progress,
            lastActivePathId = lastActivePathId,
            lastActiveModuleIndex = lastActiveModuleIndex,
            streakDays = streakDays,
            lastActiveEpochDay = lastActiveEpochDay,
        )
    }
}
