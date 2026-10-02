package sg.hazenow.core.sea

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

/** "high" | "medium" | "low" */
data class CountryGuess(
    val country: CountryCode?,
    val confidence: String,
    val reason: String,
    val place: String?,
    val placeFromZone: Boolean,
) {
    val sure: Boolean get() = confidence == "high"
}

/**
 * SPEC v2.1 country guess from device signals only (time zone + preferred languages), no network, no prompt.
 * Port of countries/guess.ts. On Android: `TimeZone.getDefault().id` and `LocaleList.getDefault()` tags.
 * `serverCountry` may carry the SIM's `networkCountryIso` (on-device); the web's /api/where is never called.
 */
object Guess {
    private data class Zone(val cc: CountryCode, val place: String? = null, val shared: List<CountryCode>? = null)

    private val SEA_TIME_ZONES: Map<String, Zone> = mapOf(
        "Asia/Singapore" to Zone(SG),
        "Singapore" to Zone(SG),
        "Asia/Bangkok" to Zone(TH, shared = listOf(VN, LA, KH)),
        "Asia/Kuala_Lumpur" to Zone(MY),
        "Asia/Kuching" to Zone(MY, "kuching"),
        "Asia/Jakarta" to Zone(ID),
        "Asia/Pontianak" to Zone(ID, "pontianak"),
        "Asia/Makassar" to Zone(ID, "denpasar"),
        "Asia/Ujung_Pandang" to Zone(ID, "denpasar"),
        "Asia/Jayapura" to Zone(ID),
        "Asia/Ho_Chi_Minh" to Zone(VN),
        "Asia/Saigon" to Zone(VN),
        "Asia/Manila" to Zone(PH),
        "Asia/Vientiane" to Zone(LA),
        "Asia/Phnom_Penh" to Zone(KH),
        "Asia/Yangon" to Zone(MM),
        "Asia/Rangoon" to Zone(MM),
        "Asia/Brunei" to Zone(BN),
        "Asia/Dili" to Zone(TL),
    )

    val GUESS_DEFAULT_PLACE: Map<CountryCode, String> = mapOf(
        SG to "singapore", TH to "bangkok", MY to "kuala-lumpur", ID to "jakarta", VN to "hanoi", PH to "metro-manila",
        LA to "vientiane", KH to "siem-reap", MM to "yangon", BN to "bandar-seri-begawan", TL to "dili",
    )

    private val SEA_LANGUAGES: Map<String, CountryCode> = mapOf(
        "th" to TH, "vi" to VN, "id" to ID, "in" to ID, "ms" to MY, "fil" to PH, "tl" to PH, "lo" to LA, "km" to KH, "my" to MM, "tet" to TL,
    )

    private val NAMES: Map<CountryCode, String> = mapOf(
        SG to "Singapore", TH to "Thailand", MY to "Malaysia", ID to "Indonesia", VN to "Vietnam", PH to "the Philippines",
        LA to "Laos", KH to "Cambodia", MM to "Myanmar", BN to "Brunei", TL to "Timor-Leste",
    )

    private fun sea(x: String): CountryCode? = CountryCode.entries.firstOrNull { it.name == x }

    /** The country a language tag points at: a SEA region subtag first ("en-SG"), else the language ("th"). */
    fun languageCountry(tag: String): CountryCode? {
        val parts = tag.trim().replace('_', '-').split("-")
        val lang = parts.firstOrNull().orEmpty().lowercase()
        val region = parts.drop(1).firstOrNull { Regex("^[A-Za-z]{2}$").matches(it) }?.uppercase()
        if (region != null) sea(region)?.let { return it }
        return SEA_LANGUAGES[lang]
    }

    private fun firstLanguage(languages: List<String>?): Pair<CountryCode, String>? {
        for (tag in languages.orEmpty()) languageCountry(tag)?.let { return it to tag }
        return null
    }

    private val OTHER_ZONE = Regex("^(Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)/[A-Za-z_\\-/+0-9]+$")

    private fun guess(country: CountryCode?, confidence: String, reason: String, zone: Zone? = null): CountryGuess {
        val fromZone = country != null && zone?.place != null && zone.cc == country
        return CountryGuess(country, confidence, reason, country?.let { if (fromZone) zone!!.place else GUESS_DEFAULT_PLACE[it] }, fromZone)
    }

    fun guessCountry(timeZone: String?, languages: List<String>?, serverCountry: String? = null): CountryGuess {
        val tz = timeZone.orEmpty().trim()
        val zone = SEA_TIME_ZONES[tz]
        val lang = firstLanguage(languages)
        val rawServer = serverCountry.orEmpty().trim().uppercase()
        val server = rawServer.takeIf { Regex("^[A-Z]{2}$").matches(it) && it != "XX" && it != "T1" }
        val seaServer = server?.let(::sea)

        if (zone?.shared != null) {
            val candidates = listOf(zone.cc) + zone.shared
            val list = "Thailand, Vietnam, Laos and Cambodia"
            if (seaServer != null && seaServer in candidates) {
                return guess(seaServer, "high", "$tz is used in $list; the connection is in ${NAMES[seaServer]}.", zone)
            }
            if (lang != null && lang.first in candidates) {
                return if (lang.first == zone.cc) guess(zone.cc, "high", "$tz with ${lang.second} points at ${NAMES[zone.cc]}.", zone)
                else guess(lang.first, "medium", "$tz is used in $list; the language ${lang.second} points at ${NAMES[lang.first]}.", zone)
            }
            return guess(zone.cc, "low", "$tz is also used in Vietnam, Laos and Cambodia, and no language settles it.", zone)
        }

        if (zone != null) {
            val cc = zone.cc
            if (lang == null || lang.first == cc) {
                return guess(cc, "high", "Time zone $tz is ${NAMES[cc]}${if (lang != null) ", and ${lang.second} agrees" else ""}.", zone)
            }
            if (seaServer == cc) return guess(cc, "high", "Time zone $tz and the connection agree on ${NAMES[cc]}.", zone)
            if (seaServer == lang.first) return guess(lang.first, "high", "The language ${lang.second} and the connection agree on ${NAMES[lang.first]}.", zone)
            return guess(cc, "medium", "Time zone $tz says ${NAMES[cc]}, but the language ${lang.second} says ${NAMES[lang.first]}.", zone)
        }

        if (tz.isNotEmpty() && OTHER_ZONE.matches(tz)) {
            if (seaServer != null) return guess(seaServer, "medium", "Time zone $tz is outside Southeast Asia, but the connection is in ${NAMES[seaServer]}.")
            if (server != null) return guess(null, "high", "Time zone $tz and the connection ($server) are outside Southeast Asia.")
            return guess(null, "medium", "Time zone $tz is outside Southeast Asia.")
        }

        if (seaServer != null) return guess(seaServer, "medium", "No usable time zone; the connection is in ${NAMES[seaServer]}.")
        if (server != null) return guess(null, "high", "No usable time zone; the connection ($server) is outside Southeast Asia.")
        if (lang != null) return guess(lang.first, "low", "No usable time zone; only the language ${lang.second} points at ${NAMES[lang.first]}.")
        return guess(null, "low", "No usable time zone or language.")
    }
}
