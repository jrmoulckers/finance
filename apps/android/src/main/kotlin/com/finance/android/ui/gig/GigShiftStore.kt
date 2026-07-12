// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gig

import android.content.SharedPreferences
import kotlinx.datetime.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import timber.log.Timber

/**
 * Persistence abstraction for driving shifts (#2137). Extracted as an interface so the
 * [GigToolsViewModel] can be unit-tested on the JVM with an in-memory implementation while
 * production uses the SharedPreferences-backed [GigShiftStore].
 */
interface GigShiftRepository {
    /** Returns all stored shifts, newest first. */
    fun shifts(): List<MileageShift>

    /** Inserts or replaces a shift by [MileageShift.id]. */
    fun upsert(shift: MileageShift)

    /** Removes every stored shift. */
    fun clear()
}

/**
 * On-device persistence for shift-based mileage tracking (#2137).
 *
 * Driving shifts are private, on-device operational data (odometer readings, timestamps),
 * so they live in the app's [SharedPreferences] as a small JSON blob rather than syncing.
 * This keeps mileage capture instant and offline-friendly from the car. Only the derived
 * deductible expense (if the driver chooses to log one) becomes a synced transaction.
 *
 * The store is deliberately thin: it (de)serializes the shift list and exposes append /
 * replace / clear. All mileage *maths* lives in [GigMileage].
 *
 * Serialization uses the kotlinx-serialization **runtime** JSON tree API
 * ([buildJsonObject] / [JsonObject]) rather than `@Serializable` codegen, because this module
 * does not apply the serialization compiler plugin. Timestamps are stored as epoch
 * milliseconds and the platform as its stable enum name so the format is version-stable.
 */
class GigShiftStore(
    private val prefs: SharedPreferences,
    private val json: Json = DEFAULT_JSON,
) : GigShiftRepository {

    /** Returns all stored shifts, newest first. Corrupt data is dropped defensively. */
    override fun shifts(): List<MileageShift> {
        val raw = prefs.getString(KEY_SHIFTS, null) ?: return emptyList()
        return runCatching {
            val array = json.parseToJsonElement(raw) as JsonArray
            array.map { element -> decodeShift(element.jsonObject) }
        }.getOrElse {
            Timber.w(it, "Failed to decode stored gig shifts; resetting")
            emptyList()
        }.sortedByDescending { it.startedAt }
    }

    /** Overwrites the entire shift list. */
    fun save(shifts: List<MileageShift>) {
        val array = buildJsonArray {
            shifts.forEach { add(encodeShift(it)) }
        }
        prefs.edit()
            .putString(KEY_SHIFTS, json.encodeToString(JsonArray.serializer(), array))
            .apply()
    }

    /** Inserts or replaces a shift by [MileageShift.id]. */
    override fun upsert(shift: MileageShift) {
        val next = shifts().filterNot { it.id == shift.id } + shift
        save(next)
    }

    /** Removes every stored shift. */
    override fun clear() {
        prefs.edit().remove(KEY_SHIFTS).apply()
    }

    private fun encodeShift(shift: MileageShift): JsonObject = buildJsonObject {
        put(FIELD_ID, shift.id)
        put(FIELD_PLATFORM, shift.platform.name)
        put(FIELD_STARTED_AT, shift.startedAt.toEpochMilliseconds())
        shift.endedAt?.let { put(FIELD_ENDED_AT, it.toEpochMilliseconds()) }
        shift.startOdometer?.let { put(FIELD_START_ODO, it) }
        shift.endOdometer?.let { put(FIELD_END_ODO, it) }
    }

    private fun decodeShift(obj: JsonObject): MileageShift = MileageShift(
        id = obj[FIELD_ID]?.jsonPrimitive?.contentOrNull.orEmpty(),
        platform = GigPlatform.fromNameOrOther(obj[FIELD_PLATFORM]?.jsonPrimitive?.contentOrNull),
        startedAt = Instant.fromEpochMilliseconds(obj.getValue(FIELD_STARTED_AT).jsonPrimitive.long),
        endedAt = obj[FIELD_ENDED_AT]?.jsonPrimitive?.long?.let(Instant::fromEpochMilliseconds),
        startOdometer = obj[FIELD_START_ODO]?.jsonPrimitive?.contentOrNull?.toIntOrNull(),
        endOdometer = obj[FIELD_END_ODO]?.jsonPrimitive?.contentOrNull?.toIntOrNull(),
    )

    private companion object {
        const val KEY_SHIFTS = "gig.mileage.shifts"
        const val FIELD_ID = "id"
        const val FIELD_PLATFORM = "platform"
        const val FIELD_STARTED_AT = "startedAtMs"
        const val FIELD_ENDED_AT = "endedAtMs"
        const val FIELD_START_ODO = "startOdometer"
        const val FIELD_END_ODO = "endOdometer"
        val DEFAULT_JSON = Json { ignoreUnknownKeys = true }
    }
}
