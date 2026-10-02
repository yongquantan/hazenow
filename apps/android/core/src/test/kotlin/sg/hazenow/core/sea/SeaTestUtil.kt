package sg.hazenow.core.sea

import sg.hazenow.core.HazeApi
import sg.hazenow.core.Profile

internal object SeaTestUtil {
    /** PREVIEW_CAPTURED_AT in countries/ui.ts: the recorded preview sets are built at this instant. */
    val NOW: Long = SeaTime.parseMs("2026-09-28T10:30:00Z")!!

    fun text(path: String): String = javaClass.classLoader.getResource(path)!!.readText()

    fun preview(cc: String): ObservationSet = HazeApi.json.decodeFromString(ObservationSet.serializer(), text("sea/preview/$cc.json"))

    fun profile(id: String): Profile = if (id == "outdoor_worker") Profile.OUTDOOR_WORK else Profile.fromId(id)!!
}
