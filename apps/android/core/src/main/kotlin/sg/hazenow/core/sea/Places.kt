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
import java.text.Normalizer
import kotlin.math.cos

/** A place in the picker (port of countries/places.ts). */
data class CityPlace(
    val country: CountryCode,
    /** URL slug: ?country=th&area=bangkok */
    val id: String,
    val name: String,
    val lat: Double,
    val lon: Double,
    val status: String,
    /** Why it isn't available yet (needs_permission / not_feasible). */
    val reason: String? = null,
    val popular: Boolean = false,
    val aliases: List<String> = emptyList(),
    val region: String? = null,
    val crowdOnly: Boolean = false,
    val fix: String? = null,
    val note: String? = null,
) {
    val covered: Boolean get() = status == Coverage.LIVE_DIRECT || status == Coverage.NEEDS_PROXY
}

data class PlaceMatch(val place: CityPlace, val matched: String?)

data class StartPlace(
    val place: CityPlace,
    /** The guessed country isn't covered yet: `place` is the nearest covered city instead. */
    val notCoveredFrom: CountryCode?,
    /** No SEA country guessed: `place` is Singapore. */
    val outside: Boolean,
    val fromZone: Boolean,
)

/**
 * Place catalogue for the country picker (docs/sea/COVERAGE.md): the major cities, then popular destinations.
 * The tables below are a mechanical transcription of places.ts (same order, names, coordinates and wording).
 */
object SeaPlaces {
    fun slugOf(name: String): String =
        Normalizer.normalize(name.lowercase(), Normalizer.Form.NFD).replace(Regex("[\\u0300-\\u036f]"), "")
            .replace(Regex("[^a-z0-9]+"), "-").trim('-')

    private class X(
        val popular: Boolean = false,
        val aliases: List<String> = emptyList(),
        val region: String? = null,
        val crowdOnly: Boolean = false,
        val fix: String? = null,
        val note: String? = null,
        val reason: String? = null,
        val far: Pair<String, String>? = null,
    )

    private fun P(cc: CountryCode, name: String, lat: Double, lon: Double, status: String, reason: String? = null, x: X = X()) =
        CityPlace(cc, slugOf(name), name, lat, lon, status, reason ?: x.far?.first, x.popular, x.aliases, x.region, x.crowdOnly, x.fix ?: x.far?.second, x.note)

    /** Popular destination (always in the "Popular" subgroup). */
    private fun D(cc: CountryCode, name: String, lat: Double, lon: Double, status: String, x: X = X()) =
        P(cc, name, lat, lon, status, x.reason, X(true, x.aliases, x.region, x.crowdOnly, x.fix, x.note, null, x.far))

    private fun far(reason: String, fix: String) = reason to fix

    private const val PH_EMB =
        "The Philippines' air-quality site (DENR-EMB) blocks automated access, and there are no community sensors here yet. We've asked EMB for a data feed."
    private const val VN_CEM =
        "Vietnam's national monitoring site (CEM) is behind a CAPTCHA, so we can't read it yet. We're asking CEM for a data agreement."
    private const val KH_NONE = "Cambodia doesn't publish live air-quality readings yet, and there are no community sensors here."
    private fun VN_NONE(place: String) =
        "Vietnam's national monitoring site (CEM) is behind a CAPTCHA, and there are no community sensors in $place yet."
    private fun PH_NONE(place: String) =
        "The Philippines' air-quality site (DENR-EMB) blocks automated access, and there are no community sensors in $place yet."
    private fun TH_FAR(km: Int, station: String) =
        "Thailand's nearest PCD station is $station, $km km away. That's too far to stand for the air here."

    val CITIES: List<CityPlace> = listOf(
  P(SG, "Singapore", 1.35735, 103.82, "live_direct"),

  P(TH, "Bangkok", 13.7563, 100.5018, "live_direct", null, X( popular = true, aliases = listOf("BKK", "Krung Thep") )),
  P(TH, "Chiang Mai", 18.7883, 98.9853, "live_direct", null, X( popular = true )),
  P(TH, "Chiang Rai", 19.9105, 99.8406, "live_direct", null, X( popular = true )),
  P(TH, "Phuket", 7.8804, 98.3923, "live_direct", null, X( popular = true, aliases = listOf("Phuket Town"), region = "Phuket" )),
  P(TH, "Hat Yai", 7.0086, 100.4747, "live_direct"),
  P(TH, "Khon Kaen", 16.4322, 102.8236, "live_direct"),
  P(TH, "Pattaya", 12.9236, 100.8825, "live_direct", null, X( popular = true, aliases = listOf("Jomtien") )),
  P(TH, "Nakhon Ratchasima", 14.9799, 102.0978, "live_direct"),
  P(TH, "Udon Thani", 17.4138, 102.787, "live_direct"),

  P(MY, "Kuala Lumpur", 3.139, 101.6869, "needs_proxy", null, X( popular = true, aliases = listOf("KL", "Klang Valley") )),
  P(MY, "Johor Bahru", 1.4927, 103.7414, "needs_proxy", null, X( popular = true, aliases = listOf("JB", "Johor") )),
  P(MY, "Penang", 5.4141, 100.3288, "needs_proxy", null, X( popular = true, aliases = listOf("George Town", "Georgetown", "Pulau Pinang"), region = "Penang" )),
  P(MY, "Ipoh", 4.5975, 101.0901, "needs_proxy", null, X( popular = true )),
  P(MY, "Malacca", 2.1896, 102.2501, "needs_proxy", null, X( popular = true, aliases = listOf("Melaka") )),
  P(MY, "Kuching", 1.5535, 110.3593, "needs_proxy", null, X( popular = true, region = "Sarawak" )),
  P(MY, "Kota Kinabalu", 5.9804, 116.0735, "needs_proxy", null, X( popular = true, aliases = listOf("KK"), region = "Sabah" )),

  P(ID, "Jakarta", -6.2088, 106.8456, "needs_proxy"),
  P(ID, "Surabaya", -7.2575, 112.7521, "needs_proxy", null, X(
    note = "Community sensors run by ITS (Institut Teknologi Sepuluh Nopember) and others exist in Surabaya, but they're only published through IQAir, which we can't show. We're asking ITS directly.",
  )),
  P(ID, "Bandung", -6.9175, 107.6191, "needs_proxy", null, X(
    popular = true,
    note = "Community sensors exist in Bandung, including one at ITB's campus, but they're only published through IQAir, which we can't show. We're asking ITB directly.",
  )),
  P(ID, "Medan", 3.5952, 98.6722, "needs_proxy"),
  P(ID, "Palembang", -2.9761, 104.7754, "needs_proxy"),
  P(ID, "Jambi", -1.6101, 103.6131, "needs_proxy"),
  P(ID, "Pekanbaru", 0.5071, 101.4478, "needs_proxy"),
  P(ID, "Pontianak", -0.0263, 109.3425, "needs_proxy"),
  P(ID, "Palangka Raya", -2.2161, 113.9135, "needs_proxy"),
  // BMKG hourly station "Pangkalanbun" (pm25_pkn2), in the existing BMKG feed since 29 Sep 2026 (coverage-hunt/id.md).
  P(ID, "Pangkalan Bun", -2.6848, 111.6219, "needs_proxy", null, X( aliases = listOf("Pangkalanbun", "Kotawaringin Barat"), region = "Central Kalimantan" )),
  P(ID, "Balikpapan", -1.2379, 116.8529, "needs_proxy", null, X(
    note = "Two community sensors run by Nafas are within 8 km of Balikpapan. We'll show them once Nafas confirms we may, until then it's ISPU's 24-hr index only.",
  )),
  P(ID, "Samarinda", -0.5022, 117.1536, "needs_proxy"),
  P(ID, "Makassar", -5.1477, 119.4327, "needs_proxy"),
  // Bali's only official monitor (ISPU Badung Sempidi) is offline since 29 Sep 2026 10:00 WITA (coverage-hunt/id.md), so
  // Bali shows community sensors only until it's back (the builder drops a station silent for > 24 h on its own).
  P(ID, "Denpasar", -8.6705, 115.2126, "needs_proxy", null, X( popular = true, crowdOnly = true, aliases = listOf("Bali"), region = "Bali" )),
  P(ID, "Batam", 1.0456, 104.0305, "needs_proxy", null, X( popular = true, aliases = listOf("Nongsa", "Batam Centre"), region = "Riau Islands" )),

  P(VN, "Hanoi", 21.0285, 105.8542, "needs_proxy", null, X( popular = true, aliases = listOf("Ha Noi") )),
  P(VN, "Ho Chi Minh City", 10.8231, 106.6297, "needs_permission", VN_CEM, X(
    popular = true, aliases = listOf("Saigon", "HCMC", "Ho Chi Minh"), fix = "One more community sensor within 10 km (there's one 6 km out), or a CEM data agreement.",
  )),
  P(VN, "Da Nang", 16.0544, 108.2022, "needs_permission", VN_CEM, X( popular = true, aliases = listOf("Danang"), fix = "Two community sensors in Da Nang, or a CEM data agreement." )),

  P(PH, "Metro Manila", 14.6354, 121.0779, "needs_proxy", null, X( crowdOnly = true, aliases = listOf("Manila", "NCR") )),
  P(PH, "Cebu", 10.3157, 123.8854, "needs_permission", PH_EMB, X( popular = true, aliases = listOf("Cebu City", "Mactan"), fix = "Two community sensors in Cebu City, or an EMB data feed." )),
  P(PH, "Davao", 7.1907, 125.4553, "needs_permission", PH_EMB, X( popular = true, aliases = listOf("Davao City"), fix = "Two community sensors in Davao City, or an EMB data feed." )),

  P(LA, "Vientiane", 17.9757, 102.6331, "needs_proxy", null, X( crowdOnly = true )),
  P(LA, "Luang Prabang", 19.8856, 102.1347, "needs_proxy", null, X( popular = true, crowdOnly = true, aliases = listOf("Luang Phrabang") )),

  P(KH, "Phnom Penh", 11.5564, 104.9282, "not_feasible",
    "Cambodia doesn't publish live air-quality readings yet, and the two community sensors near Phnom Penh are 14 km from the centre, too far out to estimate the city.",
    X( fix = "One community sensor within 10 km of the centre (two sit 14 km south, near ITC)." )),
  // Two networks agree here: AirGradient "Mondul 2" 1.6 km and Sensor.Community 2.7 km (coverage-hunt/vn-kh-la.md).
  P(KH, "Siem Reap", 13.3671, 103.8448, "needs_proxy", null, X( popular = true, crowdOnly = true, aliases = listOf("Angkor", "Angkor Wat") )),
  P(MM, "Yangon", 16.8409, 96.1735, "not_feasible",
    "Myanmar has no public air-quality feed, and the only community sensor nearby reads zero, which looks faulty."),
  P(MM, "Mandalay", 21.9588, 96.0891, "not_feasible", "Myanmar has no public air-quality feed, and there are no community sensors here."),
  P(BN, "Bandar Seri Begawan", 4.9031, 114.9398, "not_feasible",
    "Brunei's JASTRe publishes its PSI only as an image, which we can't read reliably. We've asked for a machine-readable feed."),
  P(TL, "Dili", -8.5569, 125.5603, "not_feasible", "There are no public air-quality monitors or community sensors in Dili yet."),)
    val DESTINATIONS: List<CityPlace> = listOf(
  // Indonesia · Bali (AirGradient community sensors + KLH ISPU Badung Sempidi; no BMKG 1-hr station on Bali).
  // `crowdOnly` while Sempidi is offline (see Denpasar); drop it again when Sempidi reports.
  D(ID, "Canggu", -8.6478, 115.1385, "needs_proxy", X( region = "Bali", crowdOnly = true, aliases = listOf("Bali", "Pererenan", "Berawa", "Echo Beach") )),
  D(ID, "Seminyak", -8.6913, 115.1683, "needs_proxy", X( region = "Bali", crowdOnly = true, aliases = listOf("Bali", "Kerobokan", "Umalas", "Petitenget") )),
  D(ID, "Kuta", -8.718, 115.1686, "needs_proxy", X( region = "Bali", crowdOnly = true, aliases = listOf("Bali", "Legian", "Tuban") )),
  D(ID, "Sanur", -8.6878, 115.262, "needs_proxy", X( region = "Bali", crowdOnly = true, aliases = listOf("Bali") )),
  D(ID, "Ubud", -8.5069, 115.2625, "needs_proxy", X( region = "Bali", crowdOnly = true, aliases = listOf("Bali") )),
  D(ID, "Jimbaran", -8.7907, 115.16, "needs_proxy", X( region = "Bali", crowdOnly = true, aliases = listOf("Bali") )),
  // Offline since 29 Sep 2026 10:00 WITA (coverage-hunt/id.md). The builder also drops any station silent > 24 h.
  D(ID, "Nusa Dua", -8.8008, 115.2317, "not_feasible", X(
    region = "Bali", aliases = listOf("Bali", "Tanjung Benoa"),
    far = far("Nusa Dua's only official monitor, ISPU Badung (Sempidi), has been offline since 29 Sep, and the nearest community sensor is 10.4 km away, just past the 10 km we trust.",
      "Sempidi coming back online, or one community sensor in Nusa Dua."),
  )),
  D(ID, "Uluwatu", -8.8291, 115.0849, "needs_proxy", X( region = "Bali", crowdOnly = true, aliases = listOf("Bali", "Bingin", "Padang Padang", "Pecatu") )),
  D(ID, "Bintan", 1.183, 104.348, "not_feasible", X(
    region = "Riau Islands", aliases = listOf("Lagoi", "Bintan Resorts"),
    far = far("The nearest official monitor is BMKG's in Batam, 26 km away across the water, and there are no community sensors on Bintan yet.",
      "Two community sensors at Lagoi would cover the resorts."),
  )),
  D(ID, "Tanjung Pinang", 0.9186, 104.4665, "not_feasible", X(
    region = "Riau Islands", aliases = listOf("Tanjungpinang", "Bintan"),
    far = far("The nearest official monitor is BMKG's in Batam, 44 km away, and there are no community sensors here yet.", "Two community sensors in Tanjung Pinang."),
  )),
  D(ID, "Yogyakarta", -7.7956, 110.3695, "needs_proxy", X( aliases = listOf("Jogja", "Jogjakarta", "Yogya", "Borobudur") )),
  D(ID, "Mataram", -8.5833, 116.1167, "not_feasible", X(
    region = "Lombok", aliases = listOf("Lombok"),
    far = far("Lombok has no official monitor, and there are no community sensors on the island yet. The nearest are in Bali, over 90 km away.",
      "Two community sensors in Mataram."),
  )),
  D(ID, "Senggigi", -8.491, 116.042, "not_feasible", X(
    region = "Lombok", aliases = listOf("Lombok"),
    far = far("Lombok has no official monitor, and there are no community sensors on the island yet.", "Two community sensors in Senggigi."),
  )),
  D(ID, "Gili Trawangan", -8.35, 116.038, "not_feasible", X(
    region = "Lombok", aliases = listOf("Gili", "Gili T", "Gili Islands", "Gili Air", "Gili Meno", "Lombok"),
    far = far("There's no official monitor or community sensor on the Gili Islands or Lombok yet.", "Two community sensors on Gili Trawangan."),
  )),
  D(ID, "Kuta (Lombok)", -8.895, 116.277, "not_feasible", X(
    region = "Lombok", aliases = listOf("Kuta Lombok", "Mandalika", "Lombok"),
    far = far("Lombok has no official monitor, and there are no community sensors on the island yet.", "Two community sensors in Kuta or Mandalika."),
  )),
  D(ID, "Labuan Bajo", -8.4964, 119.8877, "needs_proxy", X(
    aliases = listOf("Komodo", "Flores"), fix = "One community sensor in town would add an hourly number (today it gets ISPU's 24-hr index only).",
  )),

  // Malaysia (DOE APIMS: 24-hr based API, no 1-hr PM2.5)
  D(MY, "Batu Ferringhi", 5.471, 100.246, "needs_proxy", X( region = "Penang", aliases = listOf("Penang") )),
  D(MY, "Langkawi", 6.35, 99.8, "needs_proxy", X( aliases = listOf("Pantai Cenang", "Kuah") )),
  D(MY, "Cameron Highlands", 4.47, 101.377, "needs_permission", X(
    aliases = listOf("Cameron", "Tanah Rata", "Brinchang"),
    far = far("Malaysia's weather service (MET Malaysia) measures PM2.5 every hour in Cameron Highlands, but only publishes it as a week-old chart. We need MET Malaysia's permission for a live feed. DOE's nearest station is in Ipoh, 34 km away and 1,400 m lower.",
      "A live feed from MET Malaysia's Cameron Highlands monitor (or two community sensors in Tanah Rata)."),
  )),
  D(MY, "Genting Highlands", 3.4236, 101.7932, "not_feasible", X(
    aliases = listOf("Genting", "Resorts World Genting"),
    far = far("The nearest DOE station and community sensors are in Kuala Lumpur, about 27 km away and far below the hilltop.", "Two community sensors at Genting."),
  )),
  D(MY, "Desaru", 1.56, 104.26, "needs_proxy", X( aliases = listOf("Desaru Coast", "Bandar Penawar", "Kota Tinggi") )),
  D(MY, "Tioman", 2.82, 104.16, "not_feasible", X(
    aliases = listOf("Pulau Tioman", "Tekek"),
    far = far("The nearest DOE station is at Rompin on the mainland, 83 km away, and there are no community sensors on the island.", "Two community sensors at Tekek or ABC."),
  )),
  D(MY, "Port Dickson", 2.5225, 101.7963, "needs_proxy", X( aliases = listOf("PD") )),

  // Thailand (PCD Air4Thai, direct; community sensors through the proxy, only where no PCD station is within 25 km)
  D(TH, "Patong", 7.8961, 98.2966, "live_direct", X( region = "Phuket", aliases = listOf("Phuket", "Kata", "Karon") )),
  D(TH, "Krabi", 8.0863, 98.9063, "live_direct", X( aliases = listOf("Krabi Town") )),
  D(TH, "Ao Nang", 8.0321, 98.8229, "live_direct", X( region = "Krabi", aliases = listOf("Krabi", "Railay") )),
  D(TH, "Koh Phi Phi", 7.7407, 98.7784, "not_feasible", X(
    region = "Krabi", aliases = listOf("Ko Phi Phi", "Phi Phi"), far = far(TH_FAR(38, "in Krabi town"), "A PCD station on Phi Phi Don (or two community sensors within 10 km)."),
  )),
  D(TH, "Koh Lanta", 7.625, 99.079, "not_feasible", X(
    region = "Krabi", aliases = listOf("Ko Lanta", "Lanta"), far = far(TH_FAR(51, "in Krabi town"), "A PCD station on Koh Lanta (or two community sensors within 10 km)."),
  )),
  D(TH, "Koh Samui", 9.53, 100.06, "not_feasible", X(
    aliases = listOf("Ko Samui", "Samui", "Chaweng", "Lamai"), far = far(TH_FAR(92, "in Surat Thani"), "A PCD station on Samui (or two community sensors within 10 km)."),
  )),
  D(TH, "Koh Phangan", 9.738, 100.013, "not_feasible", X(
    aliases = listOf("Ko Phangan", "Ko Pha-ngan", "Phangan"), far = far(TH_FAR(102, "in Surat Thani"), "A PCD station on Koh Phangan (or two community sensors within 10 km)."),
  )),
  D(TH, "Koh Tao", 10.0956, 99.8404, "not_feasible", X(
    aliases = listOf("Ko Tao"), far = far(TH_FAR(84, "in Chumphon"), "A PCD station on Koh Tao (or two community sensors within 10 km)."),
  )),
  D(TH, "Hua Hin", 12.5684, 99.9577, "live_direct"),
  // ~20 AirGradient sensors within 10 km, no PCD station within 25 km (coverage-hunt/th.md).
  D(TH, "Pai", 19.3587, 98.44, "needs_proxy", X(
    crowdOnly = true,
    note = "Pai's nearest PCD station is in Mae Hong Son, 50 km away over the mountains, so these sensors can't be checked against an official reading.",
  )),
  D(TH, "Ayutthaya", 14.3532, 100.5689, "live_direct"),
  D(TH, "Kanchanaburi", 14.0228, 99.5328, "live_direct"),
  D(TH, "Koh Chang", 12.05, 102.33, "not_feasible", X(
    aliases = listOf("Ko Chang"), far = far(TH_FAR(29, "in Trat"), "A PCD station on Koh Chang (or two community sensors within 10 km)."),
  )),

  // Vietnam (CEM CAPTCHA-walled; AirGradient only)
  D(VN, "Hoi An", 15.8801, 108.338, "not_feasible", X( aliases = listOf("Hội An"), far = far(VN_NONE("Hoi An"), "Two community sensors in Hoi An (or a CEM data agreement).") )),
  D(VN, "Hue", 16.4637, 107.5909, "not_feasible", X( aliases = listOf("Huế"), far = far(VN_NONE("Hue"), "Two community sensors in Hue (or a CEM data agreement).") )),
  D(VN, "Nha Trang", 12.2388, 109.1967, "not_feasible", X( far = far(VN_NONE("Nha Trang"), "Two community sensors in Nha Trang (or a CEM data agreement).") )),
  D(VN, "Da Lat", 11.9404, 108.4583, "not_feasible", X( aliases = listOf("Dalat"), far = far(VN_NONE("Da Lat"), "Two community sensors in Da Lat (or a CEM data agreement).") )),
  D(VN, "Ha Long", 20.9517, 107.08, "not_feasible", X(
    aliases = listOf("Halong", "Ha Long Bay", "Halong Bay"), far = far(VN_NONE("Ha Long"), "Two community sensors in Ha Long (or a CEM data agreement)."),
  )),
  D(VN, "Sapa", 22.3364, 103.8438, "not_feasible", X( aliases = listOf("Sa Pa"), far = far(VN_NONE("Sapa"), "Two community sensors in Sapa (or a CEM data agreement).") )),
  D(VN, "Phu Quoc", 10.217, 103.96, "not_feasible", X( aliases = listOf("Duong Dong"), far = far(VN_NONE("Phu Quoc"), "Two community sensors on Phu Quoc (or a CEM data agreement).") )),

  // Philippines (EMB blocked; AirGradient only)
  D(PH, "Boracay", 11.9674, 121.9248, "not_feasible", X( aliases = listOf("Malay", "Aklan"), far = far(PH_NONE("Boracay"), "Two community sensors on Boracay.") )),
  D(PH, "El Nido", 11.1956, 119.4075, "not_feasible", X( region = "Palawan", aliases = listOf("Palawan"), far = far(PH_NONE("El Nido"), "Two community sensors in El Nido.") )),
  D(PH, "Coron", 12.0, 120.204, "not_feasible", X( region = "Palawan", aliases = listOf("Palawan", "Busuanga"), far = far(PH_NONE("Coron"), "Two community sensors in Coron.") )),
  D(PH, "Puerto Princesa", 9.7392, 118.7353, "not_feasible", X(
    region = "Palawan", aliases = listOf("Palawan"), far = far(PH_NONE("Puerto Princesa"), "Two community sensors in Puerto Princesa."),
  )),
  D(PH, "Siargao", 9.7836, 126.1569, "not_feasible", X( aliases = listOf("General Luna", "Cloud 9"), far = far(PH_NONE("Siargao"), "Two community sensors in General Luna.") )),
  D(PH, "Panglao", 9.58, 123.75, "not_feasible", X( region = "Bohol", aliases = listOf("Bohol", "Alona Beach"), far = far(PH_NONE("Bohol"), "Two community sensors on Panglao.") )),

  // Cambodia (no government feed; community sensors through the proxy) and Laos (AirGradient / UNICEF schools)
  D(KH, "Sihanoukville", 10.6093, 103.5296, "not_feasible", X( aliases = listOf("Kampong Som", "Koh Rong"), far = far(KH_NONE, "Two community sensors in Sihanoukville.") )),
  D(KH, "Kampot", 10.6104, 104.1815, "not_feasible", X( aliases = listOf("Kep"), far = far(KH_NONE, "Two community sensors in Kampot.") )),
  D(LA, "Vang Vieng", 18.9235, 102.4478, "not_feasible", X(
    far = far("The nearest community sensor is 11.5 km out of town, just past the 10 km we trust for an estimate, and Laos publishes no official readings.",
      "Two community sensors in Vang Vieng town."),
  )),)

    val PLACES: List<CityPlace> = CITIES + DESTINATIONS

    const val DESTINATION_RADIUS_KM = 25.0

    /** Countries in picker order. */
    val PICKER_COUNTRIES = listOf(SG, TH, MY, ID, VN, PH, LA, KH, MM, BN, TL)

    fun citiesOf(cc: CountryCode): List<CityPlace> = PLACES.filter { it.country == cc }

    /** The "Popular" subgroup (an island or area kept together) and the other cities. */
    fun placeGroups(cc: CountryCode): Pair<List<CityPlace>, List<CityPlace>> {
        val all = citiesOf(cc)
        val pop = all.filter { it.popular }
        fun key(c: CityPlace) = (c.region ?: c.name).lowercase()
        val order = pop.map(::key).distinct()
        return order.flatMap { k -> pop.filter { key(it) == k } } to all.filter { !it.popular }
    }

    fun searchKey(s: String): String = slugOf(s).replace('-', ' ').replace(Regex("\\bkoh\\b"), "ko").trim()

    /** Find a place by slug, name or alias, optionally within one country. Names win over aliases. */
    fun findCity(query: String, cc: CountryCode? = null): CityPlace? {
        val q = slugOf(query)
        if (q.isEmpty()) return null
        val pool = PLACES.filter { cc == null || it.country == cc }
        fun flat(x: String) = x.replace("-", "")
        return pool.firstOrNull { it.id == q || flat(it.id) == flat(q) }
            ?: pool.firstOrNull { c -> c.aliases.any { slugOf(it) == q || flat(slugOf(it)) == flat(q) } }
    }

    /** Picker search across every country (SG's own areas are searched separately). */
    fun searchPlaces(query: String, limit: Int = 12, cc: CountryCode? = null): List<PlaceMatch> {
        val q = searchKey(query)
        if (q.isEmpty()) return emptyList()
        data class S(val m: PlaceMatch, val score: Int, val i: Int)
        val scored = mutableListOf<S>()
        PLACES.forEachIndexed { i, c ->
            if (cc != null && c.country != cc) return@forEachIndexed
            if (c.country == SG) return@forEachIndexed
            val name = searchKey(c.name)
            val alts = c.aliases + listOfNotNull(c.region)
            val exact = alts.firstOrNull { searchKey(it) == q }
            val prefix = alts.firstOrNull { searchKey(it).startsWith(q) }
            val (score, matched) = when {
                name == q -> 0 to null
                exact != null -> 1 to exact
                name.startsWith(q) -> 2 to null
                prefix != null -> 3 to prefix
                q.length >= 3 && name.contains(q) -> 4 to null
                else -> -1 to null
            }
            if (score >= 0) scored += S(PlaceMatch(c, matched), score, i)
        }
        return scored.sortedWith(compareBy<S> { it.score }.thenBy { it.i }).take(limit).map { it.m }
    }

    /** Query for a picked place: its point, and for a destination the hard radius. */
    fun placeQuery(c: CityPlace): CountryQuery =
        if (c.popular) CountryQuery(c.lat, c.lon, withinKm = DESTINATION_RADIUS_KM) else CountryQuery(c.lat, c.lon)

    fun coverageLabel(c: CityPlace): String = when (c.status) {
        Coverage.LIVE_DIRECT -> "Live now (direct)"
        Coverage.NEEDS_PROXY -> if (c.crowdOnly) "Community sensors only" else "Needs proxy"
        else -> "Not available yet"
    }

    fun defaultCity(cc: CountryCode): CityPlace {
        val d = Registry.of(cc).defaultPlace
        return CITIES.firstOrNull { it.country == cc && it.name == d.name } ?: citiesOf(cc).first()
    }

    const val NOT_AVAILABLE_HEADLINE = "Not available yet"
    const val NOT_AVAILABLE_NEEDS_PERMISSION = "The data exists, but we need the publisher's permission (or a feed we can read) before we can show it."
    const val NOT_AVAILABLE_NOT_FEASIBLE = "There isn't a reliable public source here yet."

    fun nearestCoveredCity(lat: Double, lon: Double): CityPlace {
        fun d2(c: CityPlace): Double {
            val dx = (c.lon - lon) * cos(Math.toRadians(lat))
            return (c.lat - lat) * (c.lat - lat) + dx * dx
        }
        return CITIES.filter { it.covered }.reduce { best, c -> if (d2(c) < d2(best)) c else best }
    }

    /** SPEC v2.1 §3: turn a guess into a starting place. */
    fun startPlace(g: CountryGuess): StartPlace {
        val sg = defaultCity(SG)
        val cc = g.country ?: return StartPlace(sg, null, outside = true, fromZone = false)
        val suggested = g.place?.let { findCity(it, cc) }
        if (suggested != null && suggested.covered) return StartPlace(suggested, null, false, g.placeFromZone)
        val def = defaultCity(cc)
        if (def.covered) return StartPlace(def, null, false, false)
        return StartPlace(nearestCoveredCity(def.lat, def.lon), cc, false, false)
    }
}
