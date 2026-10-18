Battle royale rooms and sessions

Before deploying the synchronized game-end changes, apply the additive
`20260914000000_results_reveal` migration and regenerate Prisma. Every completed round includes nullable `resultsRevealAt`, set once at resolution to database time plus
one second. Initial rounds and rematches start five seconds ahead; subsequent rounds start 20 seconds after reveal (15 seconds of results and five of countdown). Deadlines are relative to the scheduled start. Snapshots and resolution use database time. Clients gate results, history, statistics, and input through one phase calculation using that shared timestamp and their server
clock estimate; late arrivals and legacy sessions reveal immediately. Guess
responses and broadcasts reuse the same consistent snapshot. Guess submissions
commit the score before artifact selection or round resolution; the response may
therefore report `roundResolved: false` for the final accepted guess while
server-side status recovery completes the reveal transaction after response.

Apply `20260913000000_multiplayer_rooms` before deploying the new backend and frontend together. The migration is additive. Every legacy game keeps its ID and is linked to a room with that same ID, so existing links still resolve. Applied to the configured application database on September 12, 2026. Post-migration verification confirmed that all 16 existing sessions, 20 players, and 99 guesses were preserved, with every session and player linked to its room and member. The room revision trigger and realtime publication were also verified.

`POST /api/multiplayer/create` now creates a room and returns both `roomId` and the compatibility alias `gameId`. Room routes are `/api/rooms/:roomId/status`, `/join`, `/start`, `/reopen`, `/leave`, `/remove`, `/statistics`, `/sessions`, and `/sessions/:sessionId`. Session lists accept `page` (default 1), `limit` (1–50, default 10), and optional `memberId`. Only completed sessions appear. Details include all available round cards and finalized standings.

Joining returns `memberId` and a private `credential`. Store these in browser localStorage under `br_member_<roomId>`. Authenticated mutations use `Authorization: Bearer <credential>`. Start/reopen/leave/remove require `expectedSessionId`, explicitly null before the first start. Remove also requires `memberId`. Repeated reopen requests are harmless; repeated starts with an obsolete session return 409. The legacy join/start paths delegate to these authenticated room actions. Guess requests still use `/api/multiplayer/:sessionId/guess`, now require the credential and `roundNumber`, and cannot authorize another member's participation. Session status remains available through the existing endpoint. These authentication requirements deliberately break old clients that used public player IDs as credentials.

The stable realtime channel is `room-<roomId>`, event `room_update`. The migration adds the room table to the Supabase publication if it exists. The frontend subscribes to room-row changes and retains polling, deadline resolution, and reconnect recovery. Room revisions advance via a database trigger for session mutations and explicitly for membership/transitions. All writers lock room before session. Room snapshots use one SQL statement, so the revision, roster, session, and guesses share one PostgreSQL snapshot without separate network round trips. Status requests load the resolution service only at a deadline, for legacy missing deadlines, or when everyone has guessed. Mutation broadcasts reuse the response snapshot with private join identity fields removed. Clients poll every five seconds during play, every two seconds during transitions or recovery, and every 30 seconds after results while realtime is healthy.

Legacy identity provisioning

Legacy player IDs were public, and no private authentication material existed. They cannot safely be converted into proof of identity. The migration preserves the legacy roster and host but leaves their credential hashes null. Before asking those members to resume an old room, an operator must privately provision credentials for verified members (especially the host):

    node --env-file=.env.local scripts/provision-legacy-room-member.cjs MEMBER_ID /private/path/member.json

The script writes a new private file with mode 0600, stores only its hash in the database, and refuses already-provisioned members. Import that JSON as the value of `br_member_<roomId>` in that member's browser localStorage, then refresh. Do not publish exports or include them in logs. Historical pages need no credential. Newly created rooms need no operator involvement. This is a one-time migration procedure, not account or cross-device recovery. An old room cannot accept authenticated actions from its legacy members until they have been provisioned.

Legacy placements are reconstructed only when survival order is known. Unknown elimination order leaves the entire session's placements unavailable; participations still count toward sessions played. Available legacy round JSON and guesses are retained. Cumulative score for an active legacy session excludes the unresolved current round to avoid counting it twice.

Validation

Run `npm run test:rooms` in backend, `npx tsc --noEmit` in backend, `node --test snapshotSync.test.js` from `artifact-atlas/src/app/battle-royale/[gameId]`, and `npm run build` in both applications. The room suite uses isolated PGlite PostgreSQL databases and a small Prisma-shaped transport adapter to execute the production services. It tests migration fixtures, rematches, concurrent transition requests, capacity, credentials, stale guesses, host transfer, finalized statistics, ties, and transaction rollback. PGlite serializes transactions on one connection; multi-connection PostgreSQL lock contention and browser/Supabase delivery still require integration testing in the deployment environment.

Rooms support `autoAdvanceRounds` (default `true`). Apply the additive
`20260915000000_manual_round_advance` migration and regenerate Prisma before running
this version. Creation accepts the boolean; the host can change it in a waiting
lobby with `POST /api/rooms/:roomId/settings` and `{ expectedSessionId, autoAdvanceRounds }`.
The setting persists across rematches. With automatic advancement disabled, a
resolved non-final round sets `awaitingHost: true` with null round timestamps;
status polling and guesses cannot start that round. After results reveal, the host
uses `POST /api/rooms/:roomId/next-round` with `{ expectedSessionId, expectedRound }`
(the snapshot's `currentRound`) to schedule a five-second countdown. Session/round
checks and room/session locks reject stale or duplicate actions. Final results
still finish the session immediately.

Faster guess acceptance and results delivery

Apply `20261018000000_artifact_reservations` before deploying this backend and
regenerate Prisma. This adds a private table with RLS enabled and no public
policies; do not add it to the Realtime publication. Only the backend database
role may prepare/read answers. No existing tables or data are removed.

Authorization uses one parameterized join. Guess acceptance locks room before
session, revalidates membership/ownership/session and duplicate submission in one
read, checks database time, writes the score/revision, and prepares the public
snapshot in the same transaction. The unique guess constraint remains in force.
The returned `allGuessed` value is private service metadata. An ordinary guess
only publishes this snapshot. A final guess publishes acceptance, then resolves
and publishes results in one ordered `after` pipeline. Rejected late guesses and
status polling retain deadline recovery. Delayed messages still pass through the
client's revision gate. Guess responses include `X-Room-Processing-Ms` for the
same clock calibration used by status responses.

After start, `after` prepares round two. After each advancement, preparation
replenishes the next round after the result broadcast. Reservations are keyed by
session and upcoming round, use a renewable 30-second lease to deduplicate
selection across instances, and persist selected artifacts across process exits.
Resolution consumes a ready reservation transactionally; rollback restores it.
Missing/failed/in-progress preparation uses the existing claimed on-demand
selection without holding room/session locks during selection. A stale worker
cannot replace an advanced round or commit after claim takeover. Reserved
artifacts never appear in public snapshots. The shared one-second
`resultsRevealAt` barrier, results duration, scoring and manual advancement remain
unchanged. Realtime HTTP requests have a two-second timeout; failure is logged
and status polling remains authoritative.

Measurement and rollout

Warm production targets are p95 guess acknowledgement below 1,000 ms, p95 final
accepted guess commit to result broadcast below 500 ms, and visible results within
1,500 ms of that commit on healthy connections. These are targets, not measured
improvements. The one-second reveal barrier is deliberate and is separate from
delivery latency. A broadcast HTTP success does not prove browser receipt.

Correlate `multiplayer/guess:timing`, `multiplayer/guess:results`,
`multiplayer/resolve:timing`, `multiplayer/reservation:timing`, and
`multiplayer/broadcast:timing` by room/session/round/revision and request ID where
available. Guess timings include authorization, scoring, pool acquisition, lock
wait, transaction and snapshot work. Broadcast timings include HTTP status and
time from resolution commit to send/start and HTTP completion; guess result logs
also measure from the final guess commit, including the acceptance broadcast and
resolution. All commit durations use a monotonic clock sampled immediately after
Prisma confirms commit. Browser `multiplayer/receipt` and `multiplayer/visible`
debug logs correlate by revision and record calibrated snapshot age and reveal
lateness. Enable browser debug logs when collecting traces.

The locally configured Supabase pool hostname identifies `us-west-2`; deployed
credentials and the actual deployed function region have not been verified.
`multiplayer/guess:timing` logs `VERCEL_REGION` when available. Verify the deployed
database region in Supabase, compare the runtime region in deployed logs, then
configure the backend Vercel project's Function Regions close to that database
(for an Oregon database, verify Portland `pdx1` availability). Vercel recommends
placing functions near their data source:
https://vercel.com/docs/functions/configuring-functions/region . Do not infer the
runtime function region from a CDN response's routing region. No region override
has been committed without deployed-region evidence.

Retain `connection_limit=1`. For a two-connection preview experiment, set
`connection_limit=2` in that preview's `DATABASE_URL` after checking Supabase's
connection budget and the maximum concurrently running instances. The existing
URL builder honors an explicit override. Account for other services and leave
headroom; do not adopt the override solely from single-instance timings.

The benchmark script creates persistent, separate test rooms and uses public
Supabase credentials from the environment. Use the matching Supabase environment
for each deployment; no service-role key is needed by the clients. From backend:

    BENCH_RUNS=20 BENCH_LABEL=current node --env-file=.env.local scripts/benchmark-room-latency.cjs https://CURRENT_DEPLOYMENT > /private/tmp/current-room-latency.jsonl
    BENCH_RUNS=20 BENCH_LABEL=preview node --env-file=.env.local scripts/benchmark-room-latency.cjs https://PREVIEW_DEPLOYMENT > /private/tmp/preview-room-latency.jsonl

The default matrix is 2, 10 and 20 concurrent guesses, with one subscribed
Realtime client per player. `BENCH_PLAYERS=2` restricts a smoke run. Protected
previews can provide `VERCEL_AUTOMATION_BYPASS_SECRET`. Each JSONL summary reports
p50/p95 HTTP acknowledgement, processing, estimated commit-to-receipt and
commit-to-visible times, plus missed broadcasts. No status polling runs during
the 15-second delivery measurement, so it cannot hide missed fast-path messages;
a final status read checks recovery. Client commit estimates use the final guess
snapshot's server time (sampled before commit); use correlated server logs for the
authoritative commit-to-broadcast target and browser traces for actual rendering.
The script's visible time is the later of receipt and the shared reveal deadline.

Record cold requests separately after a fresh deployment or confirmed instance
recycle; setting `BENCH_LABEL=cold` labels a run but cannot force a cold instance.
Collect enough independent cold samples for a meaningful p95. Compare current,
preview, and the budget-checked two-connection preview with identical client
location and settings. Report sample counts, errors/missed broadcasts, p50/p95,
and both milliseconds and percentage improvement relative to the measured
baseline. Compare visible delay against the reported six seconds separately;
do not equate that anecdote with a measured baseline percentile.

Local verification: 23 backend room tests, 14 frontend synchronization tests,
TypeScript, Prisma schema validation, and both production builds passed. PGlite
serializes transactions, so multi-connection lock contention, live Supabase
broadcast delivery, actual cold instances, deployed region colocation and the
production p50/p95 comparison remain deployment checks. The migration has not
been applied to a shared database by this change.
