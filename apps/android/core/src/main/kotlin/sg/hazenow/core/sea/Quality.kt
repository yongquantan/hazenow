package sg.hazenow.core.sea

import kotlin.math.abs

/** Data-quality screens (port of countries/quality.ts): plausibility guard and the 24-h offline rule. */
object Quality {
    const val PM25_PLAUSIBLE_MAX = 1000.0
    const val PM25_MAX_JUMP_1H = 400.0
    const val OFFLINE_AFTER_MS = 24 * SeaTime.HOUR_MS

    private fun outOfRange(v: Double?) = v != null && (!v.isFinite() || v < 0 || v > PM25_PLAUSIBLE_MAX)

    /** "out_of_range" | "jump" | null */
    fun plausibility(o: Observation): String? {
        if (outOfRange(o.pm25_1h) || outOfRange(o.pm25_now) || outOfRange(o.pm25_24h)) return "out_of_range"
        val v = o.pm25_1h
        val end = SeaTime.parseMs(o.periodEnd)
        if (v != null && !o.history.isNullOrEmpty() && end != null) {
            val prev = o.history.firstOrNull { h -> SeaTime.parseMs(h.time)?.let { abs(it - (end - SeaTime.HOUR_MS)) < 60_000 } == true }?.pm25
            if (prev != null && !outOfRange(prev) && v - prev > PM25_MAX_JUMP_1H) return "jump"
        }
        return null
    }

    fun isOffline(o: Observation, now: Long): Boolean {
        val t = SeaTime.parseMs(o.periodEnd) ?: return true
        return now - t > OFFLINE_AFTER_MS
    }

    data class Screened(val kept: List<Observation>, val implausible: List<Observation>, val offline: List<Observation>)

    fun screen(obs: List<Observation>, now: Long): Screened {
        val kept = mutableListOf<Observation>()
        val bad = mutableListOf<Observation>()
        val off = mutableListOf<Observation>()
        for (o in obs) {
            if (isOffline(o, now)) { off += o; continue }
            if (plausibility(o) != null) { bad += o; continue }
            val badHist = o.history?.any { outOfRange(it.pm25) || outOfRange(it.pm25Avg24h) } == true
            kept += if (badHist) o.copy(history = o.history!!.map {
                it.copy(pm25 = if (outOfRange(it.pm25)) null else it.pm25, pm25Avg24h = if (outOfRange(it.pm25Avg24h)) null else it.pm25Avg24h)
            }) else o
        }
        return Screened(kept, bad, off)
    }
}

/** Crowd-sensor QC (port of countries/crowd.ts). The proxy already applies it; clients re-check usability. */
object Crowd {
    const val CROWD_MAX_AGE_MIN = 15

    /** EPA-extended correction for PMS5003 cf_1 (µg/m³) and RH (%). */
    fun epaExtended(pa: Double, rh: Double): Double {
        val r = if (rh.isFinite()) rh else 50.0
        val c = when {
            pa < 30 -> 0.524 * pa - 0.0862 * r + 5.75
            pa < 50 -> { val f = pa / 20 - 1.5; (0.786 * f + 0.524 * (1 - f)) * pa - 0.0862 * r + 5.75 }
            pa < 210 -> 0.786 * pa - 0.0862 * r + 5.75
            pa < 260 -> {
                val w = pa / 50 - 4.2
                (0.69 * w + 0.786 * (1 - w)) * pa - 0.0862 * r * (1 - w) + 2.966 * w + 5.75 * (1 - w) + 8.84e-4 * pa * pa * w
            }
            else -> 2.966 + 0.69 * pa + 8.84e-4 * pa * pa
        }
        return maxOf(0.0, Math.round(c * 100) / 100.0)
    }

    fun usable(o: Observation): Boolean = o.grade == "lowcost" && (o.qc == null || o.qc == "ok" || o.qc == "uncalibrated")
}
