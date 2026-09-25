# >>> create-cmp add firebase
# Firebase (added by `create-cmp add firebase`)
-keep class com.google.firebase.** { *; }
-keep class dev.gitlive.firebase.** { *; }
-dontwarn com.google.firebase.**

# GitLive's RemoteConfig module is compiled against kotlinx-datetime's OWN Instant, which this
# version set no longer has: on Kotlin 2.2 Instant moved into the stdlib as kotlin.time.Instant.
# R8 hits an unresolvable reference and FAILS the release build.
#
# Suppressed rather than resolved, deliberately. The reference lives in FirebaseRemoteConfigInfo,
# and nothing in this app calls RemoteConfig, so no code path reaches it. Adding kotlinx-datetime
# back purely to satisfy a class nobody calls would put two Instant types in the graph — the more
# expensive mistake. When GitLive ships a build against kotlin.time, delete these two lines; the
# release build will say if it is time.
-dontwarn kotlinx.datetime.Instant$Companion
-dontwarn kotlinx.datetime.Instant
# <<< create-cmp add firebase
