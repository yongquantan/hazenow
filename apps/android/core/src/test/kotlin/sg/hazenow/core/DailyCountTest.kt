package sg.hazenow.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class DailyCountTest {
    // 2026-10-05T23:30:00Z (07:30 the next morning in Singapore: the day is UTC's, not local).
    private val now = 1_791_243_000_000L

    @Test fun utcDay() = assertEquals("2026-10-05", DailyCount.utcDay(now))

    @Test fun oncePerUtcDay() {
        assertNull(DailyCount.decide(now, "2026-10-05", firstSeen = true, existingInstall = false))
        assertEquals(DailyCount.Decision("2026-10-05", "returning"), DailyCount.decide(now, "2026-10-04", firstSeen = true, existingInstall = false))
    }

    @Test fun newThenReturning() {
        assertEquals("new", DailyCount.decide(now, null, firstSeen = false, existingInstall = false)!!.seen)
        assertEquals("returning", DailyCount.decide(now, null, firstSeen = false, existingInstall = true)!!.seen)
        assertEquals("returning", DailyCount.decide(now, null, firstSeen = true, existingInstall = false)!!.seen)
    }

    @Test fun url() {
        assertEquals("https://w.dev/v1/hit?e=app_open&surface=android&seen=new&cc=th", DailyCount.url("https://w.dev/", "android", "new", "TH"))
        assertEquals("https://w.dev/v1/hit?e=app_open&surface=mac&seen=returning", DailyCount.url("https://w.dev", "mac", "returning", null))
        assertEquals("https://w.dev/v1/hit?e=app_open&surface=ios&seen=new", DailyCount.url("https://w.dev", "ios", "new", "1.35,103.8"))
        assertFailsWith<IllegalArgumentException> { DailyCount.url("https://w.dev", "web", "new", null) }
    }
}
