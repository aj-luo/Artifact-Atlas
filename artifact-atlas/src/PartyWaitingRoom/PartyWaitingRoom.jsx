import styles from './PartyWaitingRoom.module.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

function PartyWaitingRoom({ setCurrentView, gameId, isHost, setIsHost, setTotalPlayers }) {
    const [players, setPlayers] = useState([]);
    const [maxPlayers, setMaxPlayers] = useState(4);
    const [isConnecting, setIsConnecting] = useState(true);
    const [copied, setCopied] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const leaveRequestSentRef = useRef(false);
    const pendingLeaveRef = useRef(null);
    const skipUnmountLeaveRef = useRef(false);

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
                skipUnmountLeaveRef.current = true;
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
        if (setTotalPlayers) {
            setTotalPlayers(players);
        }
    }, [players, setTotalPlayers]);

    useEffect(() => {
        if (!setIsHost || !gameId || typeof window === 'undefined') return;
        const playerId = localStorage.getItem(`party_player_${gameId}`) || localStorage.getItem('playerId');
        setIsHost(Boolean(playerId && players[0]?.id === playerId));
    }, [gameId, players, setIsHost]);

    const leaveRoom = useCallback(async (keepalive = false) => {
        if (leaveRequestSentRef.current) return;

        const playerId = localStorage.getItem(`party_player_${gameId}`) || localStorage.getItem('playerId');
        if (!playerId) throw new Error('Could not identify your player. Please rejoin the lobby.');

        leaveRequestSentRef.current = true;
        try {
            const response = await fetch(`/api/party/${gameId}/leave`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId }),
                keepalive,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Failed to leave lobby.');
            return playerId;
        } catch (error) {
            leaveRequestSentRef.current = false;
            throw error;
        }
    }, [gameId]);

    useEffect(() => {
        if (!gameId) return;

        if (pendingLeaveRef.current) {
            clearTimeout(pendingLeaveRef.current);
            pendingLeaveRef.current = null;
        }
        leaveRequestSentRef.current = false;

        const handlePageHide = () => {
            leaveRoom(true).catch(() => {});
        };
        window.addEventListener('pagehide', handlePageHide);

        return () => {
            window.removeEventListener('pagehide', handlePageHide);
            if (pendingLeaveRef.current) clearTimeout(pendingLeaveRef.current);
            if (skipUnmountLeaveRef.current) {
                skipUnmountLeaveRef.current = false;
                return;
            }

            // Defer one tick so React Strict Mode's development remount can cancel this.
            pendingLeaveRef.current = setTimeout(() => {
                pendingLeaveRef.current = null;
                leaveRoom(true).catch(() => {});
            }, 0);
        };
    }, [gameId, leaveRoom]);

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

            skipUnmountLeaveRef.current = true;
            setCurrentView('gameintro');
        } catch (error) {
            console.error('Error starting game:', error);
        }
    };

    const handleLeave = async () => {
        setIsLeaving(true);
        setErrorMessage('');
        try {
            const playerId = await leaveRoom();

            localStorage.removeItem(`party_player_${gameId}`);
            if (localStorage.getItem('playerId') === playerId) {
                localStorage.removeItem('playerId');
                localStorage.removeItem('nickname');
            }
            setTotalPlayers?.([]);
            setIsHost?.(false);
            setCurrentView('party');
        } catch (error) {
            setErrorMessage(error.message || 'Failed to leave lobby. Please try again.');
            setIsLeaving(false);
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
                {errorMessage && <p className={styles.errorMessage} role="alert">{errorMessage}</p>}
                <div className={styles.buttonGroup}>
                    <button 
                        className={styles.backButton} 
                        onClick={handleLeave}
                        disabled={isLeaving || isConnecting}
                    >
                        {isLeaving ? 'Leaving...' : 'Leave'}
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
