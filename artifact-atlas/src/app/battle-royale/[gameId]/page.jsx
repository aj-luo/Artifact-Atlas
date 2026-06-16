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
const allCountries = Object.keys(countries.getNames('en'));
const allowedCountries = allCountries.filter(code => !omittedCountries.includes(code));

export default function BattleRoyaleRoom() {
  const { gameId } = useParams();
  const [gameState, setGameState] = useState(null);
  const [playerId, setPlayerId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  
  // Guess state
  const [selectedCountry, setSelectedCountry] = useState("");
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [yearInput, setYearInput] = useState(String(currentYear));
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [showReveal, setShowReveal] = useState(false);
  const [lastRoundNum, setLastRoundNum] = useState(0);
  const [copied, setCopied] = useState(false);

  // Read player ID from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem(`br_player_${gameId}`);
    if (saved) setPlayerId(saved);
  }, [gameId]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/multiplayer/${gameId}/status`);
      if (res.ok) {
        const data = await res.json();
        setGameState(data);
        if (data.lastRoundReveal && data.lastRoundReveal.round > lastRoundNum) {
          setLastRoundNum(data.lastRoundReveal.round);
          setShowReveal(true);
          setTimeout(() => setShowReveal(false), 5000);
        }
      }
    } catch (err) {
      console.error("Status fetch error", err);
    }
  }, [gameId, lastRoundNum]);

  // Real-time Supabase Subscription & Fallback Polling
  useEffect(() => {
    fetchStatus(); // initial fetch

    const channel = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplayer_games', filter: `id=eq.${gameId}` }, fetchStatus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplayer_guesses', filter: `game_id=eq.${gameId}` }, fetchStatus)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplayer_players', filter: `game_id=eq.${gameId}` }, fetchStatus)
      .subscribe();
      
    // Fallback polling every 2 seconds in case Realtime isn't configured in the DB
    const pollInterval = setInterval(fetchStatus, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [gameId, fetchStatus]);

  // Countdown loop
  useEffect(() => {
    if (!gameState || !gameState.roundEndsAt || gameState.status !== 'active') {
      setTimeRemaining(null);
      return;
    }
    
    const interval = setInterval(() => {
      const endsAt = new Date(gameState.roundEndsAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((endsAt - now) / 1000));
      setTimeRemaining(diff);
      if (diff === 0) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [gameState]);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    setIsJoining(true);
    try {
      const res = await fetch(`/api/multiplayer/${gameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName })
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
    await fetch(`/api/multiplayer/${gameId}/start`, { method: 'POST' });
  };

  const handleYearInputChange = (e) => {
    setYearInput(e.target.value);
    const parsed = parseInt(e.target.value, 10);
    if (!isNaN(parsed) && parsed >= -3000 && parsed <= currentYear) {
      setSelectedYear(parsed);
    }
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
      await fetch(`/api/multiplayer/${gameId}/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, country: alpha3, year: selectedYear })
      });
    } catch (err) {
      console.error(err);
    }
    setIsSubmitting(false);
  };

  const renderLobby = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const handleCopy = () => {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };
    return (
      <div className="br-lobby">
        <div className="br-qr">
          <QRCodeSVG value={url} size={200} bgColor={"#ffffff"} fgColor={"#000000"} />
        </div>
        <h3>Scan to Join!</h3>
        <div className="br-invite-link">
          <input className="br-input" readOnly value={url} onClick={e => e.target.select()} />
          <button className="br-btn br-btn-secondary" onClick={handleCopy}>
            {copied ? 'COPIED!' : 'COPY LINK'}
          </button>
        </div>
        <div className="br-players-list">
          <h4>Players ({gameState.players.length}):</h4>
          <ul>
            {gameState.players.map(p => <li key={p.id}>{p.name} {p.id === playerId ? '(You)' : ''}</li>)}
          </ul>
        </div>
        {gameState.players.length >= 2 ? (
          playerId === gameState.hostId ? (
            <button className="br-btn br-btn-primary" onClick={handleStart}>START GAME</button>
          ) : (
            <p style={{color: '#aaa', fontWeight: 'bold'}}>Waiting for Host to start the game...</p>
          )
        ) : (
          <p style={{color: '#aaa'}}>Waiting for more players to join...</p>
        )}
      </div>
    );
  };

  const renderActive = () => {
    const me = gameState.players.find(p => p.id === playerId);
    
    return (
      <div className="br-active-game">
        <div className="br-top-bar">
          <div className="br-round-info">Round {gameState.currentRound} / {gameState.maxRounds}</div>
          {timeRemaining !== null && (
             <div className={`br-timer ${timeRemaining <= 5 ? 'urgent' : ''}`}>
               {timeRemaining}s
             </div>
          )}
        </div>
        
        <div className="br-main-view">
          {showReveal ? (
            <div className="br-reveal-overlay">
              <h2>Round {gameState.lastRoundReveal.round} Results</h2>
              <p>Artifact: {gameState.lastRoundReveal.artifactTitle}</p>
              <p>Correct Year: {gameState.lastRoundReveal.artifactBeginYear}</p>
              <div className="br-reveal-players">
                {gameState.lastRoundReveal.guesses.map(g => (
                  <div key={g.playerId} className="br-reveal-player">
                    <strong>{g.playerName}</strong>: {g.totalScore} pts (Dmg: {Math.max(...gameState.lastRoundReveal.guesses.map(x=>x.totalScore)) - g.totalScore})
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {gameState.currentArtifact && (
                <div className="br-artifact-container">
                  <img src={gameState.currentArtifact.imageUrl} alt="Artifact" className="br-artifact-img" />
                </div>
              )}
            </>
          )}
        </div>

        <div className="br-controls">
           {me?.isEliminated ? (
             <div className="br-eliminated">You have been eliminated. Spectating...</div>
           ) : me?.hasGuessedThisRound ? (
             <div className="br-waiting">Waiting for others or timer...</div>
           ) : (
             <div className="br-guess-panel">
               <ReactFlagsSelect
                  selected={selectedCountry}
                  onSelect={(code) => setSelectedCountry(code)}
                  countries={allowedCountries}
                  placeholder="Select Country"
                  searchable
                  className="br-flag-select"
                />
               <HistorySlider value={selectedYear} onYearChange={handleSliderChange} />
               <input type="number" value={yearInput} onChange={handleYearInputChange} className="br-input" style={{width: '100px', margin: '10px 0'}} />
               <button className="br-btn br-btn-primary" onClick={submitGuess} disabled={isSubmitting || !selectedCountry}>
                 {isSubmitting ? 'SUBMITTING...' : 'SUBMIT GUESS'}
               </button>
             </div>
           )}
        </div>
        
        <div className="br-health-bars">
           {gameState.players.map(p => (
             <div key={p.id} className={`br-health-bar ${p.isEliminated ? 'eliminated' : ''}`}>
               <div className="br-hb-name">{p.name} {p.id === playerId ? '(You)' : ''}</div>
               <div className="br-hb-fill-bg">
                 <div className="br-hb-fill" style={{width: `${Math.max(0, p.health / 25000 * 100)}%`}}></div>
               </div>
               <div className="br-hb-hp">{p.health} HP</div>
             </div>
           ))}
        </div>
      </div>
    );
  };

  const renderFinished = () => {
    // Sort players by health descending
    const sorted = [...gameState.players].sort((a,b) => b.health - a.health);
    const winner = sorted[0];
    return (
      <div className="br-finished">
        <h2>GAME OVER</h2>
        <h1 style={{color: '#ff416c'}}>{winner.name} Wins!</h1>
        <div className="br-leaderboard">
          {sorted.map((p, i) => (
             <div key={p.id} className="br-lb-row">
               <span>#{i+1} {p.name}</span>
               <span>{p.health} HP remaining</span>
             </div>
          ))}
        </div>
        <button className="br-btn br-btn-secondary" style={{marginTop: '2rem'}} onClick={() => window.location.href = '/battle-royale'}>
          PLAY AGAIN
        </button>
      </div>
    );
  };

  if (!gameState) {
    return <div className="br-page"><h2 className="br-loading">Loading Battle Royale...</h2></div>;
  }

  if (!playerId) {
    return (
      <div className="br-page">
        <div className="br-card" style={{marginTop: '4rem'}}>
          <h2>Join Game</h2>
          <form onSubmit={handleJoin} className="br-join-form">
            <input 
              type="text" 
              placeholder="Your Nickname" 
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="br-input"
              maxLength={16}
            />
            <button type="submit" className="br-btn br-btn-primary" disabled={isJoining || !playerName.trim()}>
              {isJoining ? 'JOINING...' : 'JOIN'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="br-page">
      {gameState.status === 'waiting' && renderLobby()}
      {gameState.status === 'active' && renderActive()}
      {gameState.status === 'finished' && renderFinished()}
    </div>
  );
}
