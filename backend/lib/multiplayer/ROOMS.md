Battle royale rooms and sessions

Before deploying the synchronized game-end changes, apply the additive
`20260914000000_results_reveal` migration and regenerate Prisma. Finished snapshots
include nullable `resultsRevealAt`, set once at finalization to database time plus
one second. Clients gate final results on that shared timestamp using their server
clock estimate; late arrivals and legacy sessions reveal immediately. Guess
responses and broadcasts reuse the same consistent snapshot. Concurrent guesses
that require deferred resolution schedule recovery on the server after response.

Apply `20260913000000_multiplayer_rooms` before deploying the new backend and frontend together. The migration is additive. Every legacy game keeps its ID and is linked to a room with that same ID, so existing links still resolve. Applied to the configured application database on September 12, 2026. Post-migration verification confirmed that all 16 existing sessions, 20 players, and 99 guesses were preserved, with every session and player linked to its room and member. The room revision trigger and realtime publication were also verified.

`POST /api/multiplayer/create` now creates a room and returns both `roomId` and the compatibility alias `gameId`. Room routes are `/api/rooms/:roomId/status`, `/join`, `/start`, `/reopen`, `/leave`, `/remove`, `/statistics`, `/sessions`, and `/sessions/:sessionId`. Session lists accept `page` (default 1), `limit` (1–50, default 10), and optional `memberId`. Only completed sessions appear. Details include all available round cards and finalized standings.

Joining returns `memberId` and a private `credential`. Store these in browser localStorage under `br_member_<roomId>`. Authenticated mutations use `Authorization: Bearer <credential>`. Start/reopen/leave/remove require `expectedSessionId`, explicitly null before the first start. Remove also requires `memberId`. Repeated reopen requests are harmless; repeated starts with an obsolete session return 409. The legacy join/start paths delegate to these authenticated room actions. Guess requests still use `/api/multiplayer/:sessionId/guess`, now require the credential and `roundNumber`, and cannot authorize another member's participation. Session status remains available through the existing endpoint. These authentication requirements deliberately break old clients that used public player IDs as credentials.

The stable realtime channel is `room-<roomId>`, event `room_update`. The migration adds the room table to the Supabase publication if it exists. The frontend subscribes to room-row changes and retains polling, deadline resolution, and reconnect recovery. Room revisions advance via a database trigger for session mutations and explicitly for membership/transitions. All writers lock room before session. Snapshots use repeatable-read transactions so a new revision cannot carry a mixture of old and new data.

Legacy identity provisioning

Legacy player IDs were public, and no private authentication material existed. They cannot safely be converted into proof of identity. The migration preserves the legacy roster and host but leaves their credential hashes null. Before asking those members to resume an old room, an operator must privately provision credentials for verified members (especially the host):

    node --env-file=.env.local scripts/provision-legacy-room-member.cjs MEMBER_ID /private/path/member.json

The script writes a new private file with mode 0600, stores only its hash in the database, and refuses already-provisioned members. Import that JSON as the value of `br_member_<roomId>` in that member's browser localStorage, then refresh. Do not publish exports or include them in logs. Historical pages need no credential. Newly created rooms need no operator involvement. This is a one-time migration procedure, not account or cross-device recovery. An old room cannot accept authenticated actions from its legacy members until they have been provisioned.

Legacy placements are reconstructed only when survival order is known. Unknown elimination order leaves the entire session's placements unavailable; participations still count toward sessions played. Available legacy round JSON and guesses are retained. Cumulative score for an active legacy session excludes the unresolved current round to avoid counting it twice.

Validation

Run `npm run test:rooms` in backend, `npx tsc --noEmit` in backend, `node --test snapshotSync.test.js` from `artifact-atlas/src/app/battle-royale/[gameId]`, and `npm run build` in both applications. The room suite uses isolated PGlite PostgreSQL databases and a small Prisma-shaped transport adapter to execute the production services. It tests migration fixtures, rematches, concurrent transition requests, capacity, credentials, stale guesses, host transfer, finalized statistics, ties, and transaction rollback. PGlite serializes transactions on one connection; multi-connection PostgreSQL lock contention and browser/Supabase delivery still require integration testing in the deployment environment.
