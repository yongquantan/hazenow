package sg.hazenow.core.sea

import sg.hazenow.core.Band
import sg.hazenow.core.Experience
import sg.hazenow.core.Profile
import sg.hazenow.core.sea.CountryCode.BN
import sg.hazenow.core.sea.CountryCode.ID
import sg.hazenow.core.sea.CountryCode.KH
import sg.hazenow.core.sea.CountryCode.LA
import sg.hazenow.core.sea.CountryCode.MM
import sg.hazenow.core.sea.CountryCode.MY
import sg.hazenow.core.sea.CountryCode.PH
import sg.hazenow.core.sea.CountryCode.SG
import sg.hazenow.core.sea.CountryCode.TH
import sg.hazenow.core.sea.CountryCode.TL
import sg.hazenow.core.sea.CountryCode.VN
import kotlin.math.max

data class CountryVerdict(
    val headline: String,
    val short: String,
    val secondLine: String?,
    val forWhom: String,
    val profile: Profile,
    val sensitive: Boolean,
    /** Headline hedged on a 24-hr index ("Based on the 24-hr index: …"). */
    val hedged: Boolean = false,
    val needsReview: Boolean = false,
    /** The headline comes from a community estimate mapped to the authority's category ("Estimate: …"). */
    val estimate: Boolean = false,
    /** No national scale: the headline follows WHO 2021 guidance bands. */
    val whoBased: Boolean = false,
    val headlineLocal: String? = null,
    val shortLocal: String? = null,
    val secondLineLocal: String? = null,
)

data class WhoBand(val max: Double, val key: String, val word: String, val en: String, val short: String, val sev: Int, val level: Int)

/**
 * Verdict copy per jurisdiction (SPEC v2.0 §7, COPY.md §20). Port of countries/verdicts.ts. The headline always
 * answers "is it OK to be out?"; "No official reading near here." / "There's no official air-quality scale here."
 * are only ever the small line under the number (see [CountryUi.numberSub]).
 */
object Verdicts {
    private fun pad2(n: Int) = n.toString().padStart(2, '0')
    private val HM = Regex("""T(\d{2}):(\d{2})""")

    /** "4pm" / "4:30pm" in the timestamp's own zone (the station's local time). */
    fun formatLocalTime(iso: String): String {
        val m = HM.find(iso) ?: return iso
        val h24 = m.groupValues[1].toInt()
        val min = m.groupValues[2].toInt()
        val h12 = if (h24 % 12 == 0) 12 else h24 % 12
        return "$h12${if (min != 0) ":${pad2(min)}" else ""}${if (h24 < 12) "am" else "pm"}"
    }

    fun formatThaiTime(iso: String): String = HM.find(iso)?.let { "${it.groupValues[1]}:${it.groupValues[2]} น." } ?: iso

    /* ------------------------------------------------------------ profiles */

    /** TS normaliseProfile: known ids in PROFILES order, "general" dropped next to a sensitive one. */
    fun normalise(profiles: Set<Profile>): List<Profile> {
        var out = profiles.toSet()
        if (out.any { it.sensitive }) out = out - Profile.GENERAL
        if (out.isEmpty()) out = setOf(Profile.GENERAL)
        return Profile.entries.filter { it in out }
    }

    fun forWhom(ids: List<Profile>): String = when {
        ids.size >= 3 -> "For your household"
        ids.size == 1 -> ids[0].forLabel
        else -> "For " + ids.joinToString(" + ") { it.fragment }
    }

    private enum class G { GENERAL, KIDS, SENSITIVE, EXERCISING, OUTDOOR_WORKER }
    private val TIE = listOf(G.SENSITIVE, G.KIDS, G.EXERCISING, G.OUTDOOR_WORKER, G.GENERAL)
    private fun group(p: Profile): G = when (p) {
        Profile.ELDERLY, Profile.PREGNANT, Profile.HEART_LUNG -> G.SENSITIVE
        Profile.KIDS -> G.KIDS
        Profile.EXERCISING -> G.EXERCISING
        Profile.OUTDOOR_WORK -> G.OUTDOOR_WORKER
        Profile.GENERAL -> G.GENERAL
    }

    /* ------------------------------------------------------------ Thailand */

    private class ThCell(val en: String, val short: String, val th: String, val shortTh: String, val strict: Int)
    private fun T(en: String, short: String, th: String, shortTh: String, strict: Int) = ThCell(en, short, th, shortTh, strict)

    private val THAI_VERDICTS: Map<String, Map<G, ThCell>> = mapOf(
        "very_good" to mapOf(
            G.GENERAL to T("Fine to be out.", "Fine to be out", "ออกไปข้างนอกได้ตามปกติ", "ออกไปข้างนอกได้", 0),
            G.KIDS to T("Fine for outdoor play.", "Fine for outdoor play", "เด็กเล่นกลางแจ้งได้ตามปกติ", "เล่นกลางแจ้งได้", 0),
            G.SENSITIVE to T("Fine to be out.", "Fine to be out", "ออกไปข้างนอกได้ตามปกติ", "ออกไปข้างนอกได้", 0),
            G.EXERCISING to T("Fine to exercise outside.", "Fine to exercise outside", "ออกกำลังกายกลางแจ้งได้ตามปกติ", "ออกกำลังกายกลางแจ้งได้", 0),
            G.OUTDOOR_WORKER to T("Fine to be out.", "Fine to be out", "ออกไปข้างนอกได้ตามปกติ", "ออกไปข้างนอกได้", 0),
        ),
        "good" to mapOf(
            G.GENERAL to T("Fine to be out.", "Fine to be out", "ออกไปข้างนอกได้ตามปกติ", "ออกไปข้างนอกได้", 0),
            G.KIDS to T("Fine for outdoor play. Watch for coughing.", "Fine, watch for coughs", "เด็กเล่นกลางแจ้งได้ สังเกตอาการไอ", "เล่นได้ สังเกตอาการไอ", 1),
            G.SENSITIVE to T("Fine to be out. Watch for coughing or breathlessness.", "Fine, watch for symptoms", "ออกไปข้างนอกได้ สังเกตอาการไอหรือหายใจลำบาก", "ออกได้ สังเกตอาการ", 1),
            G.EXERCISING to T("Fine to exercise outside.", "Fine to exercise outside", "ออกกำลังกายกลางแจ้งได้ตามปกติ", "ออกกำลังกายกลางแจ้งได้", 0),
            G.OUTDOOR_WORKER to T("Fine to be out.", "Fine to be out", "ออกไปข้างนอกได้ตามปกติ", "ออกไปข้างนอกได้", 0),
        ),
        "moderate" to mapOf(
            G.GENERAL to T("OK to be out. Cut back on long, hard exercise for now.", "Go easy outdoors", "ออกไปข้างนอกได้ ช่วงนี้ลดเวลาออกกำลังกายหนักกลางแจ้ง", "ลดกิจกรรมหนักกลางแจ้ง", 2),
            G.KIDS to T("Calm play outside is OK. Skip running games for now.", "Calm play only", "เล่นกลางแจ้งแบบเบาๆ ได้ งดวิ่งเล่นไปก่อน", "เล่นเบาๆ เท่านั้น", 3),
            G.SENSITIVE to T("Gentle activity is OK. Skip hard exercise for now.", "Gentle activity only", "ทำกิจกรรมเบาๆ ได้ งดออกกำลังกายหนักไปก่อน", "กิจกรรมเบาๆ เท่านั้น", 3),
            G.EXERCISING to T("Keep your workout shorter and lighter for now.", "Shorter, lighter workout", "ช่วงนี้ออกกำลังกายให้สั้นและเบาลง", "ออกกำลังกายให้เบาลง", 3),
            G.OUTDOOR_WORKER to T("OK to work outside. Take breaks indoors if you can.", "Take breaks indoors", "ทำงานกลางแจ้งได้ พักในอาคารเมื่อทำได้", "พักในอาคารเป็นระยะ", 2),
        ),
        "starting_to_affect" to mapOf(
            G.GENERAL to T("Short trips out are OK. Limit hard exercise outside.", "Limit outdoor exercise", "ออกไปข้างนอกระยะสั้นได้ จำกัดการออกกำลังกายหนักกลางแจ้ง", "จำกัดการออกกำลังกายกลางแจ้ง", 4),
            G.KIDS to T("Indoor play for now. Keep trips out short.", "Indoor play for now", "ช่วงนี้ให้เด็กเล่นในบ้าน ออกไปข้างนอกให้สั้นที่สุด", "เล่นในบ้านไปก่อน", 5),
            G.SENSITIVE to T("Avoid hard exercise outside for now. Keep trips out short.", "Avoid outdoor exertion", "งดกิจกรรมที่ใช้แรงมากกลางแจ้งไปก่อน ออกไปข้างนอกให้สั้นที่สุด", "งดกิจกรรมหนักกลางแจ้ง", 5),
            G.EXERCISING to T("Move your workout indoors.", "Work out indoors", "ย้ายไปออกกำลังกายในอาคาร", "ออกกำลังกายในอาคาร", 4),
            G.OUTDOOR_WORKER to T("Take regular breaks indoors. Ask about lighter outdoor tasks.", "Take regular indoor breaks", "พักในอาคารเป็นระยะ สอบถามเรื่องงานกลางแจ้งที่เบาลง", "พักในอาคารเป็นระยะ", 4),
        ),
        "affects_health" to mapOf(
            G.GENERAL to T("Avoid outdoor activities for now. Go out only if you need to.", "Stay indoors for now", "หลีกเลี่ยงกิจกรรมกลางแจ้งไปก่อน ออกไปข้างนอกเมื่อจำเป็นเท่านั้น", "อยู่ในอาคารไปก่อน", 6),
            G.KIDS to T("Keep kids indoors for now.", "Kids indoors for now", "ให้เด็กอยู่ในบ้านไปก่อน", "ให้เด็กอยู่ในบ้าน", 7),
            G.SENSITIVE to T("Stay indoors for now. Keep your medicine close.", "Stay indoors for now", "อยู่ในที่ปลอดภัยไปก่อน เตรียมยาประจำตัวให้พร้อม", "อยู่ในอาคารไปก่อน", 7),
            G.EXERCISING to T("Skip outdoor exercise and keep time outside short for now.", "No outdoor exercise", "งดออกกำลังกายกลางแจ้ง และลดเวลาอยู่กลางแจ้งไปก่อน", "งดออกกำลังกายกลางแจ้ง", 6),
            G.OUTDOOR_WORKER to T("Limit time outside for now. Ask about indoor work.", "Limit time outside", "ลดเวลาอยู่กลางแจ้งไปก่อน สอบถามเรื่องงานในอาคาร", "ลดเวลากลางแจ้ง", 6),
        ),
    )

    /** 1-hr at least 1.5× (and 15 above) the 24-h average: the "now" signal under a 24-hr chip. */
    fun hourAboveDay(pm25: Int?, pm25_24h: Double?): Boolean =
        pm25 != null && pm25_24h != null && pm25 >= max(1.5 * pm25_24h, pm25_24h + 15)

    private fun staleLine(s: CountrySnapshot) = "Reading is from ${formatLocalTime(s.observedAt)}. It may not match the air now."

    fun thaiSecondLine(s: CountrySnapshot): Pair<String, String>? {
        if (s.stale) return staleLine(s) to "ค่าที่แสดงเป็นของเวลา ${formatThaiTime(s.observedAt)} อาจไม่ตรงกับอากาศตอนนี้"
        val lvl = s.level ?: 0
        if (s.trend.delta >= 20) return if (lvl >= 1) "Getting worse. Check again in an hour." to "ค่าฝุ่นกำลังสูงขึ้น ตรวจสอบอีกครั้งในอีกหนึ่งชั่วโมง"
        else "Rising quickly. Check again in an hour." to "ค่าฝุ่นเพิ่มขึ้นเร็ว ตรวจสอบอีกครั้งในอีกหนึ่งชั่วโมง"
        if (hourAboveDay(s.pm25, s.pm25_24h)) return "The last hour is higher than the 24-hour average. Check again in an hour." to
            "ค่าชั่วโมงล่าสุดสูงกว่าค่าเฉลี่ย 24 ชั่วโมง ตรวจสอบอีกครั้งในอีกหนึ่งชั่วโมง"
        if (s.trend.delta <= -20 && lvl >= 1) return "Getting better. Check again in an hour." to "ค่าฝุ่นกำลังลดลง ตรวจสอบอีกครั้งในอีกหนึ่งชั่วโมง"
        return null
    }

    private fun thaiVerdict(s: CountrySnapshot, ids: List<Profile>): CountryVerdict? {
        val key = s.localBand?.takeIf { it.scaleId == "th_aqi" }?.key ?: return null
        val row = THAI_VERDICTS[key] ?: return null
        var pick = group(ids[0])
        var pickProfile = ids[0]
        for (p in ids) {
            val g = group(p)
            if (row.getValue(g).strict > row.getValue(pick).strict ||
                (row.getValue(g).strict == row.getValue(pick).strict && TIE.indexOf(g) < TIE.indexOf(pick))
            ) { pick = g; pickProfile = p }
        }
        val cell = row.getValue(pick)
        val second = thaiSecondLine(s)
        return CountryVerdict(cell.en, cell.short, second?.first, forWhom(ids), pickProfile, ids.any { it.sensitive },
            headlineLocal = cell.th, shortLocal = cell.shortTh, secondLineLocal = second?.second)
    }

    /* ------------------------------------------------------------ category verdicts (MY, ID, VN, PH) */

    /** Advice severity 0–4 per category, general / sensitive (docs/sea/<country>.md). */
    val CATEGORY_SEVERITY: Map<String, Map<String, Pair<Int, Int>>> = mapOf(
        "th_aqi" to mapOf("very_good" to (0 to 0), "good" to (0 to 0), "moderate" to (2 to 2), "starting_to_affect" to (2 to 3), "affects_health" to (4 to 4)),
        "my_api" to mapOf("good" to (0 to 0), "moderate" to (0 to 0), "unhealthy" to (1 to 2), "very_unhealthy" to (2 to 4), "hazardous" to (4 to 4), "emergency" to (4 to 4)),
        "id_ispu" to mapOf("baik" to (0 to 0), "sedang" to (0 to 1), "tidak_sehat" to (2 to 3), "sangat_tidak_sehat" to (3 to 4), "berbahaya" to (4 to 4)),
        "vn_aqi" to mapOf("tot" to (0 to 0), "trung_binh" to (0 to 1), "kem" to (1 to 2), "xau" to (2 to 3), "rat_xau" to (3 to 4), "nguy_hai" to (4 to 4)),
        "ph_dao_2020_14" to mapOf("good" to (0 to 0), "fair" to (0 to 1), "usg" to (1 to 2), "very_unhealthy" to (3 to 4), "acutely_unhealthy" to (3 to 4), "emergency" to (4 to 4)),
    )

    val UNHEALTHY_FROM: Map<String, String> = mapOf(
        "th_aqi" to "starting_to_affect", "my_api" to "unhealthy", "id_ispu" to "tidak_sehat", "vn_aqi" to "kem", "ph_dao_2020_14" to "usg",
    )

    private class Cell(val en: String, val short: String, val sev: Int)
    private fun c(en: String, short: String, sev: Int) = Cell(en, short, sev)
    private fun row(g: Cell, k: Cell, s: Cell, e: Cell, o: Cell) =
        mapOf(G.GENERAL to g, G.KIDS to k, G.SENSITIVE to s, G.EXERCISING to e, G.OUTDOOR_WORKER to o)

    private val FINE = row(
        c("Fine to be out.", "Fine to be out", 0), c("Fine for outdoor play.", "Fine for outdoor play", 0), c("Fine to be out.", "Fine to be out", 0),
        c("Fine to exercise outside.", "Fine to exercise outside", 0), c("Fine to work outside.", "Fine to work outside", 0),
    )
    private val SENSITIVE_EASY = row(
        c("Fine to be out.", "Fine to be out", 0), c("Fine for outdoor play. Keep long, hard games short.", "Fine, keep hard games short", 1),
        c("Fine to be out. Keep hard exercise short.", "Keep hard exercise short", 1), c("Fine to exercise outside.", "Fine to exercise outside", 0),
        c("Fine to work outside.", "Fine to work outside", 0),
    )
    private val GO_EASY = row(
        c("Go easy outdoors for now. Keep hard exercise short.", "Go easy outdoors", 1), c("Calm play outside for now. Skip running games.", "Calm play only", 2),
        c("Limit time outside for now. Skip hard exercise.", "Limit time outside", 2), c("Keep your workout short and light, or move it indoors.", "Short, light workout", 2),
        c("Take breaks indoors when you can.", "Take indoor breaks", 1),
    )
    private val REDUCE = row(
        c("Cut back on long or hard activity outside for now.", "Cut back outdoors", 2), c("Indoor play for now. Keep trips out short.", "Indoor play for now", 3),
        c("Avoid outdoor activity for now. Keep your medicine close.", "Avoid going out for now", 3), c("Move your workout indoors for now.", "Work out indoors", 3),
        c("Take regular breaks indoors. Ask about lighter tasks.", "Take regular indoor breaks", 2),
    )
    private val AVOID = row(
        c("Avoid long or hard activity outside. Keep trips out short.", "Keep trips out short", 3), c("Keep kids indoors for now.", "Kids indoors for now", 4),
        c("Stay indoors for now. Keep your medicine close.", "Stay indoors for now", 4), c("Skip outdoor exercise for now.", "No outdoor exercise", 3),
        c("Limit time outside. Ask about indoor work.", "Limit time outside", 3),
    )
    private val INDOORS = row(
        c("Stay indoors for now. Go out only if you need to.", "Stay indoors for now", 4), c("Keep kids indoors for now.", "Kids indoors for now", 4),
        c("Stay indoors for now. Keep your medicine close.", "Stay indoors for now", 4), c("Skip outdoor exercise. Stay indoors for now.", "Stay indoors for now", 4),
        c("Keep time outside to a minimum. Ask about indoor work.", "Minimise time outside", 4),
    )
    private val EMERGENCY = row(
        c("Stay indoors and follow official instructions.", "Stay indoors", 4), c("Keep kids indoors and follow official instructions.", "Kids indoors", 4),
        c("Stay indoors, keep your medicine close, and follow official instructions.", "Stay indoors", 4),
        c("Stay indoors and follow official instructions.", "Stay indoors", 4), c("Stop outdoor work if you can. Follow official instructions.", "Stop outdoor work", 4),
    )

    private val CATEGORY_VERDICTS: Map<String, Map<String, Map<G, Cell>>> = mapOf(
        "my_api" to mapOf("good" to FINE, "moderate" to FINE, "unhealthy" to GO_EASY, "very_unhealthy" to AVOID, "hazardous" to INDOORS, "emergency" to EMERGENCY),
        "id_ispu" to mapOf("baik" to FINE, "sedang" to SENSITIVE_EASY, "tidak_sehat" to REDUCE, "sangat_tidak_sehat" to AVOID, "berbahaya" to INDOORS),
        "vn_aqi" to mapOf("tot" to FINE, "trung_binh" to SENSITIVE_EASY, "kem" to GO_EASY, "xau" to REDUCE, "rat_xau" to AVOID, "nguy_hai" to INDOORS),
        "ph_dao_2020_14" to mapOf("good" to FINE, "fair" to SENSITIVE_EASY, "usg" to GO_EASY, "very_unhealthy" to AVOID, "acutely_unhealthy" to AVOID, "emergency" to INDOORS),
    )

    private class CatPick(val cell: Cell, val profile: Profile)
    private fun categoryVerdictCell(scaleId: String, key: String, ids: List<Profile>): CatPick? {
        val r = CATEGORY_VERDICTS[scaleId]?.get(key) ?: return null
        var pick = group(ids[0])
        var pickProfile = ids[0]
        for (p in ids) {
            val g = group(p)
            if (r.getValue(g).sev > r.getValue(pick).sev || (r.getValue(g).sev == r.getValue(pick).sev && TIE.indexOf(g) < TIE.indexOf(pick))) {
                pick = g; pickProfile = p
            }
        }
        return CatPick(r.getValue(pick), pickProfile)
    }

    fun severityBand(sev: Int): Band = when {
        sev == 0 -> Band.NORMAL; sev <= 2 -> Band.ELEVATED; sev == 3 -> Band.HIGH; else -> Band.VERY_HIGH
    }

    fun atOrAboveUnhealthy(scaleId: String, key: String): Boolean {
        val from = UNHEALTHY_FROM[scaleId] ?: return false
        val bands = Scales.SCALES[scaleId]?.bands ?: return false
        val i = bands.indexOfFirst { it.key == key }
        val f = bands.indexOfFirst { it.key == from }
        return i >= 0 && f >= 0 && i >= f
    }

    /** Band for "What helps now" and notifications outside SG: the closest SG band by the authority's advice. */
    fun adviceBand(s: CountrySnapshot): Band? {
        if (s.country == SG) return s.band
        val b = s.localBand ?: return s.band
        val sev = CATEGORY_SEVERITY[b.scaleId]?.get(b.key) ?: return s.band
        var band = severityBand(max(sev.first, if (sev.second >= 3) 2 else 0))
        if (atOrAboveUnhealthy(b.scaleId, b.key) && band.ordinal < Band.HIGH.ordinal) band = Band.HIGH
        return band
    }

    val EMERGENCY_NUMBER: Map<CountryCode, String> = mapOf(
        SG to "995", TH to "1669", MY to "999", ID to "112", VN to "115", PH to "911", LA to "1195", KH to "119", MM to "192", BN to "991", TL to "112",
    )

    /** "What helps now" outside SG: COPY §5 actions for [adviceBand], with the local emergency number. */
    fun countryActions(s: CountrySnapshot, profiles: Set<Profile>): List<String> {
        val band = adviceBand(s) ?: return emptyList()
        val list = Experience.actions(band, profiles)
        return if (s.country == SG) list else list.map { it.replace(Regex("call 995\\b"), "call ${EMERGENCY_NUMBER.getValue(s.country)}") }
    }

    fun hedgedOn24h(s: CountrySnapshot): Boolean =
        s.bandBasis == "official_index" && s.official?.averaging == "24h" && s.pm25Kind != "official_1h"

    const val HEDGE_24H = "Based on the 24-hr index: "
    private fun hedge(h: String) = HEDGE_24H + h.first().lowercase() + h.drop(1)

    const val NO_OFFICIAL_HEADLINE = "No official reading near here."
    const val NO_SCALE_HEADLINE = "There's no official air-quality scale here."
    fun whoLine(x: Double): String = "${fmt1(x)}× the WHO daily guideline."
    fun crowdProvenance(n: Int) = "Estimate from $n community sensor${if (n == 1) "" else "s"} · not a government reading"

    /** JS number formatting for a 1-dp value: 3.0 → "3", 3.1 → "3.1". */
    fun fmt1(x: Double): String = if (x % 1.0 == 0.0) x.toLong().toString() else x.toString()

    /** WHO 2021 guidance bands (COPY.md §20.1): < 25, 25–50, 50–100, ≥ 100 µg/m³. */
    val WHO_VERDICT_BANDS = listOf(
        WhoBand(25.0, "low", "low", "Likely fine to be out.", "Likely fine", 0, 0),
        WhoBand(50.0, "moderate", "moderate", "Likely OK. Sensitive people, go easy.", "Likely OK", 1, 1),
        WhoBand(100.0, "high", "high", "Go easy outdoors for now.", "Go easy outdoors", 2, 2),
        WhoBand(Double.POSITIVE_INFINITY, "very_high", "very high", "Limit time outside for now.", "Limit time outside", 3, 3),
    )

    fun whoVerdictBand(pm25: Number): WhoBand = WHO_VERDICT_BANDS.first { pm25.toDouble() < it.max }

    const val ESTIMATE_PREFIX = "Estimate: "
    const val ESTIMATE_PREFIX_SHORT = "Est. "
    const val ESTIMATE_PREFIX_TH = "ค่าประมาณ: "
    private fun lcFirst(x: String) = if (Regex("^[A-Z][a-z]").containsMatchIn(x)) x.first().lowercase() + x.drop(1) else x

    const val NO_READING_HEADLINE = "Can't say for here right now."
    const val NO_READING_SHORT = "No reading nearby"

    /** Headline for any CountrySnapshot and profile. */
    fun countryVerdict(s: CountrySnapshot, profiles: Set<Profile> = setOf(Profile.GENERAL)): CountryVerdict {
        val v = baseVerdict(s, normalise(profiles))
        if (!s.bandFromEstimate) return v
        return v.copy(
            headline = ESTIMATE_PREFIX + lcFirst(v.headline),
            short = ESTIMATE_PREFIX_SHORT + lcFirst(v.short),
            headlineLocal = v.headlineLocal?.let { ESTIMATE_PREFIX_TH + it },
            estimate = true,
        )
    }

    private fun aboveDayLine(s: CountrySnapshot) =
        if (s.pm25Kind == "crowd_estimate") "Nearby sensors read higher than the 24-hour average. Check again in an hour."
        else "The last hour is higher than the 24-hour average. Check again in an hour."

    private fun baseVerdict(s: CountrySnapshot, ids: List<Profile>): CountryVerdict {
        val hedged = hedgedOn24h(s)
        val sensitive = ids.any { it.sensitive }
        if (s.country == TH) {
            thaiVerdict(s, ids)?.let { v ->
                return if (hedged) v.copy(headline = hedge(v.headline), hedged = true, needsReview = true) else v.copy(needsReview = true)
            }
        }
        val cat = s.localBand?.let { categoryVerdictCell(it.scaleId, it.key, ids) }
        if (cat != null && s.country != SG) {
            val second = when {
                s.stale -> staleLine(s)
                s.trend.delta >= 20 && s.pm25 != null -> "Rising quickly. Check again in an hour."
                s.bandBasis == "official_index" && hourAboveDay(s.pm25, s.pm25_24h) -> aboveDayLine(s)
                s.trend.delta <= -20 && s.pm25 != null && cat.cell.sev >= 1 -> "Getting better. Check again in an hour."
                else -> null
            }
            return CountryVerdict(if (hedged) hedge(cat.cell.en) else cat.cell.en, cat.cell.short, second, forWhom(ids), cat.profile, sensitive,
                hedged = hedged, needsReview = true)
        }
        val band = s.band
        if (band != null) {
            val v = Experience.verdict(band, ids.toSet())
            val elevatedPlus = band != Band.NORMAL
            var second: String? = when {
                s.stale -> staleLine(s)
                s.trend.delta >= 20 -> if (elevatedPlus) "Getting worse. Check again in an hour." else "Rising quickly. Check again in an hour."
                s.trend.delta <= -20 && elevatedPlus -> "Getting better. Check again in an hour."
                else -> null
            }
            if (s.country != SG && second == null && s.bandBasis == "official_index" && hourAboveDay(s.pm25, s.pm25_24h)) second = aboveDayLine(s)
            return CountryVerdict(v.long, v.short, second, forWhom(ids), v.profile, sensitive)
        }
        val hasScale = Scales.CHIP_SCALE[s.country] != null
        if (!hasScale && s.pm25 != null) {
            val w = whoVerdictBand(s.pm25)
            return CountryVerdict(w.en, w.short, if (s.stale) staleLine(s) else whoLine(s.whoMultiple!!), forWhom(ids), ids[0], sensitive, whoBased = true)
        }
        // No number and nothing official to band: say so calmly (the caveats go under the number, never here).
        return CountryVerdict(NO_READING_HEADLINE, NO_READING_SHORT, s.whoMultiple?.let(::whoLine), forWhom(ids), ids[0], sensitive)
    }
}
