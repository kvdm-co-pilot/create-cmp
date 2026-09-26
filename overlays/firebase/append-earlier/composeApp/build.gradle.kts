// >>> create-cmp add firebase
// Added by `create-cmp add firebase`: the GitLive Firebase KMP SDK, and the debug-build switch
// FirebaseEmulators.kt reads. Your own buildTypes above are not edited — the block below only adds
// two BuildConfig fields to each.
kotlin {
    sourceSets {
        commonMain.dependencies {
            implementation(libs.firebase.auth)
            implementation(libs.firebase.firestore)
            implementation(libs.firebase.functions)
            implementation(libs.firebase.storage)
            implementation(libs.firebase.messaging)
            implementation(libs.firebase.config)
        }
    }
}

android {
    buildFeatures {
        buildConfig = true
    }
    buildTypes {
        getByName("debug") {
            // 10.0.2.2 is the Android emulator's alias for the host loopback, where the suite listens.
            buildConfigField("boolean", "USE_FIREBASE_EMULATORS", "true")
            buildConfigField("String", "FIREBASE_EMULATOR_HOST", "\"10.0.2.2\"")
        }
        getByName("release") {
            // Every field debug declares, release declares too: BuildConfig is generated PER BUILD
            // TYPE, and FirebaseEmulators.kt names both fields in every build. The values are never
            // used — the flag is false.
            buildConfigField("boolean", "USE_FIREBASE_EMULATORS", "false")
            buildConfigField("String", "FIREBASE_EMULATOR_HOST", "\"\"")
        }
    }
}
// <<< create-cmp add firebase
