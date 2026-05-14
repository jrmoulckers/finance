// SPDX-License-Identifier: BUSL-1.1

plugins {
    alias(libs.plugins.kotlin.multiplatform) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.sqldelight) apply false
    alias(libs.plugins.detekt)
    alias(libs.plugins.compose.multiplatform) apply false
    alias(libs.plugins.kotlin.jvm) apply false
}

// Configure detekt for all Kotlin files in the project
detekt {
    basePath = projectDir.absolutePath
    config.setFrom("$rootDir/config/detekt/detekt.yml")
    source.setFrom("$rootDir/build-logic", "$rootDir/packages", "$rootDir/apps")
    parallel = true
    ignoreFailures = true
    buildUponDefaultConfig = true
}

// Force vulnerable transitive dependencies to safe versions
allprojects {
    configurations.all {
        resolutionStrategy.eachDependency {
            if (requested.group == "org.apache.commons" && requested.name == "commons-compress") {
                useVersion(libs.versions.commons.compress.get())
                because("Fix CVE-2024-25710 (DoS infinite loop) and CVE-2024-26308 (OOM)")
            }
            if (requested.group == "commons-io" && requested.name == "commons-io") {
                useVersion(libs.versions.commons.io.get())
                because("Fix CVE-2024-47554 (DoS via XmlStreamReader)")
            }
            if (requested.group == "org.apache.httpcomponents" && requested.name == "httpclient") {
                useVersion(libs.versions.httpcomponents.httpclient.get())
                because("Fix CVE-2020-13956 (XSS in Apache HttpComponents)")
            }
            if (requested.group == "com.google.protobuf" && requested.name == "protobuf-java") {
                useVersion(libs.versions.protobuf.java.get())
                because("Fix CVE-2024-7254 (DoS via protobuf-java)")
            }
            if (requested.group == "org.jdom" && requested.name == "jdom2") {
                useVersion(libs.versions.jdom2.get())
                because("Fix CVE-2021-33813 (XXE Injection in JDOM2)")
            }
        }
    }
}
