---
schema_version: "1.1"
name: cmp-upgrade--natural
description: "Natural phrasing that should load the cmp-upgrade skill."
tags: [cmp-upgrade, trigger]
runs: 3
expected_outcome: "The reply moves the project to a matched Kotlin/KSP/Compose version set."
---
I bumped Kotlin in my multiplatform project and now KSP complains about a version mismatch and nothing builds. Can you move me to versions that actually work together?
