import { createHash, randomBytes } from 'node:crypto';
import { Prisma, type multiplayer_rooms } from '@prisma/client';
import { db } from '@/lib/db';
import { pickRandomArtifact } from '@/lib/artifactSelector';
import { readRoomSnapshot } from './roomSnapshot';
import { GameSession, GameSessionError, MAX_PLAYERS, databaseNow } from './GameSession';

type Tx = Prisma.TransactionClient;
export const isUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export const credential = (req: Request) => req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';

async function lockRoom(tx: Tx, roomId: string) {
  if (!isUuid(roomId)) throw new GameSessionError('Invalid room ID');
  const rows = await tx.$queryRaw<multiplayer_rooms[]>`SELECT * FROM multiplayer_rooms WHERE id = ${roomId}::uuid FOR UPDATE`;
  if (!rows[0]) throw new GameSessionError('Room not found', 404);
  return rows[0];
}

export async function authenticate(tx: Tx, roomId: string, token: string, active = true) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new GameSessionError('Room credential required', 401);
  const member = await tx.multiplayer_room_members.findFirst({
    where: { room_id: roomId, credential_hash: hash(token), ...(active ? { left_at: null } : {}) },
  });
  if (!member) throw new GameSessionError('Room membership is no longer active', 403);
  return member;
}

export async function roomSnapshot(roomId: string) {
  if (!isUuid(roomId)) throw new GameSessionError('Invalid room ID');
  return readRoomSnapshot(roomId);
}

export async function roomStatus(roomId: string, onResolved?: (snapshot: Awaited<ReturnType<typeof roomSnapshot>>) => void) {
  const snapshot = await roomSnapshot(roomId);
  if (snapshot.status !== 'active' || snapshot.awaitingHost || !snapshot.currentSessionId) return snapshot;
  const now = Date.parse(snapshot.serverTime);
  if (snapshot.roundStartsAt && now < Date.parse(snapshot.roundStartsAt)) return snapshot;
  const expired = !snapshot.roundEndsAt || now >= Date.parse(snapshot.roundEndsAt);
  const allGuessed = snapshot.players.filter(p => !p.isEliminated).every(p => p.hasGuessedThisRound);
  if (!expired && !allGuessed) return snapshot;

  // Only resolution needs the session service and its transactional lock checks.
  const session = await GameSession.load(snapshot.currentSessionId);
  const resolved = await session?.resolveRoundIfNeeded() ?? false;
  const current = await roomSnapshot(roomId);
  if (resolved) onResolved?.(current);
  return current;
}

export async function joinRoom(roomId: string, name: unknown, token: string) {
  const newToken = randomBytes(32).toString('hex');
  const result = await db.$transaction(async tx => {
    const room = await lockRoom(tx, roomId);
    // A saved credential restores identity without changing names or creating duplicates.
    const existing = token ? await authenticate(tx, roomId, token, false) : null;
    if (existing && !existing.left_at) return { memberId: existing.id, credential: token };
    if (room.status !== 'waiting') throw new GameSessionError('Wait for the host to reopen the lobby', 409);
    const trimmed = existing?.name ?? (typeof name === 'string' ? name.trim() : '');
    if (!trimmed || trimmed.length > 32) throw new GameSessionError('Player name must be 1–32 characters');
    if (await tx.multiplayer_room_members.count({ where: { room_id: roomId, left_at: null } }) >= MAX_PLAYERS) {
      throw new GameSessionError(`Room is full (maximum ${MAX_PLAYERS} players)`, 409);
    }
    const member = existing
      ? await tx.multiplayer_room_members.update({ where: { id: existing.id }, data: { left_at: null, joined_at: new Date() } })
      : await tx.multiplayer_room_members.create({ data: { room_id: roomId, name: trimmed, credential_hash: hash(newToken) } });
    await tx.multiplayer_rooms.update({ where: { id: roomId }, data: {
      revision: { increment: 1 }, ...(room.host_member_id ? {} : { host_member_id: member.id }),
    } });
    return { memberId: member.id, credential: existing ? token : newToken };
  });
  return { ...await roomSnapshot(roomId), ...result };
}

export async function transitionRoom(roomId: string, action: string, token: string, expectedSessionId: unknown, targetMemberId?: unknown, options: { autoAdvanceRounds?: unknown; expectedRound?: unknown } = {}) {
  if (expectedSessionId !== null && !isUuid(expectedSessionId)) throw new GameSessionError('expectedSessionId is required');
  // Authorization is checked before potentially expensive artifact selection, then again under lock.
  const actor = await authenticate(db, roomId, token);
  if (action !== 'leave') {
    const room = await db.multiplayer_rooms.findUnique({ where: { id: roomId } });
    if (room?.host_member_id !== actor.id) throw new GameSessionError('Only the host can do this', 403);
  }
  const artifact = action === 'start' ? await pickRandomArtifact() : null;
  if (action === 'start' && !artifact) throw new GameSessionError('Could not find an artifact — try again', 503);
  await db.$transaction(async tx => {
    const room = await lockRoom(tx, roomId);
    const member = await authenticate(tx, roomId, token);
    if (action !== 'leave' && room.host_member_id !== member.id) throw new GameSessionError('Only the host can do this', 403);
    if (room.current_session_id !== expectedSessionId) throw new GameSessionError('Session changed; refresh the room', 409);
    if (action === 'settings') {
      if (room.status !== 'waiting') throw new GameSessionError('Settings can only change in the lobby', 409);
      if (typeof options.autoAdvanceRounds !== 'boolean') throw new GameSessionError('autoAdvanceRounds must be a boolean');
      await tx.multiplayer_rooms.update({ where: { id: roomId }, data: {
        auto_advance_rounds: options.autoAdvanceRounds, revision: { increment: 1 },
      } });
    } else if (action === 'next-round') {
      if (room.status !== 'active' || !room.current_session_id) throw new GameSessionError('Session is not active', 409);
      const games = await tx.$queryRaw<import('@prisma/client').multiplayer_games[]>`SELECT * FROM multiplayer_games WHERE id = ${room.current_session_id}::uuid FOR UPDATE`;
      const game = games[0];
      if (!Number.isInteger(options.expectedRound) || game.current_round !== options.expectedRound) throw new GameSessionError('Round changed; refresh the room', 409);
      if (!game.awaiting_host) throw new GameSessionError('Round is not waiting for the host', 409);
      const now = await databaseNow(tx);
      if (game.results_reveal_at && now < game.results_reveal_at) throw new GameSessionError('Results are not ready yet', 409);
      await tx.multiplayer_games.update({ where: { id: game.id }, data: {
        awaiting_host: false, round_starts_at: new Date(now.getTime() + 5000),
        round_ends_at: new Date(now.getTime() + 5000 + game.countdown_seconds * 1000),
        revision: { increment: 1 },
      } });
    } else if (action === 'reopen') {
      if (room.status === 'waiting') return;
      if (room.status !== 'finished') throw new GameSessionError('Session is still running', 409);
      await tx.multiplayer_rooms.update({ where: { id: roomId }, data: { status: 'waiting', revision: { increment: 1 } } });
    } else if (action === 'start') {
      if (room.status !== 'waiting') throw new GameSessionError('Room is not waiting', 409);
      const members = await tx.multiplayer_room_members.findMany({ where: { room_id: roomId, left_at: null } });
      if (members.length < 2 || members.length > MAX_PLAYERS) throw new GameSessionError('Need 2–20 players to start');
      const game = await tx.multiplayer_games.create({ data: {
        room_id: roomId, session_number: room.session_count + 1, status: 'active', current_round: 1,
        max_health: room.max_health, max_rounds: room.max_rounds, countdown_seconds: room.countdown_seconds,
        object_id: artifact!.objectId, artifact_iso3: artifact!.iso3, artifact_begin_year: artifact!.beginYear,
        artifact_end_year: artifact!.endYear, artifact_image_url: artifact!.imageUrl, artifact_title: artifact!.title,
        players: { create: members.map(m => ({ member_id: m.id, name: m.name, health: room.max_health, created_at: m.joined_at })) },
      } });
      // Schedule after roster creation so database work cannot consume the countdown.
      const now = await databaseNow(tx);
      await tx.multiplayer_games.update({ where: { id: game.id }, data: {
        round_starts_at: new Date(now.getTime() + 5000),
        round_ends_at: new Date(now.getTime() + 5000 + room.countdown_seconds * 1000),
      } });
      await tx.multiplayer_rooms.update({ where: { id: roomId }, data: {
        current_session_id: game.id, session_count: { increment: 1 }, status: 'active', revision: { increment: 1 },
      } });
    } else if (action === 'leave' || action === 'remove') {
      if (room.status !== 'waiting') throw new GameSessionError('Roster changes are allowed in the lobby', 409);
      const target = action === 'leave' ? member.id : targetMemberId;
      if (!isUuid(target)) throw new GameSessionError('Valid memberId is required');
      if (action === 'remove' && target === member.id) throw new GameSessionError('Use Leave Room to transfer hosting');
      const changed = await tx.multiplayer_room_members.updateMany({ where: { id: target, room_id: roomId, left_at: null }, data: { left_at: new Date() } });
      if (!changed.count) return;
      const nextHost = room.host_member_id === target ? await tx.multiplayer_room_members.findFirst({
        where: { room_id: roomId, left_at: null }, orderBy: [{ joined_at: 'asc' }, { id: 'asc' }],
      }) : null;
      await tx.multiplayer_rooms.update({ where: { id: roomId }, data: {
        revision: { increment: 1 }, ...(room.host_member_id === target ? { host_member_id: nextHost?.id ?? null } : {}),
      } });
    } else throw new GameSessionError('Unknown action', 404);
  });
  return roomSnapshot(roomId);
}

export async function authorizeGuess(gameId: string, token: string, playerId: string) {
  if (!isUuid(gameId) || !isUuid(playerId)) throw new GameSessionError('Invalid session or player ID');
  const game = await db.multiplayer_games.findUnique({ where: { id: gameId } });
  if (!game?.room_id) throw new GameSessionError('Session not found', 404);
  const [member, room] = await Promise.all([
    authenticate(db, game.room_id, token),
    db.multiplayer_rooms.findUnique({ where: { id: game.room_id } }),
  ]);
  if (room?.current_session_id !== gameId || room.status !== 'active') throw new GameSessionError('Session is no longer active', 409);
  const player = await db.multiplayer_players.findFirst({ where: { id: playerId, game_id: gameId, member_id: member.id } });
  if (!player) throw new GameSessionError('Player does not belong to this member', 403);
  return game.room_id;
}

export async function broadcastRoom(roomId: string, snapshot?: Awaited<ReturnType<typeof roomSnapshot>>) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Room broadcast environment is not configured');
    // Join responses include private identity fields; never send them to the room.
    const { credential: _credential, memberId: _memberId, ...payload } =
      (snapshot ?? await roomSnapshot(roomId)) as Awaited<ReturnType<typeof roomSnapshot>>
        & { credential?: string; memberId?: string };
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
      body: JSON.stringify({ messages: [{ topic: `room-${roomId}`, event: 'room_update', payload }] }),
    });
    if (!response.ok) throw new Error(`Broadcast failed: ${response.status}`);
  } catch (error) { console.error('[room broadcast]', error); }
}
