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

data class DefaultPlace(val name: String, val lat: Double, val lon: Double)

data class CountryInfo(
    val code: CountryCode,
    val name: String,
    val utcOffset: Double,
    val status: String,
    val defaultPlace: DefaultPlace,
) {
    val chipScale: String? get() = Scales.CHIP_SCALE[code]
}

/** Per-country registry (port of countries/registry.ts; docs/sea/COVERAGE.md). */
object Registry {
    private fun c(code: CountryCode, name: String, off: Double, status: String, p: String, lat: Double, lon: Double) =
        code to CountryInfo(code, name, off, status, DefaultPlace(p, lat, lon))

    val COUNTRIES: Map<CountryCode, CountryInfo> = mapOf(
        c(SG, "Singapore", 8.0, Coverage.LIVE_DIRECT, "Singapore", 1.35735, 103.82),
        c(TH, "Thailand", 7.0, Coverage.LIVE_DIRECT, "Bangkok", 13.7563, 100.5018),
        c(MY, "Malaysia", 8.0, Coverage.NEEDS_PROXY, "Kuala Lumpur", 3.139, 101.6869),
        c(ID, "Indonesia", 7.0, Coverage.NEEDS_PROXY, "Jakarta", -6.2088, 106.8456),
        c(VN, "Vietnam", 7.0, Coverage.NEEDS_PROXY, "Hanoi", 21.0285, 105.8542),
        c(PH, "Philippines", 8.0, Coverage.NEEDS_PROXY, "Metro Manila", 14.5995, 120.9842),
        c(LA, "Laos", 7.0, Coverage.NEEDS_PROXY, "Vientiane", 17.9757, 102.6331),
        c(KH, "Cambodia", 7.0, Coverage.NEEDS_PROXY, "Siem Reap", 13.3671, 103.8448),
        c(MM, "Myanmar", 6.5, Coverage.NOT_FEASIBLE, "Yangon", 16.8409, 96.1735),
        c(BN, "Brunei", 8.0, Coverage.NOT_FEASIBLE, "Bandar Seri Begawan", 4.9031, 114.9398),
        c(TL, "Timor-Leste", 9.0, Coverage.NOT_FEASIBLE, "Dili", -8.5569, 125.5603),
    )

    fun of(cc: CountryCode): CountryInfo = COUNTRIES.getValue(cc)

    fun parse(x: String?): CountryCode? = x?.trim()?.uppercase()?.let { s -> CountryCode.entries.firstOrNull { it.name == s } }
}
