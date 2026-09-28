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

sourceSets {
    // Shared cross-language fixtures (single source of truth with the TS/Swift ports).
    test { resources.srcDir("../../../packages/core/fixtures") }
}

tasks.test {
    useJUnit()
    testLogging { events("passed", "failed"); showStandardStreams = false }
}
