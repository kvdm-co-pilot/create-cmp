# The console protocol — one wire, whoever started the process

**Status:** proposed · 2026-07-28
**Scope:** `inspector/mcp` — the console's HTTP surface and the MCP tools that consume it.
**Companion:** `console-build-handshake.md` (the staleness half, shipped). This is the
"larger half" that brief scoped out.

## The problem

Seven MCP tools gate on a module-level `previewService` **object** in `bin/server.mjs` —
the in-memory service the MCP process itself started. The standalone console
(`bin/console.mjs`, shipped today so the human's window survives agent respawns) runs
that service **in another process**, so for exactly the configuration we now recommend,
the agent's fast feedback tier answers "No preview service is running":

`preview_status` (incl. `waitForRender`) · `preview_diff` · `snapshot_variant` ·
`approval_status` (incl. `waitForDecision`) · `review_comments` (incl. `waitForComment`) ·
`resolve_comment` · `preview_stop`

(`snapshot_save`/`snapshot_diff`/`prove_change` were never gated — they take explicit
sources. The gap is these seven.)

## Decisions

**1. One wire, always — even to a console this process started.** The tools speak HTTP
to the console's existing server; the in-process object is no longer a data path for
them. **Why:** the alternative — keep the object path and add an HTTP fallback — is two
implementations of seven tools, and dual paths drift. Docker is the precedent: the CLI
talks to dockerd's API even when it is local. One contract means an adopted console and
an owned one are indistinguishable, which is the entire point.

**2. The protocol is thin wrappers over methods that already exist.** Eight routes on
the console's HTTP server, each delegating to a service method shipped long ago:

| Route | Delegates to |
|---|---|
| `GET  /api/render-wait?timeoutMs` | `waitForRender` (long-poll) |
| `GET  /api/diff?screen&tolerancePx&minTouchTargetPx` | `diffScreen` (logic moves INTO the service — see 3) |
| `POST /api/variant {name}` | `snapshotVariant` |
| `GET  /api/approvals` | `approvalStatusSnapshot` |
| `GET  /api/approval-wait?timeoutMs` | `waitForApprovalDecision` (long-poll) |
| `GET  /api/comments?status` | `commentsSnapshot` |
| `GET  /api/comment-wait?timeoutMs` | `waitForNewComment` (long-poll) |
| `POST /api/resolve-comment {id, note}` | `resolveComment` |

**Why long-poll and not SSE for the waits:** the tools' contract is request/response —
"block, then return the full snapshot plus `timedOut`". Long-poll IS that contract over
HTTP (Consul's blocking queries, Kubernetes watch-with-timeout). An SSE subscription
would need client-side correlation and re-snapshotting to rebuild the same answer.
Node's HTTP server bounds request *receipt*, not response time, so a 120s hold is safe.

**3. Computation lives where the state lives.** `preview_diff` currently pulls two tree
generations out of the service and diffs them in `bin/server.mjs`. The previous
generation exists only in the console process's memory, so the diff moves into the
service (`diffScreen`) and the route returns the verdict. Thin client, fat daemon —
shipping state across the wire so the client can compute is the pattern inverted.

**4. `preview` is the session's console-resolver, and tools require it first — the
contract they already have.** On success (started OR adopted) it records
`{url, projectDir, external}`; the seven tools use that. **Why not auto-discover per
call:** the tools' existing contract says "call preview first", and keeping it avoids a
second discovery path; `preview` already carries the adoption warning and the build-id
handshake, so resolution stays where the honesty checks are.

**5. `preview_stop` refuses to stop a console it does not own.** In-process: stops it,
as today. External: refuse, naming `node inspector/mcp/bin/console.mjs <dir> --stop`.
**Why:** the standalone console is the HUMAN's window — an agent tool named
"stop preview" must not reach through the wire and close it. The human's own verb
exists; the refusal points at it.

**6. A dead console is reported as exactly that.** Wire errors surface as "the console
at <url> stopped answering — it may have been stopped or crashed; call
preview { projectDir } again", never as a stack trace and never as an empty result.
A console that answers but predates a route (404) is named as an older build — the
handshake's vocabulary, reused.

## Rejected

- **Keep the object path as a fast path.** Dual implementations; the drift risk IS the
  bug class this whole week has been about (state in one place, truth in another).
- **A general RPC layer / WebSocket protocol.** Eight thin routes over an HTTP server
  that already exists. Frameworks are for the eleventh route.
- **Auto-starting a console inside the tools when none is found.** Hidden side effect in
  a read tool; `preview` is the explicit, already-documented entry.
- **Auth tokens on the new routes.** Loopback-only today, unchanged: the routes add
  read/wait/diff/variant/resolve — no new capability beyond what the page's existing
  POST endpoints already expose on that port. Revisit with any non-loopback ambition
  (Jupyter's token model is the shape to copy).

## Edge cases

1. **Console dies mid-long-poll.** fetch rejects → decision 6's message. The tool's
   caller retries after `preview`.
2. **Tool timeout vs wire timeout.** Client abort = server hold + 15s, so the server's
   own `timedOut:true` answer always wins the race; the client abort only fires if the
   console truly stopped responding.
3. **Adopted console on an older build without these routes.** 404 → "that console
   predates the protocol (build <id>) — restart it: node inspector/mcp/bin/console.mjs
   <dir>". The build handshake already warned at adoption time.
4. **Two agent sessions, one console.** Both speak the same wire; waits are per-request
   (the service already supports N concurrent waiters — the page holds SSE clients the
   same way). No session owns the console, which is now true by construction.
5. **`resolve_comment` via wire records the same author** (`agent`) the object path
   recorded — the ledger cannot tell the transport, which is correct: the transport is
   not a fact about the decision.
