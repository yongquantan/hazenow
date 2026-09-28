import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Optional release signing, in this order:
//  1. CI: env HAZENOW_KEYSTORE_FILE, HAZENOW_KEYSTORE_PASSWORD, HAZENOW_KEY_ALIAS (and optional HAZENOW_KEY_PASSWORD,
//     which defaults to the store password). Set by .github/workflows/release.yml from GitHub secrets.
//  2. Local: apps/android/keystore.properties (git-ignored) with storeFile=..., storePassword=..., keyAlias=..., keyPassword=...
//  3. Neither: release builds are unsigned, as before.
val keystoreProps = Properties().apply {
    val envFile = System.getenv("HAZENOW_KEYSTORE_FILE")
    if (!envFile.isNullOrBlank()) {
        val pw = System.getenv("HAZENOW_KEYSTORE_PASSWORD").orEmpty()
        setProperty("storeFile", envFile)
        setProperty("storePassword", pw)
        setProperty("keyAlias", System.getenv("HAZENOW_KEY_ALIAS") ?: "hazenow")
        setProperty("keyPassword", System.getenv("HAZENOW_KEY_PASSWORD")?.takeIf { it.isNotBlank() } ?: pw)
    } else {
        val f = rootProject.file("keystore.properties")
        if (f.exists()) f.inputStream().use { load(it) }
    }
}

// Release versions come from the git tag in CI (HAZENOW_VERSION_NAME, HAZENOW_VERSION_CODE); local builds keep the defaults.
val ciVersionName: String? = System.getenv("HAZENOW_VERSION_NAME")?.takeIf { it.isNotBlank() }
val ciVersionCode: Int? = System.getenv("HAZENOW_VERSION_CODE")?.toIntOrNull()

android {
    namespace = "sg.hazenow"
    compileSdk = 35

    defaultConfig {
        applicationId = "sg.hazenow"
        minSdk = 26
        targetSdk = 35
        versionCode = ciVersionCode ?: 1
        versionName = ciVersionName ?: "1.0.0"
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
        debug {
            // No applicationIdSuffix: QA scripts use `sg.hazenow/.MainActivity` for every build type.
            versionNameSuffix = "-debug"
        }
    }

    // F-Droid / reproducible builds: no Google-encrypted dependency metadata blob in the APK.
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "META-INF/versions/9/previous-compilation-data.bin")
    }
}

// SPEC v1.4 §6: the shared, offline area list (packages/core/data/sg-areas.json) is copied into the APK's assets
// at build time, so every client uses the same file.
val areasOut = layout.buildDirectory.dir("generated/areas")
val copyAreas by tasks.registering(Copy::class) {
    from(rootProject.file("../../packages/core/data")) { include("sg-areas.json") }
    into(areasOut)
}
android.sourceSets["main"].assets.srcDir(areasOut)
tasks.named("preBuild") { dependsOn(copyAreas) }

dependencies {
    implementation(project(":core"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.glance.material3)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
