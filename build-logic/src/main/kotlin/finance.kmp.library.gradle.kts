plugins {
    id("org.jetbrains.kotlin.multiplatform")
}

kotlin {
    // JVM target (Desktop / server)
    jvm()

    // iOS targets
    iosArm64()
    iosSimulatorArm64()
    iosX64()

    // JS target (browser)
    js(IR) {
        browser()
    }

    // Hierarchical source set structure
    applyDefaultHierarchyTemplate()

    sourceSets {
        commonMain.dependencies {
            implementation(libs.findLibrary("kotlinx-coroutines-core").get())
        }

        commonTest.dependencies {
            implementation(libs.findLibrary("kotlin-test").get())
        }
    }
}

private val libs: VersionCatalog
    get() = project.extensions
        .getByType<VersionCatalogsExtension>()
        .named("libs")
