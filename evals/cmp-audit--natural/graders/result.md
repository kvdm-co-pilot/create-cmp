---
type: regex
pattern: "reboot|BOOT_COMPLETED|daylight|DST|AlarmManager|time ?zone"
flags: i
match: contains
target: last_message
---
