plugins {
    alias(libs.plugins.kotlin.multiplatform) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.compose.multiplatform) apply false
    alias(libs.plugins.compose.compiler) apply false
    alias(libs.plugins.android.application) apply false
    // >>> cmp:feature firebase
    alias(libs.plugins.google.services) apply false
    // <<< cmp:feature firebase
    // >>> cmp:feature room
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.room) apply false
    // <<< cmp:feature room
}
