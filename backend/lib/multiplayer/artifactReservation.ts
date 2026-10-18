import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { pickRandomArtifact, type SelectedArtifact } from '@/lib/artifactSelector';

type StoredArtifact = Omit<SelectedArtifact, 'objectId'> & { objectId: string };
export async function reservedArtifact(sessionId: string, round: number, client: Prisma.TransactionClient = db, consume = false): Promise<SelectedArtifact | null> {
  const rows = consume
    ? await client.$queryRaw<Array<{ artifact: StoredArtifact }>>`
        DELETE FROM multiplayer_artifact_reservations WHERE session_id = ${sessionId}::uuid
          AND round_number = ${round} AND artifact IS NOT NULL RETURNING artifact`
    : await client.$queryRaw<Array<{ artifact: StoredArtifact }>>`
        SELECT artifact FROM multiplayer_artifact_reservations WHERE session_id = ${sessionId}::uuid
          AND round_number = ${round} AND artifact IS NOT NULL`;
  return rows[0] ? { ...rows[0].artifact, objectId: BigInt(rows[0].artifact.objectId) } : null;
}

/** A durable lease deduplicates preparation across instances; failures remain recoverable. */
export async function prepareNextArtifact(sessionId: string, currentRound: number): Promise<void> {
  const started = performance.now();
  const token = randomUUID();
  const round = currentRound + 1;
  let acquired = false;
  try {
    const claimed = await db.$queryRaw<Array<{ claim_token: string }>>`
      INSERT INTO multiplayer_artifact_reservations (session_id, round_number, claim_token, expires_at)
      SELECT id, ${round}, ${token}::uuid, clock_timestamp() + interval '30 seconds'
      FROM multiplayer_games WHERE id = ${sessionId}::uuid AND status = 'active'
        AND current_round = ${currentRound} AND max_rounds >= ${round}
      ON CONFLICT (session_id, round_number) DO UPDATE
      SET claim_token = EXCLUDED.claim_token, expires_at = EXCLUDED.expires_at
      WHERE multiplayer_artifact_reservations.artifact IS NULL
        AND multiplayer_artifact_reservations.expires_at < clock_timestamp()
      RETURNING claim_token
    `;
    if (!claimed.length) return;
    acquired = true;
    const artifact = await pickRandomArtifact();
    if (!artifact) return;
    await db.$queryRaw`
      UPDATE multiplayer_artifact_reservations SET artifact = ${JSON.stringify({ ...artifact, objectId: artifact.objectId.toString() })}::jsonb
      WHERE session_id = ${sessionId}::uuid AND round_number = ${round} AND claim_token = ${token}::uuid
        AND EXISTS (SELECT 1 FROM multiplayer_games WHERE id = ${sessionId}::uuid
          AND status = 'active' AND current_round = ${currentRound})
      RETURNING session_id
    `;
  } catch (error) {
    console.error('[multiplayer/reservation:failure]', { sessionId, round, error: String(error) });
  } finally {
    // Only release our own unfinished lease; ready reservations survive process exits.
    try {
      if (acquired) await db.$queryRaw`DELETE FROM multiplayer_artifact_reservations
        WHERE session_id = ${sessionId}::uuid AND round_number = ${round}
          AND claim_token = ${token}::uuid AND artifact IS NULL`;
    } catch (error) { console.error('[multiplayer/reservation:release]', String(error)); }
    console.info('[multiplayer/reservation:timing]', JSON.stringify({ sessionId, round, totalMs: Math.round(performance.now() - started) }));
  }
}
