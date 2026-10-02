package sg.hazenow.core.sea

import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeParseException
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

/** Wall-clock helpers for fixed-offset zones (no DST anywhere in SEA). Port of countries/time.ts. */
object SeaTime {
    const val HOUR_MS = 3_600_000L

    private fun pad(n: Int) = n.toString().padStart(2, '0')

    fun offsetLabel(hours: Double): String {
        val sign = if (hours >= 0) "+" else "-"
        val a = abs(hours)
        return "$sign${pad(floor(a).toInt())}:${pad(((a % 1) * 60).roundToInt())}"
    }

    private val WALL = Regex("""^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?""")

    /** "2026-09-28 16:00[:00]" + offset → "2026-09-28T16:00:00+07:00". Null if unparseable. */
    fun wallToIso(wall: String, offsetHours: Double): String? {
        val m = WALL.find(wall.trim()) ?: return null
        val g = m.groupValues
        val sec = g[6].ifEmpty { "00" }
        return "${g[1]}-${g[2]}-${g[3]}T${g[4]}:${g[5]}:$sec${offsetLabel(offsetHours)}"
    }

    /** Instant (ms) → local ISO with offset, seconds precision. */
    fun msToIso(ms: Long, offsetHours: Double): String {
        val off = ZoneOffset.ofTotalSeconds((offsetHours * 3600).roundToInt())
        val t = Instant.ofEpochMilli(ms).atOffset(off)
        return "${t.year}-${pad(t.monthValue)}-${pad(t.dayOfMonth)}T${pad(t.hour)}:${pad(t.minute)}:${pad(t.second)}${offsetLabel(offsetHours)}"
    }

    fun localDate(ms: Long, offsetHours: Double): String = msToIso(ms, offsetHours).substring(0, 10)

    /** ISO 8601 (with offset or Z) → epoch ms, or null (TS `Date.parse` → NaN). */
    fun parseMs(iso: String?): Long? {
        if (iso.isNullOrBlank()) return null
        return try {
            OffsetDateTime.parse(iso).toInstant().toEpochMilli()
        } catch (e: DateTimeParseException) {
            try { Instant.parse(iso).toEpochMilli() } catch (e2: DateTimeParseException) { null }
        }
    }

    fun isoUtc(ms: Long): String = Instant.ofEpochMilli(ms).toString()

    /** Parse a number that may arrive as a string; sentinel/invalid values → null. */
    fun num(v: Any?, sentinels: List<Double> = listOf(-1.0, -999.0, -9999.0)): Double? {
        val n = when (v) {
            is Number -> v.toDouble()
            is String -> if (v.isBlank()) Double.NaN else v.trim().toDoubleOrNull() ?: Double.NaN
            else -> Double.NaN
        }
        if (!n.isFinite() || n < 0 || n in sentinels) return null
        return n
    }
}
