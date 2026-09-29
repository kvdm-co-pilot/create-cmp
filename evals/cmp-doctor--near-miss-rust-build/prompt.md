---
schema_version: "1.1"
name: cmp-doctor--near-miss-rust-build
description: "Near miss: a request that must NOT load the cmp-doctor skill."
tags: [cmp-doctor, near-miss]
runs: 3
expected_outcome: "The reply diagnoses the Rust toolchain failure; no KMP toolchain doctor runs."
---
My Rust project stopped building after I updated the toolchain. `cargo build` now fails with error[E0658]: use of unstable library feature. How do I fix it?
