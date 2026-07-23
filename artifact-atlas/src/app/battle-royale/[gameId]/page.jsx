'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import ReactFlagsSelect from "react-flags-select";
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
import HistorySlider from '../../../HistorySlider/HistorySlider.jsx';
import { supabase } from '../../../lib/supabaseClient';
import { estimateServerClockOffset, getIntermissionPhase, shouldApplyRevision } from './snapshotSync.js';
import '../battleRoyale.css';

countries.registerLocale(enLocale);
const omittedCountries = ['AS', 'IO', 'CW', 'GG', 'GU', 'IM', 'JE', 'PS', 'SX', 'VI', 'AX', 'XK'];
const allowedCountries = Object.keys(countries.getNames('en')).filter(c => !omittedCountries.includes(c));

const MEDALS = ['🥇', '🥈', '🥉'];

const formatYear = (y) => {
  if (y == null) return '?';
  return y < 0 ? `${Math.abs(y)} BCE` : `${y} CE`;
};

const isoToCountryName = (iso3) => {
  if (!iso3) return '?';
  const alpha2 = countries.alpha3ToAlpha2(iso3);
  return countries.getName(alpha2, 'en') ?? iso3;
};

const formatAnswerDate = (round) => (
  round.artifactEndYear !== round.artifactBeginYear
    ? `${formatYear(round.artifactBeginYear)} – ${formatYear(round.artifactEndYear)}`
    : formatYear(round.artifactBeginYear)
);

function RoundResultCard({ round, playerId, history = false }) {
  const players = [...round.guesses].sort((a, b) => b.totalScore - a.totalScore);
  return (
    <section className={`br-result-card ${history ? 'br-history-round-card' : ''}`}>
      <h3 className="br-reveal-heading">Round {round.round} Results</h3>
      <div className="br-reveal-answer">
        {round.artifactImageUrl && (
          <img
            src={round.artifactImageUrl}
            alt={round.artifactTitle ?? 'Revealed artifact'}
            className="br-reveal-artifact-image"
          />
        )}
        <div className="br-reveal-artifact-name">{round.artifactTitle ?? 'Unknown artifact'}</div>
        <div className="br-reveal-answer-row">
          <span className="br-reveal-label">Country</span>
          <span className="br-reveal-value">{isoToCountryName(round.artifactIso3)}</span>
        </div>
        <div className="br-reveal-answer-row">
          <span className="br-reveal-label">Date</span>
          <span className="br-reveal-value">{formatAnswerDate(round)}</span>
        </div>
      </div>
      <div className="br-reveal-players">
        {players.map(guess => (
          <div key={guess.playerId} className={`br-reveal-player ${guess.playerId === playerId ? 'is-you' : ''}`}>
            <span className="br-reveal-player-name">
              {guess.playerName}
              {guess.playerId === playerId && <span className="br-you-tag">you</span>}
              {guess.isEliminated && <span className="br-result-out-tag">out</span>}
            </span>
            <span className="br-reveal-player-guess">
              {guess.countryGuessed ? `${isoToCountryName(guess.countryGuessed)} · ${formatYear(guess.yearGuessed)}` : 'No guess'}
            </span>
            <span className="br-reveal-player-score">{guess.totalScore.toLocaleString()} pts</span>
            <span className={`br-reveal-player-dmg ${guess.hpLost === 0 ? 'best' : ''}`}>
              {typeof guess.hpLost !== 'number' ? 'HP loss unavailable' : guess.hpLost === 0 ? 'No HP lost' : `-${guess.hpLost.toLocaleString()} HP`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function BattleRoyaleRoom() {
  const { gameId } = useParams();
  const [gameState, setGameState] = useState(null);
  const [playerId, setPlayerId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);

  const [selectedCountry, setSelectedCountry] = useState('');
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [yearInput, setYearInput] = useState(String(currentYear));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [intermission, setIntermission] = useState({ phase: 'none', countdown: null });
  const debounceRef = useRef(null);
  const latestRevisionRef = useRef(-1);
  const serverClockOffsetRef = useRef(0);
  const [channelStatus, setChannelStatus] = useState('CONNECTING');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(`br_player_${gameId}`);
    if (saved) setPlayerId(saved);
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
  const applySnapshot = useCallback((data, requestedAt = null, receivedAt = null) => {
    if (!data || !shouldApplyRevision(latestRevisionRef.current, data.revision)) return false;

    latestRevisionRef.current = data.revision;
    // Only an HTTP request/response midpoint can distinguish clock skew from
    // network delay. A delayed broadcast must not move the estimated clock.
    if (data.serverTime && requestedAt != null && receivedAt != null) {
      serverClockOffsetRef.current = estimateServerClockOffset(data.serverTime, requestedAt, receivedAt);
    }
    setGameState(data);
    return true;
  }, []);

  // Stable callback — only recreated when gameId changes
  const fetchStatus = useCallback(async () => {
    try {
      const requestedAt = Date.now();
      const res = await fetch(`/api/multiplayer/${gameId}/status`);
      if (res.ok) {
        const data = await res.json();
        applySnapshot(data, requestedAt, Date.now());
      }
    } catch (err) {
      console.error('Status fetch error', err);
    }
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
      .channel(`game-${gameId}`)
      // Broadcast: full game state delivered by the server directly after each mutation,
      // no HTTP round-trip needed on the client side.
      .on('broadcast', { event: 'game_update' }, ({ payload }) => {
        applySnapshot(payload);
      })
      // postgres_changes: safety fallback for any broadcast misses
      .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplayer_games', filter: `id=eq.${gameId}` }, debouncedFetchStatus)
      .subscribe((status) => setChannelStatus(status));

    return () => {
      supabase.removeChannel(channel);
      clearTimeout(debounceRef.current);
    };
  }, [gameId, fetchStatus, debouncedFetchStatus, applySnapshot]);

  // Healthy polling is only a slow recovery net; degraded realtime stays eager.
  useEffect(() => {
    const interval = setInterval(fetchStatus, channelStatus === 'SUBSCRIBED' ? 30000 : 2000);
    return () => clearInterval(interval);
  }, [channelStatus, fetchStatus]);

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

  // Countdown timer — triggers server-side round resolution the moment the clock hits 0
  useEffect(() => {
    if (!gameState?.roundEndsAt || gameState.status !== 'active') {
      setTimeRemaining(null);
      return;
    }
    const interval = setInterval(() => {
      const serverNow = Date.now() + serverClockOffsetRef.current;
      const diff = Math.max(0, Math.ceil((new Date(gameState.roundEndsAt).getTime() - serverNow) / 1000));
      setTimeRemaining(diff);
      if (diff === 0) {
        clearInterval(interval);
        // Poke the backend immediately so resolveRoundIfNeeded() runs within ~200ms
        // of actual expiry rather than waiting for the next poll cycle (up to 2s).
        void fetchStatus();
      }
    }, 200);
    return () => clearInterval(interval);
  }, [gameState?.roundEndsAt, gameState?.status, fetchStatus]);

  useEffect(() => {
    const updateIntermission = () => {
      const serverNow = Date.now() + serverClockOffsetRef.current;
      setIntermission(getIntermissionPhase(gameState?.roundStartsAt, serverNow));
    };
    updateIntermission();
    if (!gameState?.roundStartsAt || gameState.status !== 'active') return undefined;
    const interval = setInterval(updateIntermission, 100);
    return () => clearInterval(interval);
  }, [gameState?.roundStartsAt, gameState?.status]);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    setIsJoining(true);
    try {
      const res = await fetch(`/api/multiplayer/${gameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName }),
      });
      if (res.ok) {
        const data = await res.json();
        setPlayerId(data.playerId);
        localStorage.setItem(`br_player_${gameId}`, data.playerId);
        applySnapshot(data);
      }
    } catch (err) {
      console.error(err);
    }
    setIsJoining(false);
  };

  const handleStart = async () => {
    setIsStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`/api/multiplayer/${gameId}/start`, { method: 'POST' });
      if (res.ok) {
        applySnapshot(await res.json());
      } else {
        const data = await res.json().catch(() => ({}));
        setStartError(data.error ?? 'Failed to start game');
      }
    } catch {
      setStartError('Network error — try again');
    } finally {
      setIsStarting(false);
    }
  };

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
    if (!playerId || !selectedCountry) return;
    const alpha3 = countries.alpha2ToAlpha3(selectedCountry);
    if (!alpha3) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/multiplayer/${gameId}/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, country: alpha3, year: selectedYear }),
      });
      // Apply the full game state from the response immediately (score + post-resolution state)
      // so the UI updates within network RTT rather than waiting for the next poll.
      if (res.ok) {
        const data = await res.json();
        applySnapshot(data);
      } else {
        // Late-guess rejections include the authoritative post-expiry snapshot.
        const data = await res.json().catch(() => null);
        if (data?.revision != null) applySnapshot(data);
      }
    } catch (err) {
      console.error(err);
    }
    setIsSubmitting(false);
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
                </span>
              </li>
            ))}
          </ul>
        </div>

        {gameState.players.length >= 2
          ? playerId === gameState.hostId
            ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '100%', maxWidth: '300px' }}>
                {startError && <p style={{ color: '#ff416c', fontSize: '0.85rem', margin: 0 }}>{startError}</p>}
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
          {timeRemaining !== null && (
            <div className={`br-timer ${timeRemaining <= 5 ? 'urgent' : ''}`}>{timeRemaining}s</div>
          )}
        </div>

        <div className="br-game-body">
          {intermission.phase === 'results' && gameState.lastRoundReveal ? (
            <div className="br-round-results">
              <RoundResultCard round={gameState.lastRoundReveal} playerId={playerId} />
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
            {me?.isEliminated ? (
              <div className="br-eliminated">You were eliminated. Spectating…</div>
            ) : me?.hasGuessedThisRound ? (
              <div className="br-waiting">Guess submitted — waiting for others…</div>
            ) : (
              <div className="br-guess-panel">
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
                  disabled={isSubmitting || !selectedCountry}
                >
                  {isSubmitting ? 'SUBMITTING…' : 'SUBMIT GUESS'}
                </button>
              </div>
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
    const sorted = [...gameState.players].sort((a, b) => b.health - a.health);
    return (
      <div className="br-finished">
        <h2 className="br-finished-title">GAME OVER</h2>
        <h1 className="br-winner-name">{sorted[0].name} Wins!</h1>
        <div className="br-leaderboard">
          {sorted.map((p, i) => (
            <div key={p.id} className={`br-lb-row ${i === 0 ? 'winner' : ''}`}>
              <span className="br-lb-rank">{MEDALS[i] ?? `#${i + 1}`}</span>
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
        <button
          className="br-btn br-btn-secondary br-play-again"
          onClick={() => window.location.href = '/battle-royale'}
        >
          PLAY AGAIN
        </button>
      </div>
    );
  };

  // ── Root render ────────────────────────────────────────────────────────────────

  if (!gameState) {
    return (
      <div className="br-page">
        <div className="br-loading">Loading Battle Royale…</div>
      </div>
    );
  }

  if (!playerId) {
    return (
      <div className="br-page">
        <div className="br-card br-join-card">
          <h2>Join Game</h2>
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
      </div>
    );
  }

  return (
    <div className="br-page">
      {gameState.status === 'waiting'  && renderLobby()}
      {gameState.status === 'active'   && renderActive()}
      {gameState.status === 'finished' && renderFinished()}
      {isHistoryOpen && (
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
