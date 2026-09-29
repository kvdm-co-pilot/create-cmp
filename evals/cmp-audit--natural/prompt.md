---
schema_version: "1.1"
name: cmp-audit--natural
description: "Natural phrasing that should load the cmp-audit skill."
tags: [cmp-audit, trigger]
runs: 3
expected_outcome: "The reply reviews the reminder path against reboot and clock-change behaviour."
---
Our Compose Multiplatform app schedules a daily reminder notification. I am worried it stops firing after the phone restarts, or goes off an hour early when the clocks change. Can you go through that part of the app and hunt for bugs like that?
