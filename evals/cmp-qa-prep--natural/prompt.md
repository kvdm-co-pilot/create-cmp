---
schema_version: "1.1"
name: cmp-qa-prep--natural
description: "Natural phrasing that should load the cmp-qa-prep skill."
tags: [cmp-qa-prep, trigger]
runs: 3
expected_outcome: "The reply brings up the device run: emulator, debug install, smoke flow."
---
Before I hand this build to testers I want proof that my Kotlin Multiplatform app actually launches and gets past the first screen on an Android device. Can you set that up and run it?
