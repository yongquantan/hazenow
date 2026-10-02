plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

kotlin { jvmToolchain(17) }

dependencies {
    api(libs.kotlinx.serialization.json)
    testImplementation(kotlin("test"))
    testImplementation(libs.junit)
}

// SPEC v2.0 §3: the country borders (Natural Earth, public domain) come from the TS reference's generated
// packages/core/src/countries/borders-data.ts. Its JSON literal is extracted at build time into a classpath
// resource, so every client uses the same polygons and there is no hand-copied data to drift.
val seaResOut = layout.buildDirectory.dir("generated/seaRes")
val extractBorders by tasks.registering {
    val src = rootProject.file("../../packages/core/src/countries/borders-data.ts")
    inputs.file(src)
    outputs.dir(seaResOut)
    doLast {
        val text = src.readText()
        val json = text.substring(text.indexOf("= {") + 2, text.lastIndexOf("};") + 1)
        val out = seaResOut.get().file("sea/borders.json").asFile
        out.parentFile.mkdirs()
        out.writeText(json)
    }
}

sourceSets {
    main { resources.srcDir(seaResOut) }
    // Shared cross-language fixtures (single source of truth with the TS/Swift ports).
    test { resources.srcDir("../../../packages/core/fixtures") }
}
tasks.named("processResources") { dependsOn(extractBorders) }

tasks.test {
    useJUnit()
    testLogging { events("passed", "failed"); showStandardStreams = false }
}
