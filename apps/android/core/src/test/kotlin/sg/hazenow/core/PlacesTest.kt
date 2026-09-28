package sg.hazenow.core

import java.io.File
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PlacesTest {
    private val sample = """[
        {"name":"Tampines","aliases":["Tampines East","Tampines West"],"lat":1.354,"lon":103.944},
        {"name":"Jurong East","aliases":["JE"],"lat":1.333,"lon":103.742},
        {"name":"Punggol","aliases":[],"lat":1.405,"lon":103.907},
        {"name":"Bukit Timah","aliases":["Holland"],"lat":1.330,"lon":103.803},
        {"name":"Nowhere","aliases":[],"lat":40.0,"lon":-70.0}
    ]"""

    @Test fun parseDropsInvalid() {
        val a = Areas.parse(sample)
        assertEquals(listOf("Tampines", "Jurong East", "Punggol", "Bukit Timah"), a.map { it.name })
    }

    @Test fun searchRanksAndMatchesAliases() {
        val a = Areas.parse(sample)
        assertEquals("Tampines", Areas.search(a, "tamp").first().first.name)
        assertEquals("Jurong East" to "JE", Areas.search(a, "je").first().let { it.first.name to it.second })
        assertEquals("Bukit Timah", Areas.search(a, "holland").single().first.name)
        assertEquals("Jurong East", Areas.search(a, "east").first().first.name) // word prefix beats alias substring
        assertEquals(4, Areas.search(a, "").size)
        assertTrue(Areas.search(a, "zzz").isEmpty())
    }

    @Test fun coordinatesRoundedTo2dp() {
        assertEquals(1.35, Areas.round2(1.354))
        assertEquals(103.94, Areas.round2(103.9449))
        val p = Place.of("Home", "Near you", 1.296871, 103.823456)
        assertEquals(1.3, p.lat); assertEquals(103.82, p.lon)
        assertEquals("Home (Near you)", p.display)
        assertEquals("Tampines", Place.of("Tampines", "Tampines", 1.354, 103.944).display)
    }

    @Test fun areaUsesDistanceWeightedEstimate() {
        val pm = HazeApi.parse(javaClass.classLoader.getResource("pm25-latest.json")!!.readText())
        val now = Instant.parse("2026-09-28T08:35:00Z")
        val tampines = Place.of("Tampines", "Tampines", 1.354, 103.944)
        val s = HazeCore.snapshot(listOf(pm), null, tampines.selection, now)!!
        assertEquals(LocationMode.GPS, s.locationMode)
        assertEquals("east", s.nearestRegion)
        val i = Experience.insight(s, emptySet(), tampines.lat, tampines.lon, now, placeName = tampines.display)
        assertTrue(i.provenance.startsWith("Tampines · East station "), i.provenance)
    }

    @Test fun islandSelection() {
        val pm = HazeApi.parse(javaClass.classLoader.getResource("pm25-latest.json")!!.readText())
        val s = HazeCore.snapshot(listOf(pm), null, Selection.Island, Instant.parse("2026-09-28T08:35:00Z"))!!
        assertEquals(LocationMode.ISLAND, s.locationMode)
        assertEquals(92, s.pm25) // (49+105+117+83+105)/5 = 91.8
        assertEquals("Singapore (island average)", Format.place(s))
    }

    /** SPEC v1.4 §6: every name in the shared data file must be valid. Skipped until the file exists. */
    @Test fun sharedAreasFileIsValid() {
        val f = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "packages/core/data/sg-areas.json") }.firstOrNull { it.exists() } ?: return
        val raw = kotlinx.serialization.json.Json.parseToJsonElement(f.readText())
        val parsed = Areas.parse(f.readText())
        assertEquals((raw as kotlinx.serialization.json.JsonArray).size, parsed.size, "every area must be inside Singapore")
        assertTrue(parsed.size >= 55, "expected ≥55 planning areas, got ${parsed.size}")
        assertEquals(parsed.size, parsed.map { it.name }.toSet().size, "duplicate names")
    }
}
