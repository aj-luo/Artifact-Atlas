import styles from './GameScreenIntro.module.css';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

function GameScreenIntro({ setCurrentView, gameId, isHost, players = [], setMyRole }) {
    const [isStarting, setStarting] = useState(false);
    const channelRef = useRef(null);
    const [guesser, setGuesser] = useState('');

    const isPicked = guesser !== '';

    const determineRole = (myPlayerId, archeologistId, guesserId) => {
        if (myPlayerId === archeologistId) return 'archeologist';
        if (myPlayerId === guesserId) return 'guesser';
        return 'imposter';
    };

    useEffect(() => {
        if (!gameId) return;

        const channel = supabase.channel(`party_game:${gameId}`);
        channelRef.current = channel;

        channel.on('broadcast', { event: 'game-starting' }, (event) => {
            setStarting(true);
            const myPlayerId = sessionStorage.getItem(`party_player_${gameId}`) || sessionStorage.getItem('playerId');
            const { archeologist: archId, guesser: guessId } = event.payload;

            const assignedRole = determineRole(myPlayerId, archId, guessId);

            if (typeof setMyRole === 'function') {
                setMyRole(assignedRole);
            }

            setCurrentView('gamePlay');
        });

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Successfully subscribed to party game channel');
            }
        });

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [gameId, setCurrentView, setMyRole]);

    const handleStart = async () => {
        try {
            setStarting(true);

            const eligiblePlayers = players.filter((p) => p.id !== guesser);

            if (eligiblePlayers.length === 0) {
                alert('Not enough players to select an Archeologist!');
                setStarting(false);
                return;
            }

            const randomIndex = Math.floor(Math.random() * eligiblePlayers.length);
            const selectedArcheologistId = eligiblePlayers[randomIndex].id;
            const hostPlayerId = sessionStorage.getItem(`party_player_${gameId}`) || sessionStorage.getItem('playerId');

            const response = await fetch(`/api/party/${gameId}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ archeologist: selectedArcheologistId, guesser, hostPlayerId }),
            });

            if (!response.ok) {
                alert('Failed to create game.');
                throw new Error('Failed to create game');
            }

            if (channelRef.current) {
                await channelRef.current.send({
                    type: 'broadcast',
                    event: 'game-starting',
                    payload: { 
                        message: 'Game is being started',
                        archeologist: selectedArcheologistId,
                        guesser
                    }
                });
            }

            const myPlayerId = sessionStorage.getItem(`party_player_${gameId}`) || sessionStorage.getItem('playerId');
            const hostRole = determineRole(myPlayerId, selectedArcheologistId, guesser);
            
            if (typeof setMyRole === 'function') {
                setMyRole(hostRole);
            }

            setCurrentView('gamePlay');

        } catch (error) {
            console.error('Failed to start', error);
            setStarting(false);
        }
    };

    return (
        <div className={styles.home}>
            {/* Structured Rules & Tagline */}
            <header className={styles.headerGroup}>
                <h2 className={styles.title}>How to Play</h2>
                <div className={styles.rulesGrid}>
                    <div className={styles.ruleCard}>
                        <span className={styles.ruleBadge}>1. Roles</span>
                        <p>The Host picks <strong>1 Guesser</strong>. A <strong>True Archeologist</strong> is secretly assigned, and all other players become <strong>Imposters</strong>.</p>
                    </div>
                    <div className={styles.ruleCard}>
                        <span className={styles.ruleBadge}>2. Writing Phase</span>
                        <p>Everyone writes artifact descriptions. The <strong>True Archeologist</strong> sees artifact details & image; Imposters only see the image.</p>
                    </div>
                    <div className={styles.ruleCard}>
                        <span className={styles.ruleBadge}>3. The Guess</span>
                        <p>The Guesser must identify the True Archeologist. Correct guess = <strong>Guesser & Archeologist Win</strong>. Incorrect = <strong>Imposters Win</strong>.</p>
                    </div>
                </div>
            </header>

            {/* Main Action Area */}
            {isStarting ? (
                <div className={styles.statusBox}>
                    <span className={styles.spinner}></span>
                    <p>Starting Game...</p>
                </div>
            ) : (
                <div className={styles.actionCard}>
                    {isHost ? (
                        <div className={styles.hostControls}>
                            <div className={styles.fieldGroup}>
                                <label htmlFor="guesser-select" className={styles.label}>
                                    Select Guesser
                                </label>
                                <div className={styles.selectWrapper}>
                                    <select 
                                        id="guesser-select" 
                                        className={styles.selectInput}
                                        value={guesser} 
                                        onChange={(e) => setGuesser(e.target.value)}
                                    >
                                        <option value="">-- Choose Player --</option>
                                        {players.map((player) => (
                                            <option key={player.id} value={player.id}>
                                                {player.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <button 
                                className={styles.start_button} 
                                onClick={handleStart}
                                disabled={!isPicked}
                            >
                                BEGIN GAME
                            </button>
                        </div>
                    ) : (
                        <div className={styles.waitingState}>
                            <span className={styles.pulseDot}></span>
                            <p>Waiting for host to select roles and start the game...</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default GameScreenIntro;
