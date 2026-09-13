import { createHash, randomBytes } from 'node:crypto';
import { Prisma, type multiplayer_rooms } from '@prisma/client';
import { db } from '@/lib/db';
import { pickRandomArtifact } from '@/lib/artifactSelector';
import { GameSession, GameSessionError, MAX_PLAYERS } from './GameSession';

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
  // The revision and all associated rows must come from the same database snapshot.
  return db.$transaction(async tx => {
    const room = await tx.multiplayer_rooms.findUnique({ where: { id: roomId } });
    if (!room) throw new GameSessionError('Room not found', 404);
    const members = await tx.multiplayer_room_members.findMany({ where: { room_id: roomId, left_at: null }, orderBy: [{ joined_at: 'asc' }, { id: 'asc' }] });
    const session = room.current_session_id ? await GameSession.load(room.current_session_id, tx) : null;
    const state = session?.getStatus();
    return {
      ...state, roomId, gameId: room.current_session_id, currentSessionId: room.current_session_id,
      sessionNumber: room.session_count, revision: room.revision, serverTime: new Date().toISOString(),
      status: room.status, hostMemberId: room.host_member_id,
      hostId: room.status === 'waiting' ? room.host_member_id : state?.players.find(p => p.memberId === room.host_member_id)?.id ?? null,
      maxRounds: room.max_rounds, maxHealth: room.max_health, countdownSeconds: room.countdown_seconds,
      members: members.map(m => ({ id: m.id, name: m.name })),
      players: room.status === 'waiting' ? members.map(m => ({ id: m.id, memberId: m.id, name: m.name, health: room.max_health, isEliminated: false })) : state?.players ?? [],
      ...(room.status === 'waiting' ? { currentRound: 0, roundStartsAt: null, roundEndsAt: null, currentArtifact: null, lastRoundReveal: null, roundHistory: [] } : {}),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function roomStatus(roomId: string, onResolved?: (snapshot: Awaited<ReturnType<typeof roomSnapshot>>) => void) {
  if (!isUuid(roomId)) throw new GameSessionError('Invalid room ID');
  const room = await db.multiplayer_rooms.findUnique({ where: { id: roomId } });
  if (!room) throw new GameSessionError('Room not found', 404);
  let resolved = false;
  if (room.status === 'active' && room.current_session_id) {
    const session = await GameSession.load(room.current_session_id);
    resolved = await session?.resolveRoundIfNeeded() ?? false;
  }
  const snapshot = await roomSnapshot(roomId);
  if (resolved) onResolved?.(snapshot);
  return snapshot;
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

export async function transitionRoom(roomId: string, action: string, token: string, expectedSessionId: unknown, targetMemberId?: unknown) {
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
    if (action === 'reopen') {
      if (room.status === 'waiting') return;
      if (room.status !== 'finished') throw new GameSessionError('Session is still running', 409);
      await tx.multiplayer_rooms.update({ where: { id: roomId }, data: { status: 'waiting', revision: { increment: 1 } } });
    } else if (action === 'start') {
      if (room.status !== 'waiting') throw new GameSessionError('Room is not waiting', 409);
      const members = await tx.multiplayer_room_members.findMany({ where: { room_id: roomId, left_at: null } });
      if (members.length < 2 || members.length > MAX_PLAYERS) throw new GameSessionError('Need 2–20 players to start');
      const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const game = await tx.multiplayer_games.create({ data: {
        room_id: roomId, session_number: room.session_count + 1, status: 'active', current_round: 1,
        max_health: room.max_health, max_rounds: room.max_rounds, countdown_seconds: room.countdown_seconds,
        object_id: artifact!.objectId, artifact_iso3: artifact!.iso3, artifact_begin_year: artifact!.beginYear,
        artifact_end_year: artifact!.endYear, artifact_image_url: artifact!.imageUrl, artifact_title: artifact!.title,
        round_starts_at: now, round_ends_at: new Date(now.getTime() + room.countdown_seconds * 1000),
        players: { create: members.map(m => ({ member_id: m.id, name: m.name, health: room.max_health, created_at: m.joined_at })) },
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
    if (!url || !key) return;
    const payload = snapshot ?? await roomSnapshot(roomId);
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
      body: JSON.stringify({ messages: [{ topic: `room-${roomId}`, event: 'room_update', payload }] }),
    });
    if (!response.ok) throw new Error(`Broadcast failed: ${response.status}`);
  } catch (error) { console.error('[room broadcast]', error); }
}
