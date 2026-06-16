'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import './battleRoyale.css';
import logo from '../../assets/AA_logo.png';

export default function BattleRoyaleLobby() {
  const router = useRouter();
  const [countdownSeconds, setCountdownSeconds] = useState(20);
  const [joinGameId, setJoinGameId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState(null);

  const handleCreateGame = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/multiplayer/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countdownSeconds }),
      });
      if (!res.ok) throw new Error('Failed to create game');
      const data = await res.json();
      router.push(`/battle-royale/${data.gameId}`);
    } catch (err) {
      console.error(err);
      setError('Could not create game lobby. Please try again.');
      setIsCreating(false);
    }
  };

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const showToast = (msg) => {
    setError(msg);
    setTimeout(() => setError(null), 3000);
  };

  const handleJoinGame = async (e) => {
    e.preventDefault();
    const raw = joinGameId.trim();
    if (!raw) return;
    if (!uuidRegex.test(raw)) {
      showToast('Invalid Game ID');
      return;
    }
    setIsChecking(true);
    try {
      const res = await fetch(`/api/multiplayer/${raw}/exists`);
      if (!res.ok) {
        showToast('Invalid Game ID');
        return;
      }
      router.push(`/battle-royale/${raw}`);
    } catch {
      showToast('Invalid Game ID');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="br-page">
      <div className="br-header">
        <img src={logo.src} className="br-logo" alt="Artifact Atlas" />
        <h1 className="br-title">BATTLE ROYALE</h1>
      </div>

      <div className="br-container">
        {error && <div className="br-error">{error}</div>}
        
        <div className="br-card">
          <h2>Create a Game</h2>
          <p>Host a new game and invite your friends.</p>
          
          <div className="br-input-group">
            <label>Countdown Timer: <span>{countdownSeconds}s</span></label>
            <input 
              type="range" 
              min="5" 
              max="60" 
              step="5"
              value={countdownSeconds} 
              onChange={(e) => setCountdownSeconds(Number(e.target.value))} 
              className="br-slider"
            />
            <small>Time allowed after the first guess is made.</small>
          </div>
          
          <button 
            className="br-btn br-btn-primary" 
            onClick={handleCreateGame}
            disabled={isCreating}
          >
            {isCreating ? 'CREATING...' : 'CREATE NEW GAME'}
          </button>
        </div>

        <div className="br-divider"><span>OR</span></div>

        <div className="br-card">
          <h2>Join a Game</h2>
          <p>Have a game code? Enter it below to join.</p>
          
          <form onSubmit={handleJoinGame} className="br-join-form">
            <input 
              type="text" 
              placeholder="Enter Game ID..." 
              value={joinGameId}
              onChange={(e) => setJoinGameId(e.target.value)}
              className="br-input"
            />
            <button type="submit" className="br-btn br-btn-secondary" disabled={!joinGameId.trim() || isChecking}>
              {isChecking ? 'CHECKING...' : 'JOIN GAME'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
