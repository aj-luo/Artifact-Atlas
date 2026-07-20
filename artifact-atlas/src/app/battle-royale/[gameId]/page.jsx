'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import ReactFlagsSelect from "react-flags-select";
import countries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
import HistorySlider from '../../../HistorySlider/HistorySlider.jsx';
import { supabase } from '../../../lib/supabaseClient';
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

  const [showReveal, setShowReveal] = useState(false);
  // Ref instead of state so fetchStatus doesn't need it as a dep
  const lastRoundNumRef = useRef(0);
  const debounceRef = useRef(null);
  const [channelStatus, setChannelStatus] = useState('CONNECTING');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(`br_player_${gameId}`);
    if (saved) setPlayerId(saved);
  }, [gameId]);

  // Stable callback — only recreated when gameId changes
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/multiplayer/${gameId}/status`);
      if (res.ok) {
        const data = await res.json();
        setGameState(data);
        if (data.lastRoundReveal && data.lastRoundReveal.round > lastRoundNumRef.current) {
          lastRoundNumRef.current = data.lastRoundReveal.round;
          setShowReveal(true);
          setTimeout(() => setShowReveal(false), 5000);
        }
      }
    } catch (err) {
      console.error('Status fetch error', err);
    }
  }, [gameId]);

  // Batches rapid-fire postgres_changes events (e.g. N player rows + game row on round resolution)
  // into a single fetchStatus call instead of N+1 parallel HTTP requests.
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
        setGameState(payload);
        if (payload.lastRoundReveal && payload.lastRoundReveal.round > lastRoundNumRef.current) {
          lastRoundNumRef.current = payload.lastRoundReveal.round;
          setShowReveal(true);
          setTimeout(() => setShowReveal(false), 5000);
        }
      })
      // postgres_changes: safety fallback for any broadcast misses
      .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplayer_games',   filter: `id=eq.${gameId}` },      debouncedFetchStatus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplayer_guesses', filter: `game_id=eq.${gameId}` }, debouncedFetchStatus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplayer_players', filter: `game_id=eq.${gameId}` }, debouncedFetchStatus)
      .subscribe((status) => setChannelStatus(status));

    return () => {
      supabase.removeChannel(channel);
      clearTimeout(debounceRef.current);
    };
  }, [gameId, fetchStatus, debouncedFetchStatus]);

  // Adaptive polling: 10s when realtime is healthy, 2s when degraded
  useEffect(() => {
    const interval = setInterval(fetchStatus, channelStatus === 'SUBSCRIBED' ? 10000 : 2000);
    return () => clearInterval(interval);
  }, [channelStatus, fetchStatus]);

  // Countdown timer — triggers server-side round resolution the moment the clock hits 0
  useEffect(() => {
    if (!gameState?.roundEndsAt || gameState.status !== 'active') {
      setTimeRemaining(null);
      return;
    }
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(gameState.roundEndsAt).getTime() - Date.now()) / 1000));
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
        await fetchStatus();
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
        await fetchStatus();
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
        setGameState(data);
        if (data.lastRoundReveal && data.lastRoundReveal.round > lastRoundNumRef.current) {
          lastRoundNumRef.current = data.lastRoundReveal.round;
          setShowReveal(true);
          setTimeout(() => setShowReveal(false), 5000);
        }
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
    const reveal = gameState.lastRoundReveal;
    const maxRevealScore = reveal ? Math.max(...reveal.guesses.map(g => g.totalScore)) : 0;

    return (
      <div className="br-active-game">
        <div className="br-top-bar">
          <div className="br-round-info">Round {gameState.currentRound} / {gameState.maxRounds}</div>
          <div className="br-guess-count">{guessedCount} / {activePlayers.length} guessed</div>
          {timeRemaining !== null && (
            <div className={`br-timer ${timeRemaining <= 5 ? 'urgent' : ''}`}>{timeRemaining}s</div>
          )}
        </div>

        <div className="br-game-body">
          {/* Artifact / reveal pane */}
          <div className="br-artifact-pane">
            {showReveal && reveal ? (
              <div className="br-reveal-overlay">
                <h3 className="br-reveal-heading">Round {reveal.round} Results</h3>
                <div className="br-reveal-answer">
                  {reveal.artifactTitle && <div className="br-reveal-title">{reveal.artifactTitle}</div>}
                  <div className="br-reveal-answer-row">
                    <span className="br-reveal-label">Country</span>
                    <span className="br-reveal-value">{isoToCountryName(reveal.artifactIso3)}</span>
                  </div>
                  <div className="br-reveal-answer-row">
                    <span className="br-reveal-label">Year</span>
                    <span className="br-reveal-value">
                      {formatYear(reveal.artifactBeginYear)}
                      {reveal.artifactEndYear !== reveal.artifactBeginYear
                        ? ` – ${formatYear(reveal.artifactEndYear)}`
                        : ''}
                    </span>
                  </div>
                </div>
                <div className="br-reveal-players">
                  {[...reveal.guesses].sort((a, b) => b.totalScore - a.totalScore).map(g => (
                    <div key={g.playerId} className="br-reveal-player">
                      <span className="br-reveal-player-name">{g.playerName}</span>
                      <span className="br-reveal-player-guess">
                        {isoToCountryName(g.countryGuessed)} · {formatYear(g.yearGuessed)}
                      </span>
                      <span className="br-reveal-player-score">{g.totalScore.toLocaleString()} pts</span>
                      <span className={`br-reveal-player-dmg ${g.totalScore >= maxRevealScore ? 'best' : ''}`}>
                        {g.totalScore >= maxRevealScore ? '✓ best' : `-${(maxRevealScore - g.totalScore).toLocaleString()} HP`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              gameState.currentArtifact && (
                <div className="br-artifact-container">
                  <img src={gameState.currentArtifact.imageUrl} alt="Artifact" className="br-artifact-img" />
                </div>
              )
            )}
          </div>

          {/* Controls + health bars pane */}
          <div className="br-controls-pane">
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
        </div>
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
    </div>
  );
}
