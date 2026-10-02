package sg.hazenow.data

import android.content.Context
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.doublePreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import sg.hazenow.core.AlertPrefs
import sg.hazenow.core.AlertState
import sg.hazenow.core.Alerts
import sg.hazenow.core.Areas
import sg.hazenow.core.HazeApi
import sg.hazenow.core.Place
import sg.hazenow.core.Profile
import sg.hazenow.core.Selection

/** On-device only. Nothing here is ever sent anywhere. */
val Context.settingsStore by preferencesDataStore(name = "settings")

/** Where the reading is for (SPEC v1.4). */
enum class PlaceMode { GPS, AREA, REGION, ISLAND, CITY }

object PlaceKeys {
    const val HOME = "home"
    const val WORK = "work"
    const val OTHER = "other"
    const val FOLLOW = "follow"
    const val NEAR = "near"
    val SAVED = listOf(HOME, WORK, OTHER)
    fun label(key: String) = when (key) { HOME -> "Home"; WORK -> "Work/School"; else -> "Other" }
}

data class Settings(
    val mode: PlaceMode = PlaceMode.REGION,
    val region: String = Selection.DEFAULT_REGION,
    /** Last coarse fix, rounded to 2 dp. */
    val lat: Double? = null,
    val lon: Double? = null,
    /** Picked area or active saved place (AREA mode). */
    val area: Place? = null,
    /** Saved places: home / work / other. */
    val places: Map<String, Place> = emptyMap(),
    /** Which saved place is active (AREA mode), if any. */
    val activePlace: String? = null,
    val firstRunDone: Boolean = false,
    val locationDenied: Boolean = false,
    val profiles: Set<Profile> = setOf(Profile.GENERAL),
    val profilesChosen: Boolean = false,
    val hazeWatch: Boolean = false,
    val bandAlerts: Boolean = true,
    /** null = COPY §11 default (off for general-only, on for sensitive / exercise). */
    val elevatedAlerts: Boolean? = null,
    val quietStart: Int = Alerts.QUIET_START_HOUR,
    val quietEnd: Int = Alerts.QUIET_END_HOUR,
    val alertState: AlertState = AlertState(),
    val notifAsked: Boolean = false,
    /** Debug-only QA scenario (see MockData). */
    val mock: String? = null,
    /** SPEC v2.0: a picked place outside Singapore (CITY mode): country code + catalogue slug. */
    val cityCountry: String? = null,
    val cityId: String? = null,
    /** Debug-only override of HAZENOW_EDGE (QA against a local services/proxy). */
    val edgeOverride: String? = null,
) {
    /** A GPS fix in another SEA country (Johor, Bangkok…): the reading follows that country (SPEC v2.0 §3). */
    val gpsCountry: sg.hazenow.core.sea.CountryCode?
        get() = if (mode == PlaceMode.GPS && lat != null && lon != null && !sg.hazenow.core.Experience.inSingapore(lat, lon))
            sg.hazenow.core.sea.Borders.countryAt(lat, lon)?.takeIf { it != sg.hazenow.core.sea.CountryCode.SG } else null

    /** Showing a place outside Singapore: SG surfaces (widgets, alerts) must not pretend it's Singapore's reading. */
    val outsideSingapore: Boolean get() = mode == PlaceMode.CITY || gpsCountry != null

    val alertPrefs: AlertPrefs get() = AlertPrefs(profiles, elevatedAlerts, quietStart, quietEnd, placeName = if (mode == PlaceMode.AREA) area?.name else null)

    val selection: Selection
        get() = when (mode) {
            PlaceMode.GPS -> if (lat != null && lon != null) Selection.Gps(lat, lon) else Selection.Island
            PlaceMode.AREA -> area?.selection ?: Selection.Island
            PlaceMode.REGION -> Selection.Region(region)
            PlaceMode.ISLAND, PlaceMode.CITY -> Selection.Island
        }

    /** Provenance prefix for a named place ("Tampines", "Home (Tampines)"); null = "Near you" / region. */
    val placeName: String? get() = if (mode == PlaceMode.AREA) area?.display else null

    /** A copy pinned to a widget's chosen place ([PlaceKeys]); unknown/unset keys follow the app. */
    fun pinnedTo(key: String?): Settings = when (key) {
        null, PlaceKeys.FOLLOW -> this
        PlaceKeys.NEAR -> if (lat != null) copy(mode = PlaceMode.GPS) else this
        else -> places[key]?.let { copy(mode = PlaceMode.AREA, area = it, activePlace = key) } ?: this
    }
}

object SettingsKeys {
    val MODE = stringPreferencesKey("place_mode")
    val REGION = stringPreferencesKey("region")
    val LAT = doublePreferencesKey("lat")
    val LON = doublePreferencesKey("lon")
    val AREA = stringPreferencesKey("area")
    val PLACES = stringPreferencesKey("places")
    val ACTIVE_PLACE = stringPreferencesKey("active_place")
    val FIRST_RUN_DONE = booleanPreferencesKey("first_run_done")
    val LOCATION_DENIED = booleanPreferencesKey("location_denied")
    val PROFILES = stringSetPreferencesKey("profiles")
    val PROFILES_CHOSEN = booleanPreferencesKey("profiles_chosen")
    val HAZE_WATCH = booleanPreferencesKey("haze_watch")
    val BAND_ALERTS = booleanPreferencesKey("band_alerts")
    val QUIET_START = intPreferencesKey("quiet_start")
    val QUIET_END = intPreferencesKey("quiet_end")
    val ELEVATED_ALERTS = booleanPreferencesKey("elevated_alerts")
    val ALERT_STATE = stringPreferencesKey("alert_state")
    val NOTIF_ASKED = booleanPreferencesKey("notif_asked")
    val MOCK = stringPreferencesKey("mock_scenario")
    val CITY_COUNTRY = stringPreferencesKey("city_country")
    val CITY_ID = stringPreferencesKey("city_id")
    val EDGE_OVERRIDE = stringPreferencesKey("edge_override")
    fun widgetPlace(appWidgetId: Int) = stringPreferencesKey("widget_place_$appWidgetId")
}

class SettingsRepo(private val context: Context) {
    val flow: Flow<Settings> = context.settingsStore.data.map { it.toSettings() }

    suspend fun current(): Settings = flow.first()

    suspend fun update(block: (MutablePreferences) -> Unit) {
        context.settingsStore.edit { block(it) }
    }

    private val placesSer = MapSerializer(String.serializer(), Place.serializer())

    suspend fun setRegion(name: String) = update {
        it[SettingsKeys.REGION] = name
        it[SettingsKeys.MODE] = PlaceMode.REGION.name
        it.remove(SettingsKeys.ACTIVE_PLACE)
        it[SettingsKeys.FIRST_RUN_DONE] = true
    }

    suspend fun setMode(mode: PlaceMode) = update {
        it[SettingsKeys.MODE] = mode.name
        if (mode != PlaceMode.AREA) it.remove(SettingsKeys.ACTIVE_PLACE)
        it[SettingsKeys.FIRST_RUN_DONE] = true
    }

    /** Stores a coarse fix rounded to 2 dp (~1 km). Never logged. */
    suspend fun setLocation(lat: Double, lon: Double, switchToGps: Boolean = true) = update {
        it[SettingsKeys.LAT] = Areas.round2(lat)
        it[SettingsKeys.LON] = Areas.round2(lon)
        it[SettingsKeys.LOCATION_DENIED] = false
        if (switchToGps) {
            it[SettingsKeys.MODE] = PlaceMode.GPS.name
            it.remove(SettingsKeys.ACTIVE_PLACE)
            it[SettingsKeys.FIRST_RUN_DONE] = true
        }
    }

    suspend fun setArea(place: Place, activeKey: String? = null) = update {
        it[SettingsKeys.AREA] = HazeApi.json.encodeToString(Place.serializer(), Place.of(place.label, place.name, place.lat, place.lon))
        it[SettingsKeys.MODE] = PlaceMode.AREA.name
        if (activeKey == null) it.remove(SettingsKeys.ACTIVE_PLACE) else it[SettingsKeys.ACTIVE_PLACE] = activeKey
        it[SettingsKeys.FIRST_RUN_DONE] = true
    }

    suspend fun savePlace(key: String, place: Place?) = update {
        val cur = it[SettingsKeys.PLACES]?.let { s -> runCatching { HazeApi.json.decodeFromString(placesSer, s) }.getOrNull() }.orEmpty()
        val next = if (place == null) cur - key else cur + (key to Place.of(place.label, place.name, place.lat, place.lon))
        it[SettingsKeys.PLACES] = HazeApi.json.encodeToString(placesSer, next)
    }

    /** SPEC v2.0: the user's own pick of a place outside Singapore (the "saved choice" of SPEC v2.1 §1). */
    suspend fun setCity(country: String, id: String) = update {
        it[SettingsKeys.CITY_COUNTRY] = country
        it[SettingsKeys.CITY_ID] = id
        it[SettingsKeys.MODE] = PlaceMode.CITY.name
        it.remove(SettingsKeys.ACTIVE_PLACE)
        it[SettingsKeys.FIRST_RUN_DONE] = true
    }

    suspend fun setEdgeOverride(url: String?) = update {
        if (url.isNullOrBlank()) it.remove(SettingsKeys.EDGE_OVERRIDE) else it[SettingsKeys.EDGE_OVERRIDE] = url.trim().trimEnd('/')
    }

    suspend fun setLocationDenied(denied: Boolean) = update { it[SettingsKeys.LOCATION_DENIED] = denied }
    suspend fun setFirstRunDone() = update { it[SettingsKeys.FIRST_RUN_DONE] = true }
    suspend fun resetFirstRun() = update {
        it.remove(SettingsKeys.FIRST_RUN_DONE); it.remove(SettingsKeys.PROFILES_CHOSEN); it.remove(SettingsKeys.LOCATION_DENIED)
        it.remove(SettingsKeys.MODE); it.remove(SettingsKeys.NOTIF_ASKED)
    }

    suspend fun setProfiles(p: Set<Profile>) = update {
        it[SettingsKeys.PROFILES] = p.map { x -> x.id }.toSet()
        it[SettingsKeys.PROFILES_CHOSEN] = true
    }

    suspend fun setHazeWatch(on: Boolean) = update { it[SettingsKeys.HAZE_WATCH] = on }
    suspend fun setBandAlerts(on: Boolean) = update { it[SettingsKeys.BAND_ALERTS] = on }
    suspend fun setElevatedAlerts(on: Boolean) = update { it[SettingsKeys.ELEVATED_ALERTS] = on }
    suspend fun setMock(scenario: String?) = update {
        if (scenario == null) it.remove(SettingsKeys.MOCK) else it[SettingsKeys.MOCK] = scenario
    }
    suspend fun setNotifAsked() = update { it[SettingsKeys.NOTIF_ASKED] = true }
    suspend fun setAlertState(s: AlertState) = update {
        it[SettingsKeys.ALERT_STATE] = HazeApi.json.encodeToString(AlertState.serializer(), s)
    }

    suspend fun widgetPlace(appWidgetId: Int): String? = context.settingsStore.data.first()[SettingsKeys.widgetPlace(appWidgetId)]
    suspend fun setWidgetPlace(appWidgetId: Int, key: String) = update { it[SettingsKeys.widgetPlace(appWidgetId)] = key }

    private fun Preferences.toSettings() = Settings(
        mode = this[SettingsKeys.MODE]?.let { m -> PlaceMode.entries.firstOrNull { it.name == m } } ?: PlaceMode.REGION,
        region = this[SettingsKeys.REGION] ?: Selection.DEFAULT_REGION,
        lat = this[SettingsKeys.LAT],
        lon = this[SettingsKeys.LON],
        area = this[SettingsKeys.AREA]?.let { runCatching { HazeApi.json.decodeFromString(Place.serializer(), it) }.getOrNull() },
        places = this[SettingsKeys.PLACES]?.let { runCatching { HazeApi.json.decodeFromString(placesSer, it) }.getOrNull() }.orEmpty(),
        activePlace = this[SettingsKeys.ACTIVE_PLACE],
        firstRunDone = this[SettingsKeys.FIRST_RUN_DONE] ?: false,
        locationDenied = this[SettingsKeys.LOCATION_DENIED] ?: false,
        profiles = this[SettingsKeys.PROFILES]?.mapNotNull(Profile::fromId)?.toSet()?.ifEmpty { null } ?: setOf(Profile.GENERAL),
        profilesChosen = this[SettingsKeys.PROFILES_CHOSEN] ?: false,
        hazeWatch = this[SettingsKeys.HAZE_WATCH] ?: false,
        bandAlerts = this[SettingsKeys.BAND_ALERTS] ?: true,
        elevatedAlerts = this[SettingsKeys.ELEVATED_ALERTS],
        quietStart = this[SettingsKeys.QUIET_START] ?: Alerts.QUIET_START_HOUR,
        quietEnd = this[SettingsKeys.QUIET_END] ?: Alerts.QUIET_END_HOUR,
        alertState = this[SettingsKeys.ALERT_STATE]?.let {
            runCatching { HazeApi.json.decodeFromString(AlertState.serializer(), it) }.getOrNull()
        } ?: AlertState(),
        notifAsked = this[SettingsKeys.NOTIF_ASKED] ?: false,
        mock = if (MockData.enabled) this[SettingsKeys.MOCK] else null,
        cityCountry = this[SettingsKeys.CITY_COUNTRY],
        cityId = this[SettingsKeys.CITY_ID],
        edgeOverride = if (MockData.enabled) this[SettingsKeys.EDGE_OVERRIDE] else null,
    )
}
