import { db } from '@/lib/db';
import { GameSession, GameSessionError } from './GameSession';
import { isUuid } from './Room';

export async function memberStatistics(roomId: string) {
  const members = await db.multiplayer_room_members.findMany({ where: { room_id: roomId }, orderBy: [{ joined_at: 'asc' }, { id: 'asc' }],
    include: { participations: { where: { completed_at: { not: null } }, select: { final_placement: true } } },
  });
  return members.map(m => {
    const placements: Record<string, number> = {};
    for (const p of m.participations) if (p.final_placement !== null) placements[p.final_placement] = (placements[p.final_placement] ?? 0) + 1;
    return { memberId: m.id, name: m.name, departed: m.left_at !== null,
      sessionsPlayed: m.participations.length, wins: placements[1] ?? 0, secondPlaces: placements[2] ?? 0,
      thirdPlaces: placements[3] ?? 0, placements,
      placementsUnavailable: m.participations.filter(p => p.final_placement === null).length };
  });
}

export async function sessionHistory(roomId: string, search: URLSearchParams) {
  const memberId = search.get('memberId');
  if (memberId && !isUuid(memberId)) throw new GameSessionError('Invalid member ID');
  const page = Number(search.get('page') ?? 1);
  const limit = Number(search.get('limit') ?? 10);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new GameSessionError('Invalid pagination');
  const where = { room_id: roomId, status: 'finished', ...(memberId ? { players: { some: { member_id: memberId } } } : {}) };
  const [sessions, total] = await db.$transaction([
    db.multiplayer_games.findMany({ where, orderBy: { session_number: 'desc' }, skip: (page - 1) * limit, take: limit,
      select: { id: true, session_number: true, completed_at: true, created_at: true,
        players: { select: { member_id: true, name: true, final_placement: true } } } }),
    db.multiplayer_games.count({ where }),
  ]);
  return { page, limit, total, sessions: sessions.map(s => ({ sessionId: s.id, sessionNumber: s.session_number,
    completedAt: s.completed_at, createdAt: s.created_at, participantCount: s.players.length,
    winners: s.players.filter(p => p.final_placement === 1).map(p => ({ memberId: p.member_id, name: p.name })),
    placementsAvailable: s.players.every(p => p.final_placement !== null) })) };
}

export async function sessionDetails(roomId: string, sessionId: string) {
  if (!isUuid(roomId) || !isUuid(sessionId)) throw new GameSessionError('Invalid room or session ID');
  const game = await db.multiplayer_games.findFirst({ where: { id: sessionId, room_id: roomId, status: 'finished' } });
  if (!game) throw new GameSessionError('Completed session not found', 404);
  const session = await GameSession.load(sessionId);
  const state = session!.getStatus();
  return { ...state, roomId, sessionNumber: game.session_number, completedAt: game.completed_at,
    standings: [...state.players].sort((a, b) => (a.finalPlacement ?? Infinity) - (b.finalPlacement ?? Infinity)),
    placementsAvailable: state.players.every(p => p.finalPlacement !== null) };
}
