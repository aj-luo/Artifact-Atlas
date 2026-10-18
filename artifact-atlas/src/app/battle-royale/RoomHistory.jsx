'use client'

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

async function getRoomData(path, signal) {
  const response = await fetch(path, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Unable to load room history');
  return data;
}

export default function RoomHistory({ roomId, revision, onOpenRoundHistory }) {
  const [tab, setTab] = useState(null);
  const [members, setMembers] = useState(null);
  const [history, setHistory] = useState(null);
  const [memberId, setMemberId] = useState('');
  const [page, setPage] = useState(1);
  const [statsError, setStatsError] = useState('');
  const [sessionsError, setSessionsError] = useState('');
  const panelRef = useRef(null);
  const titleRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!tab) return;
    const controller = new AbortController();
    setMembers(null);
    setStatsError('');
    getRoomData(`/api/rooms/${roomId}/statistics`, controller.signal)
      .then(data => setMembers(data.members))
      .catch(error => { if (error.name !== 'AbortError') setStatsError(error.message); });
    return () => controller.abort();
  }, [roomId, revision, Boolean(tab)]);

  useEffect(() => {
    if (tab !== 'sessions') return;
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page) });
    if (memberId) query.set('memberId', memberId);
    setHistory(null);
    setSessionsError('');
    getRoomData(`/api/rooms/${roomId}/sessions?${query}`, controller.signal)
      .then(setHistory)
      .catch(error => { if (error.name !== 'AbortError') setSessionsError(error.message); });
    return () => controller.abort();
  }, [roomId, revision, tab, memberId, page]);

  useEffect(() => {
    if (!tab) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setTab(null);
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll('a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); titleRef.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [Boolean(tab)]);

  useEffect(() => { if (tab) titleRef.current?.focus(); }, [tab]);

  const open = (nextTab, event) => {
    triggerRef.current = event.currentTarget;
    setTab(nextTab);
  };
  const sortedMembers = [...(members ?? [])].sort((a, b) =>
    b.wins - a.wins || b.secondPlaces - a.secondPlaces || b.thirdPlaces - a.thirdPlaces);

  return <section className="br-room-history" aria-label="Room history">
    <div className="br-room-tabs">
      {onOpenRoundHistory && <button className="br-history-button" onClick={onOpenRoundHistory}>History</button>}
      <button className="br-history-button" aria-haspopup="dialog" aria-expanded={tab === 'standings'} onClick={event => open('standings', event)}>Room Standings</button>
      <button className="br-history-button" aria-haspopup="dialog" aria-expanded={tab === 'sessions'} onClick={event => open('sessions', event)}>Sessions</button>
    </div>
    {tab && createPortal(
      <div className="br-history-overlay br-room-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setTab(null); }}>
        <div className="br-history-panel br-room-panel" role="dialog" aria-modal="true" aria-labelledby="br-room-dialog-title" ref={panelRef}>
          <div className="br-history-header">
            <h2 id="br-room-dialog-title" tabIndex={-1} ref={titleRef}>{tab === 'standings' ? 'Room Standings' : 'Sessions'}</h2>
            <button className="br-history-close" onClick={() => setTab(null)} aria-label={`Close ${tab}`}>×</button>
          </div>
          <div className="br-room-popup-tabs" aria-label="Room history views">
            <button className="br-history-button" aria-pressed={tab === 'standings'} onClick={() => setTab('standings')}>Standings</button>
            <button className="br-history-button" aria-pressed={tab === 'sessions'} onClick={() => setTab('sessions')}>Sessions</button>
          </div>
          <div className="br-history-list br-room-popup-content" key={tab}>
            {tab === 'standings' && <>
              {members === null && !statsError && <p className="br-history-status" role="status">Loading standings…</p>}
              {statsError && <p className="br-error" role="alert">{statsError}</p>}
              {members?.length === 0 && <p className="br-history-empty">No members yet.</p>}
              {sortedMembers.map((member, index) => {
                const placements = Object.entries(member.placements ?? {})
                  .filter(([place]) => Number(place) > 3)
                  .sort(([a], [b]) => Number(a) - Number(b));
                const played = Math.max(member.sessionsPlayed, 1);
                return <article className="br-standing-card" key={member.memberId} style={{ '--card-index': index }}>
                  <div className="br-standing-heading">
                    <span className={`br-standing-rank br-standing-rank-${Math.min(index + 1, 4)}`} aria-label={`Rank ${index + 1}`}>#{index + 1}</span>
                    <div className="br-standing-player"><strong>{member.name}</strong>{member.departed && <span className="br-standing-departed">Left room</span>}</div>
                    <button className="br-history-button br-standing-sessions" onClick={() => { setMemberId(member.memberId); setPage(1); setTab('sessions'); }}>View sessions<span aria-hidden="true"> →</span></button>
                  </div>
                  <div className="br-standing-metrics" aria-label={`${member.sessionsPlayed} played, ${member.wins} wins, ${member.secondPlaces} second places, ${member.thirdPlaces} third places`}>
                    <span><strong>{member.sessionsPlayed}</strong>Played</span>
                    <span><strong>{member.wins}</strong>Wins</span>
                    <span><strong>{member.secondPlaces}</strong>2nd</span>
                    <span><strong>{member.thirdPlaces}</strong>3rd</span>
                  </div>
                  {member.sessionsPlayed > 0 && <div className="br-placement-bar" aria-hidden="true">
                    <span className="br-placement-win" style={{ width: `${member.wins / played * 100}%` }} />
                    <span className="br-placement-second" style={{ width: `${member.secondPlaces / played * 100}%` }} />
                    <span className="br-placement-third" style={{ width: `${member.thirdPlaces / played * 100}%` }} />
                    <span className="br-placement-other" style={{ width: `${placements.reduce((sum, [, count]) => sum + count, 0) / played * 100}%` }} />
                    <span className="br-placement-unavailable" style={{ width: `${member.placementsUnavailable / played * 100}%` }} />
                  </div>}
                  {(placements.length > 0 || member.placementsUnavailable > 0) && <p className="br-standing-other">
                    {placements.map(([place, count]) => <span key={place}>#{place}: {count}</span>)}
                    {member.placementsUnavailable > 0 && <span>Unavailable: {member.placementsUnavailable}</span>}
                  </p>}
                </article>;
              })}
            </>}
            {tab === 'sessions' && <>
              <label className="br-session-filter">Filter by player
                <select className="br-input" value={memberId} onChange={event => { setMemberId(event.target.value); setPage(1); }}>
                  <option value="">All players</option>
                  {members?.map(member => <option key={member.memberId} value={member.memberId}>{member.name}{member.departed ? ' (left)' : ''}</option>)}
                  {memberId && !members?.some(member => member.memberId === memberId) && <option value={memberId}>Selected player</option>}
                </select>
              </label>
              {statsError && <p className="br-error" role="alert">Unable to load player filter: {statsError}</p>}
              {history === null && !sessionsError && <p className="br-history-status" role="status">Loading sessions…</p>}
              {sessionsError && <p className="br-error" role="alert">{sessionsError}</p>}
              {history?.sessions.map((session, index) => <Link className="br-session-link br-session-card" style={{ '--card-index': index }} key={session.sessionId} href={`/battle-royale/${roomId}/sessions/${session.sessionId}`}>
                <span className="br-session-card-top"><strong>Session {session.sessionNumber}</strong><span aria-hidden="true">↗</span></span>
                <span className="br-session-card-meta"><span>{new Date(session.completedAt ?? session.createdAt).toLocaleString()}</span><span>{session.participantCount} {session.participantCount === 1 ? 'player' : 'players'}</span></span>
                <span className="br-session-card-winner">{session.winners.length ? `${session.winners.length > 1 ? 'Joint winners' : 'Winner'}: ${session.winners.map(winner => winner.name).join(', ')}` : 'Placements unavailable'}</span>
              </Link>)}
              {history?.total === 0 && <p className="br-history-empty">{memberId ? 'No completed sessions for this player.' : 'No completed sessions yet.'}</p>}
              {history && history.total > history.limit && <div className="br-room-pagination">
                <button className="br-history-button" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>Previous</button>
                <span>Page {page} of {Math.ceil(history.total / history.limit)}</span>
                <button className="br-history-button" disabled={page * history.limit >= history.total} onClick={() => setPage(current => current + 1)}>Next</button>
              </div>}
            </>}
          </div>
        </div>
      </div>, document.body)}
  </section>;
}
