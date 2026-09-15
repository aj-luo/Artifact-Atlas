'use client'
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import RoundResultCard from '../../../RoundResultCard';
import '../../../battleRoyale.css';

export default function HistoricalSession() {
  const { gameId: roomId, sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [memberId, setMemberId] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setSession(null);
    setError('');
    try { setMemberId(JSON.parse(localStorage.getItem(`br_member_${roomId}`) ?? 'null')?.memberId ?? ''); } catch { /* No saved identity. */ }
    fetch(`/api/rooms/${roomId}/sessions/${sessionId}`, { signal: controller.signal })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); return data; })
      .then(setSession).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [roomId, sessionId]);
  const playerId = session?.players.find(p => p.memberId === memberId)?.id;
  const winners = session?.standings.filter(p => p.finalPlacement === 1) ?? [];
  return <main className="br-page"><div className="br-session-detail">
    <Link className="br-history-button" href={`/battle-royale/${roomId}`}>Back to live room</Link>
    {error ? <p className="br-error" role="alert">{error}</p> : !session ? <p>Loading session…</p> : <>
      <h1>Session {session.sessionNumber}</h1>
      <p>{session.completedAt && new Date(session.completedAt).toLocaleString()}</p>
      <h2>{winners.length ? `${winners.length > 1 ? 'Joint winners' : 'Winner'}: ${winners.map(p => p.name).join(', ')}` : 'Placements unavailable'}</h2>
      {!session.placementsAvailable && <p>This legacy session has incomplete survival history. Unavailable placements are excluded from placement statistics.</p>}
      <div className="br-room-table-wrap"><table className="br-room-table"><caption>Session standings</caption>
        <thead><tr><th>Place</th><th>Player</th><th>HP</th><th>Total score</th><th>Eliminated in round</th></tr></thead>
        <tbody>{session.standings.map(p => <tr key={p.id}><td>{p.finalPlacement ?? 'Unavailable'}</td><td>{p.name}</td><td>{p.health.toLocaleString()}</td><td>{p.cumulativeScore.toLocaleString()}</td><td>{p.eliminationRound ?? (p.isEliminated ? 'Unavailable' : 'Survived')}</td></tr>)}</tbody>
      </table></div>
      <h2>Round Results</h2>
      {session.roundHistory.length < session.currentRound && <p>Some round breakdowns are unavailable for this legacy session.</p>}
      {session.roundHistory.map(round => <RoundResultCard key={round.round} round={round} playerId={playerId} history />)}
    </>}
  </div></main>;
}
