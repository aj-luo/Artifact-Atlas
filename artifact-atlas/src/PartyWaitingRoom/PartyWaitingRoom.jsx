import styles from './PartyWaitingRoom.module.css';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

function PartyWaitingRoom({ setCurrentView, gameId, isHost, setTotalPlayers }) {
    const [players, setPlayers] = useState([]);
    const [maxPlayers, setMaxPlayers] = useState(4);
    const [isConnecting, setIsConnecting] = useState(true);
    const [copied, setCopied] = useState(false);

    const lobbyFull = players.length >= maxPlayers && maxPlayers > 0;

    useEffect(() => {
        if (!gameId) return;

        const fetchInitialState = async () => {
            try {
                const response = await fetch(`/api/party/${gameId}/get`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.players) setPlayers(data.players);
                    if (data.number_players) setMaxPlayers(data.number_players);
                }
            } catch (err) {
                console.error('Failed to fetch initial state:', err);
            } finally {
                setIsConnecting(false);
            }
        };

        fetchInitialState();

        const channel = supabase
            .channel(`party_game:${gameId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'party_games',
                    filter: `id=eq.${gameId}`,
                },
                (payload) => {
                    console.log('Postgres change received:', payload);
                    // Fetch full player objects from API when player array updates
                    if (payload.new && payload.new.players) {
                        fetchInitialState();
                    }
                }
            )
            .on('broadcast', { event: 'game-start' }, () => {
                console.log('Game start signal received');
                setCurrentView('gameintro');
            });

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Successfully subscribed to game channel');
            }
        });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [gameId, setCurrentView]);

    useEffect(() => {
        if (setTotalPlayers && players.length > 0) {
            setTotalPlayers(players);
        }
    }, [players, setTotalPlayers]);

    const handleCopyCode = () => {
        if (!gameId) return;
        navigator.clipboard.writeText(gameId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleStartGame = async () => {
        try {
            const channel = supabase.channel(`party_game:${gameId}`);
            await channel.send({
                type: 'broadcast',
                event: 'game-start',
                payload: { message: 'Game has started!' }
            });

            setTimeout(() => {
                supabase.removeChannel(channel);
            }, 200);

            setCurrentView('gameintro');
        } catch (error) {
            console.error('Error starting game:', error);
        }
    };

    const emptySlotsCount = Math.max(0, maxPlayers - players.length);

    return (
        <div className={styles.home}>
            <div className={styles.card}>
                {/* Header Section */}
                <div className={styles.header}>
                    <span className={styles.badge}>
                        {isHost ? 'HOST' : 'PLAYER'}
                    </span>
                    <h1 className={styles.title}>Waiting Room</h1>
                    <p className={styles.statusText}>
                        {isConnecting 
                            ? 'Connecting to room...' 
                            : lobbyFull 
                                ? 'Lobby is full! Ready to start.' 
                                : `Waiting for players (${players.length}/${maxPlayers})`
                        }
                    </p>
                </div>

                {/* Lobby Code Box */}
                <div className={styles.codeContainer} onClick={handleCopyCode} title="Click to copy">
                    <span className={styles.codeLabel}>LOBBY CODE</span>
                    <div className={styles.codeValueFlex}>
                        <span className={styles.codeValue}>{gameId || '----'}</span>
                        <span className={styles.copyBadge}>{copied ? 'COPIED!' : 'COPY'}</span>
                    </div>
                </div>

                {/* Live Player List Section */}
                <div className={styles.playerSection}>
                    <div className={styles.playerHeader}>
                        <span className={styles.sectionLabel}>PLAYERS JOINED</span>
                        <span className={styles.countBadge}>{players.length} / {maxPlayers}</span>
                    </div>

                    <div className={styles.playerGrid}>
                        {players.map((p, index) => (
                            <div key={p.id || index} className={styles.playerCard}>
                                <div className={styles.avatar}>👤</div>
                                <span className={styles.playerName}>{p.name}</span>
                                {index === 0 && <span className={styles.hostBadge}>HOST</span>}
                            </div>
                        ))}

                        {/* Render empty slot placeholders */}
                        {!isConnecting && Array.from({ length: emptySlotsCount }).map((_, i) => (
                            <div key={`empty-${i}`} className={`${styles.playerCard} ${styles.emptyCard}`}>
                                <div className={styles.emptyAvatar}>+</div>
                                <span className={styles.emptyText}>Waiting...</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom Actions */}
                <div className={styles.buttonGroup}>
                    <button 
                        className={styles.backButton} 
                        onClick={() => setCurrentView('party')}
                    >
                        Leave
                    </button>
                    {isHost && (
                        <button 
                            className={styles.startButton}
                            onClick={handleStartGame}
                            disabled={!lobbyFull || isConnecting}
                        >
                            Start Game
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default PartyWaitingRoom;