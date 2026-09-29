---
schema_version: "1.1"
name: cmp-test--natural
description: "Natural phrasing that should load the cmp-test skill."
tags: [cmp-test, trigger]
runs: 3
expected_outcome: "The reply derives tests from the running UI and writes them into the harness."
---
My Compose Multiplatform app has no tests at all. Look at what the running app actually shows and write me end-to-end tests that would catch it breaking later.
