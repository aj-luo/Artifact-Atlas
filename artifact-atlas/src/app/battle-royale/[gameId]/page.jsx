'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import ReactFlagsSelect from "react-flags-select";
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
import HistorySlider from '../../../HistorySlider/HistorySlider.jsx';
import { supabase } from '../../../lib/supabaseClient';
import { estimateServerClockOffset, getRecoveryPollInterval, getRoomPhase, shouldApplyRoomSnapshot } from './snapshotSync.js';
import '../battleRoyale.css';
import RoundResultCard from '../RoundResultCard';
import RoomHistory from '../RoomHistory';

countries.registerLocale(enLocale);
const omittedCountries = ['AS', 'IO', 'CW', 'GG', 'GU', 'IM', 'JE', 'PS', 'SX', 'VI', 'AX', 'XK'];
const allowedCountries = Object.keys(countries.getNames('en')).filter(c => !omittedCountries.includes(c));

const MEDALS = ['🥇', '🥈', '🥉'];

const formatYear = (y) => {
  if (y == null) return '?';
  return y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`;
};

export default function BattleRoyaleRoom() {
  const { gameId } = useParams();
  const router = useRouter();
  const roomIdRef = useRef(gameId);
  roomIdRef.current = gameId;
  const [gameState, setGameState] = useState(null);
  const [identity, setIdentity] = useState(null);
  const memberId = identity?.memberId;
  const isMember = !!gameState?.members?.some(m => m.id === memberId);
  const playerId = gameState?.players?.find(p => p.memberId === memberId)?.id ?? '';
  const isHost = isMember && memberId === gameState?.hostMemberId;
  const [playerName, setPlayerName] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const [selectedCountry, setSelectedCountry] = useState('');
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [yearInput, setYearInput] = useState(String(currentYear));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pendingGuessRef = useRef(null);
  const statusRequestRef = useRef(null);
  const lastExpiryRequestRef = useRef(-Infinity);
  const [, tickPhase] = useState(0);
  const submissionScope = `${gameId}:${gameState?.currentSessionId}:${gameState?.currentRound}:${gameState?.status}`;
  const submissionScopeRef = useRef(submissionScope);
  submissionScopeRef.current = submissionScope;
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const debounceRef = useRef(null);
  const latestRevisionRef = useRef(-1);
  const serverClockOffsetRef = useRef(0);
  const bestClockRoundTripRef = useRef(Infinity);
  const phase = getRoomPhase(gameState, Date.now() + serverClockOffsetRef.current);
  const { revealPending, timeRemaining } = phase;
  const intermission = { ...phase, phase: phase.phase === 'playing' ? 'none' : phase.phase };
  const [channelStatus, setChannelStatus] = useState('CONNECTING');
  const [copied, setCopied] = useState(false);

  useEffect(() => () => { pendingGuessRef.current = null; }, []);

  useEffect(() => {
    latestRevisionRef.current = -1;
    bestClockRoundTripRef.current = Infinity;
    serverClockOffsetRef.current = 0;
    setGameState(null);
    setStatusError(null);
    try {
      const saved = JSON.parse(localStorage.getItem(`br_member_${gameId}`) ?? 'null');
      setIdentity(saved);
      if (saved?.name) setPlayerName(saved.name);
    } catch { setIdentity(null); }
  }, [gameId]);

  // The server advances to the next artifact before the intermission begins.
  // Warm the browser cache while results are visible so the image is ready
  // underneath the blurred countdown.
  useEffect(() => {
    const imageUrl = gameState?.currentArtifact?.imageUrl;
    if (!imageUrl) return;
    const image = new Image();
    image.src = imageUrl;
  }, [gameState?.currentArtifact?.imageUrl]);

  // All state sources use the same monotonic revision gate. serverTime also
  // aligns the countdown without trusting the device's wall clock.
  const applySnapshot = useCallback((data, requestedAt = null, receivedAt = null, processingMs = 0) => {
    if (!shouldApplyRoomSnapshot(latestRevisionRef.current, data, roomIdRef.current)) return false;

    latestRevisionRef.current = data.revision;
    // Only an HTTP request/response midpoint can distinguish clock skew from
    // network delay. A delayed broadcast must not move the estimated clock.
    // A slow mutation includes server processing time; prefer the least-delayed
    // sample so it cannot shift one player's shared reveal clock.
    if (data.serverTime && requestedAt != null && receivedAt != null
      && receivedAt - requestedAt <= bestClockRoundTripRef.current) {
      bestClockRoundTripRef.current = receivedAt - requestedAt;
      serverClockOffsetRef.current = estimateServerClockOffset(data.serverTime, requestedAt, receivedAt, processingMs);
    }
    setStatusError(null);
    setGameState(data);
    return true;
  }, [gameId]);

  // Clear all session-local input and overlays after a rematch or reconnect.
  useEffect(() => {
    setSelectedCountry('');
    setSelectedYear(new Date().getFullYear());
    setYearInput(String(new Date().getFullYear()));
    setIsSubmitting(false);
    pendingGuessRef.current = null;
    setIsHistoryOpen(false);
  }, [gameState?.currentSessionId, gameState?.status, gameState?.currentRound]);

  // Stable callback — only recreated when gameId changes
  const fetchStatus = useCallback(async () => {
    if (statusRequestRef.current?.roomId === gameId) {
      statusRequestRef.current.queued = true;
      return;
    }
    const request = { roomId: gameId, queued: false };
    statusRequestRef.current = request;
    do {
      request.queued = false;
      const requestedRevision = latestRevisionRef.current;
      try {
        const requestedAt = Date.now();
        const res = await fetch(`/api/rooms/${gameId}/status`);
        if (res.ok) {
          const data = await res.json();
          applySnapshot(data, requestedAt, Date.now(), Number(res.headers.get('X-Room-Processing-Ms') ?? 0));
        } else if (roomIdRef.current === gameId && latestRevisionRef.current === requestedRevision) {
          setStatusError('Unable to refresh room. Reconnecting…');
        }
      } catch (err) {
        console.error('Status fetch error', err);
        if (roomIdRef.current === gameId && latestRevisionRef.current === requestedRevision) {
          setStatusError('Unable to refresh room. Reconnecting…');
        }
      }
    } while (request.queued && roomIdRef.current === gameId);
    if (statusRequestRef.current === request) statusRequestRef.current = null;
  }, [gameId, applySnapshot]);

  // Batch rapid game-row invalidations into one status request.
  const debouncedFetchStatus = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchStatus, 50);
  }, [fetchStatus]);

  // Supabase realtime channel — broadcast (fast path) + postgres_changes (fallback)
  useEffect(() => {
    void fetchStatus();

    const channel = supabase
      .channel(`room-${gameId}`)
      // Broadcast: full game state delivered by the server directly after each mutation,
      // no HTTP round-trip needed on the client side.
      .on('broadcast', { event: 'room_update' }, ({ payload }) => {
        applySnapshot(payload);
      })
      // postgres_changes: safety fallback for any broadcast misses
      .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplayer_rooms', filter: `id=eq.${gameId}` }, debouncedFetchStatus)
      .subscribe((status) => {
        setChannelStatus(status);
        if (status === 'SUBSCRIBED') void fetchStatus();
      });

    return () => {
      supabase.removeChannel(channel);
      clearTimeout(debounceRef.current);
    };
  }, [gameId, fetchStatus, debouncedFetchStatus, applySnapshot]);

  // Recover missed broadcasts within five seconds; transitions and errors stay eager.
  useEffect(() => {
    const interval = setInterval(fetchStatus, getRecoveryPollInterval(channelStatus, statusError, phase.phase));
    return () => clearInterval(interval);
  }, [channelStatus, statusError, phase.phase, fetchStatus]);

  // Recover immediately after a disconnected device or background tab returns.
  useEffect(() => {
    const handleOnline = () => void fetchStatus();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void fetchStatus();
    };
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchStatus]);

  // Recompute directly from timestamps, including after background-tab throttling.
  useEffect(() => {
    if (gameState?.status !== 'active' && !revealPending) return;
    const update = () => {
      tickPhase(value => value + 1);
      const current = getRoomPhase(gameState, Date.now() + serverClockOffsetRef.current);
      if (current.timeRemaining === 0 && Date.now() - lastExpiryRequestRef.current >= 2000) {
        lastExpiryRequestRef.current = Date.now();
        void fetchStatus();
      }
    };
    const timer = setInterval(update, 25);
    return () => clearInterval(timer);
  }, [gameState, revealPending, fetchStatus]);

  const authHeaders = { 'Content-Type': 'application/json', ...(identity?.credential ? { Authorization: `Bearer ${identity.credential}` } : {}) };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    setIsJoining(true);
    try {
      const res = await fetch(`/api/rooms/${gameId}/join`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: playerName }),
      });
      if (res.ok) {
        const data = await res.json();
        const saved = { memberId: data.memberId, credential: data.credential, name: playerName };
        setIdentity(saved);
        localStorage.setItem(`br_member_${gameId}`, JSON.stringify(saved));
        applySnapshot(data);
        setStartError(null);
      } else { setStartError((await res.json()).error ?? 'Unable to join room'); }
    } catch { setStartError('Unable to join room'); }
    setIsJoining(false);
  };

  const roomAction = async (action, targetMemberId, settings = {}) => {
    setIsStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`/api/rooms/${gameId}/${action}`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ expectedSessionId: gameState.currentSessionId, memberId: targetMemberId, expectedRound: gameState.currentRound, ...settings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unable to update room');
      applySnapshot(data);
    } catch (error) { setStartError(error.message); }
    finally { setIsStarting(false); }
  };
  const handleStart = () => roomAction('start');

  const handleYearInputChange = (e) => {
    setYearInput(e.target.value);
    const parsed = parseInt(e.target.value, 10);
    if (!isNaN(parsed) && parsed >= -3000 && parsed <= currentYear) setSelectedYear(parsed);
  };

  const handleSliderChange = (year) => {
    setSelectedYear(year);
    setYearInput(String(year));
  };

  const submitGuess = async () => {
    if (!playerId || !selectedCountry || pendingGuessRef.current) return;
    const serverNow = Date.now() + serverClockOffsetRef.current;
    if (!getRoomPhase(gameState, serverNow).canGuess) return;
    const alpha3 = countries.alpha2ToAlpha3(selectedCountry);
    if (!alpha3) return;
    const pending = { scope: submissionScope };
    pendingGuessRef.current = pending;
    setIsSubmitting(true);
    setStartError(null);
    try {
      const requestedAt = Date.now();
      const res = await fetch(`/api/multiplayer/${gameState.currentSessionId}/guess`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ playerId, country: alpha3, year: selectedYear, roundNumber: gameState.currentRound }),
      });
      if (pendingGuessRef.current !== pending || submissionScopeRef.current !== pending.scope) return;
      // Apply the full game state from the response immediately (score + post-resolution state)
      // so the UI updates within network RTT rather than waiting for the next poll.
      if (res.ok) {
        const data = await res.json();
        applySnapshot(data, requestedAt, Date.now());
      } else {
        // Accept an attached snapshot when available, then recover current state.
        const data = await res.json().catch(() => null);
        if (pendingGuessRef.current !== pending || submissionScopeRef.current !== pending.scope) return;
        if (data?.revision != null) applySnapshot(data);
        setStartError(data?.error ?? 'Guess was not accepted');
        void fetchStatus();
      }
    } catch (err) {
      console.error(err);
      if (pendingGuessRef.current === pending && submissionScopeRef.current === pending.scope) {
        setStartError('Unable to confirm your guess. Reconnecting…');
        void fetchStatus();
      }
    } finally {
      if (pendingGuessRef.current === pending) {
        pendingGuessRef.current = null;
        setIsSubmitting(false);
      }
    }
  };

  // ── Lobby ──────────────────────────────────────────────────────────────────────

  const renderLobby = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const handleCopyLink = () =>
      navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    const handleCopyCode = () =>
      navigator.clipboard.writeText(gameId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });

    return (
      <div className="br-lobby">
        <div className="br-lobby-share">
          <div className="br-qr">
            <QRCodeSVG value={url} size={160} bgColor="#ffffff" fgColor="#000000" />
          </div>
          <div className="br-lobby-codes">
            <p className="br-share-label">Share this code</p>
            <button className="br-game-code" onClick={handleCopyCode} title="Click to copy">
              {gameId}
            </button>
            <div className="br-invite-link">
              <input className="br-input" readOnly value={url} onClick={e => e.target.select()} />
              <button className="br-btn br-btn-secondary" onClick={handleCopyLink}>
                {copied ? 'COPIED!' : 'COPY LINK'}
              </button>
            </div>
          </div>
        </div>

        <div className="br-players-list">
          <h4>Players ({gameState.players.length})</h4>
          <ul>
            {gameState.players.map((p, i) => (
              <li key={p.id} className="br-player-row">
                <span className="br-player-num">{i + 1}</span>
                <span className="br-player-name">{p.name}</span>
                <span className="br-player-tags">
                  {p.id === playerId && <span className="br-you-tag">you</span>}
                  {p.id === gameState.hostId && <span className="br-host-tag">👑 host</span>}
                  {isHost && p.memberId !== memberId && <button className="br-history-button" disabled={isStarting} onClick={() => roomAction('remove', p.memberId)}>Remove</button>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {typeof gameState.autoAdvanceRounds === 'boolean' && <div className="br-input-group">
          <label><input type="checkbox" checked={gameState.autoAdvanceRounds ?? true} disabled={!isHost || isStarting}
            onChange={e => roomAction('settings', undefined, { autoAdvanceRounds: e.target.checked })} /> Auto-advance rounds</label>
          <small>{gameState.autoAdvanceRounds === false ? 'The host starts each next round after results.' : 'The next round starts automatically after results.'}</small>
        </div>}

        {gameState.players.length >= 2
          ? isHost
            ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '100%', maxWidth: '300px' }}>
                {startError && <p className="br-start-error">{startError}</p>}
                <button className="br-btn br-btn-primary" onClick={handleStart} disabled={isStarting}>
                  {isStarting ? 'STARTING…' : 'START GAME'}
                </button>
              </div>
            )
            : <p className="br-waiting-msg">Waiting for host to start…</p>
          : <p className="br-waiting-msg">Waiting for more players to join…</p>
        }
      </div>
    );
  };

  // ── Active Game ────────────────────────────────────────────────────────────────

  const renderActive = () => {
    const me = gameState.players.find(p => p.id === playerId);
    const activePlayers = gameState.players.filter(p => !p.isEliminated);
    const guessedCount = activePlayers.filter(p => p.hasGuessedThisRound).length;
    const isIntermission = intermission.phase !== 'none';

    return (
      <div className="br-active-game">
        <div className={`br-active-content ${intermission.phase === 'countdown' ? 'is-countdown-blurred' : ''} ${isIntermission ? 'is-intermission' : ''}`}>
        <div className="br-top-bar">
          <div className="br-round-info">Round {gameState.currentRound} / {gameState.maxRounds}</div>
          <div className="br-guess-count">{guessedCount} / {activePlayers.length} guessed</div>
          <button className="br-history-button" onClick={() => setIsHistoryOpen(true)}>History</button>
          {!isIntermission && timeRemaining !== null && (
            <div className={`br-timer ${timeRemaining < 10 ? 'urgent' : ''}`}>{timeRemaining}s</div>
          )}
        </div>

        <div className="br-game-body">
          {intermission.phase === 'results' && gameState.lastRoundReveal ? (
            <div className="br-round-results">
              <RoundResultCard round={gameState.lastRoundReveal} playerId={playerId} />
              {gameState.awaitingHost && (isHost
                ? <button className="br-btn br-btn-primary" disabled={isStarting} onClick={() => roomAction('next-round')}>
                    {isStarting ? 'STARTING…' : 'NEXT ROUND'}
                  </button>
                : <p className="br-waiting-msg">Waiting for the host to start the next round…</p>)}
            </div>
          ) : <>
          {/* Artifact pane */}
          <div className="br-artifact-pane">
            {
              gameState.currentArtifact && (
                <div className="br-artifact-container">
                  <img src={gameState.currentArtifact.imageUrl} alt="Artifact" className="br-artifact-img" />
                </div>
              )
            }
          </div>

          {/* Controls + health bars pane */}
          <div className="br-controls-pane" inert={isIntermission}>
            {!me ? <div className="br-waiting">Spectating this session</div> : me?.isEliminated ? (
              <div className="br-eliminated">You were eliminated. Spectating…</div>
            ) : !isIntermission && timeRemaining === 0 ? (
              <div className="br-waiting">Time’s up — loading results…</div>
            ) : me?.hasGuessedThisRound ? (
              <div className="br-waiting">Guess submitted — waiting for others…</div>
            ) : (
              <fieldset className="br-guess-panel" disabled={isSubmitting} inert={isSubmitting} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                <p className="br-guess-prompt">Where is this artifact from?</p>
                <ReactFlagsSelect
                  selected={selectedCountry}
                  onSelect={setSelectedCountry}
                  countries={allowedCountries}
                  placeholder="Select Country"
                  searchable
                  className="br-flag-select"
                />
                <div className="br-year-row">
                  <span className="br-year-display">{formatYear(selectedYear)}</span>
                  <input
                    type="number"
                    value={yearInput}
                    onChange={handleYearInputChange}
                    className="br-input br-year-input"
                  />
                </div>
                <HistorySlider value={selectedYear} onYearChange={handleSliderChange} />
                <button
                  className="br-btn br-btn-primary"
                  onClick={submitGuess}
                  disabled={isSubmitting || !selectedCountry || isIntermission || timeRemaining === 0}
                >
                  {isSubmitting ? 'Sending guess…' : 'SUBMIT GUESS'}
                </button>
              </fieldset>
            )}

            <div className="br-health-bars">
              {gameState.players.map(p => {
                const hpPct = Math.max(0, p.health / (gameState.maxHealth || 25000) * 100);
                return (
                  <div key={p.id} className={`br-health-bar ${p.isEliminated ? 'eliminated' : ''}`}>
                    <div className="br-hb-name">
                      {p.name}
                      {p.id === playerId && <span className="br-you-tag">you</span>}
                      {p.hasGuessedThisRound && !p.isEliminated && <span className="br-guessed-tag">✓</span>}
                    </div>
                    <div className="br-hb-fill-bg">
                      <div className="br-hb-fill" style={{ width: `${hpPct}%`, '--hp-pct': hpPct }} />
                    </div>
                    <div className="br-hb-hp">
                      {p.isEliminated ? '☠ out' : `${p.health.toLocaleString()} HP`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </>}
        </div>
        </div>
        {intermission.phase === 'countdown' && (
          <div className="br-round-countdown" role="timer" aria-live="assertive" aria-label={`Next round starts in ${intermission.countdown}`}>
            <span>{intermission.countdown}</span>
          </div>
        )}
      </div>
    );
  };

  // ── Finished ───────────────────────────────────────────────────────────────────

  const renderFinished = () => {
    const sorted = [...gameState.players].sort((a, b) => (a.finalPlacement ?? Infinity) - (b.finalPlacement ?? Infinity));
    const winners = sorted.filter(p => p.finalPlacement === 1);
    return (
      <div className="br-finished">
        <h2 className="br-finished-title">GAME OVER</h2>
        <h1 className="br-winner-name">{winners.length ? `${winners.map(p => p.name).join(' & ')} ${winners.length > 1 ? 'are joint winners!' : 'Wins!'}` : 'Placements unavailable'}</h1>
        {gameState.lastRoundReveal && (
          <div className="br-finished-result">
            <RoundResultCard round={gameState.lastRoundReveal} playerId={playerId} />
          </div>
        )}
        <div className="br-leaderboard">
          {sorted.map((p, i) => (
            <div key={p.id} className={`br-lb-row ${p.finalPlacement === 1 ? 'winner' : ''}`}>
              <span className="br-lb-rank">{p.finalPlacement == null ? '—' : MEDALS[p.finalPlacement - 1] ?? `#${p.finalPlacement}`}</span>
              <span className="br-lb-name">
                {p.name}
                {p.id === playerId && <span className="br-you-tag">you</span>}
              </span>
              <span className="br-lb-hp">{p.health.toLocaleString()} HP</span>
            </div>
          ))}
        </div>
        <button
          className="br-history-button br-finished-history"
          onClick={() => setIsHistoryOpen(true)}
        >
          History
        </button>
        <div className="br-finished-actions">
          <button className="br-btn br-btn-secondary" onClick={() => router.push('/')}>
            HOME
          </button>
          {isHost ? <button className="br-btn br-btn-primary" disabled={isStarting} onClick={() => roomAction('reopen')}>
            Return to Lobby
          </button> : <p className="br-waiting-msg">Waiting for the host to return to the lobby…</p>}
        </div>
      </div>
    );
  };

  // ── Root render ────────────────────────────────────────────────────────────────

  if (!gameState) {
    return (
      <div className="br-page">
        <div className="br-loading">{statusError ?? startError ?? 'Loading Battle Royale…'}</div>
      </div>
    );
  }

  if (!isMember && gameState.status === 'waiting') {
    return (
      <div className="br-page">
        <div className="br-card br-join-card">
          <h2>Join Room</h2>
          {statusError && <p className="br-error" role="status">{statusError}</p>}
      {startError && <p className="br-error" role="alert">{startError}</p>}
          <p>Pick a nickname to enter the lobby.</p>
          <form onSubmit={handleJoin} className="br-join-form">
            <input
              type="text"
              placeholder="Your Nickname"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="br-input"
              maxLength={32}
              autoFocus
            />
            <button type="submit" className="br-btn br-btn-primary" disabled={isJoining || !playerName.trim()}>
              {isJoining ? 'JOINING…' : 'JOIN'}
            </button>
          </form>
        </div>
        <RoomHistory roomId={gameId} revision={gameState.revision} />
      </div>
    );
  }

  return (
    <div className="br-page">
      {statusError && <p className="br-error" role="status">{statusError}</p>}
      {startError && <p className="br-error" role="alert">{startError}</p>}
      {gameState.status === 'waiting'  && renderLobby()}
      {gameState.status === 'active' && (phase.phase === 'syncing'
        ? <div className="br-waiting" role="status">Round complete — syncing results…</div>
        : renderActive())}
      {gameState.status === 'finished' && (revealPending
        ? <div className="br-waiting" role="status">Round complete — syncing results…</div>
        : renderFinished())}
      {gameState.status === 'waiting' && isMember && <button className="br-btn br-btn-leave" disabled={isStarting} onClick={() => roomAction('leave')}>Leave Room</button>}
      {!revealPending && <RoomHistory roomId={gameId} revision={gameState.revision} />}
      {isHistoryOpen && !revealPending && (
        <div className="br-history-overlay" role="dialog" aria-modal="true" aria-label="Round history">
          <div className="br-history-panel">
            <div className="br-history-header">
              <h2>Round History</h2>
              <button className="br-history-close" onClick={() => setIsHistoryOpen(false)} aria-label="Close round history">×</button>
            </div>
            <div className="br-history-list">
              {[...(gameState.roundHistory ?? [])].reverse().map(round => (
                <RoundResultCard key={round.round} round={round} playerId={playerId} history />
              ))}
              {(gameState.roundHistory ?? []).length === 0 && <p className="br-history-empty">No completed rounds yet.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
