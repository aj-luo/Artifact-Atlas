'use client'
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function RoomHistory({ roomId, revision }) {
  const [tab, setTab] = useState(null);
  const [members, setMembers] = useState([]);
  const [history, setHistory] = useState(null);
  const [memberId, setMemberId] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!tab) return;
    const controller = new AbortController();
    setError('');
    const get = async path => {
      const res = await fetch(path, { signal: controller.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unable to load room history');
      return data;
    };
    Promise.all([
      get(`/api/rooms/${roomId}/statistics`),
      get(`/api/rooms/${roomId}/sessions?page=${page}&memberId=${memberId}`),
    ]).then(([stats, sessions]) => { setMembers(stats.members); setHistory(sessions); })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [roomId, tab, memberId, page, revision]);
  return <section className="br-room-history">
    <div className="br-room-tabs" aria-label="Room history">
      <button className="br-history-button" aria-expanded={tab === 'standings'} onClick={() => setTab(tab === 'standings' ? null : 'standings')}>Room Standings</button>
      <button className="br-history-button" aria-expanded={tab === 'sessions'} onClick={() => setTab(tab === 'sessions' ? null : 'sessions')}>Sessions</button>
    </div>
    {error && <p className="br-error" role="alert">{error}</p>}
    {tab === 'standings' && <div className="br-room-table-wrap"><table className="br-room-table">
      <caption>Room Standings</caption>
      <thead><tr><th>Player</th><th>Played</th><th>Wins</th><th>2nd</th><th>3rd</th><th>Other placements</th></tr></thead>
      <tbody>{[...members].sort((a, b) => b.wins - a.wins || b.secondPlaces - a.secondPlaces || b.thirdPlaces - a.thirdPlaces).map(m => <tr key={m.memberId}>
        <td><button className="br-history-button" onClick={() => { setMemberId(m.memberId); setPage(1); setTab('sessions'); }}>{m.name}</button>{m.departed && ' (left)'}</td>
        <td>{m.sessionsPlayed}</td><td>{m.wins}</td><td>{m.secondPlaces}</td><td>{m.thirdPlaces}</td>
        <td>{Object.entries(m.placements).filter(([place]) => Number(place) > 3).map(([place, count]) => `#${place}: ${count}`).join(', ') || '—'}{m.placementsUnavailable > 0 && ` · Unavailable: ${m.placementsUnavailable}`}</td>
      </tr>)}</tbody>
    </table>{members.length === 0 && <p>No members yet.</p>}</div>}
    {tab === 'sessions' && <div className="br-room-sessions">
      <h2>Sessions</h2>
      <label>Filter by player <select className="br-input" value={memberId} onChange={e => { setMemberId(e.target.value); setPage(1); }}>
        <option value="">All players</option>
        {members.map(m => <option key={m.memberId} value={m.memberId}>{m.name}{m.departed ? ' (left)' : ''}</option>)}
      </select></label>
      {history?.sessions.map(s => <Link className="br-session-link" key={s.sessionId} href={`/battle-royale/${roomId}/sessions/${s.sessionId}`}>
        <strong>Session {s.sessionNumber}</strong>
        <span>{new Date(s.completedAt ?? s.createdAt).toLocaleString()} · {s.participantCount} players</span>
        <span>{s.winners.length ? `${s.winners.length > 1 ? 'Joint winners' : 'Winner'}: ${s.winners.map(w => w.name).join(', ')}` : 'Placements unavailable'}</span>
      </Link>)}
      {history?.total === 0 && <p>No completed sessions yet.</p>}
      {!history && !error && <p>Loading sessions…</p>}
      {history && history.total > history.limit && <div className="br-room-tabs">
        <button className="br-history-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {Math.ceil(history.total / history.limit)}</span>
        <button className="br-history-button" disabled={page * history.limit >= history.total} onClick={() => setPage(page + 1)}>Next</button>
      </div>}
    </div>}
  </section>;
}
