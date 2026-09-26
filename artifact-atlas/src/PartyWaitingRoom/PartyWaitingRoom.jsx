import styles from './PartyWaitingRoom.module.css';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

function PartyWaitingRoom({ setCurrentView, gameId }) {
    //These are the default values for time limit and player count. They can be changed by the user using the toggles below. hooks can be used to store the values and update them when the user changes them. The values can then be passed to the backend when creating the lobby.
    const [players, setPlayers] = useState([]);
    const [maxPlayers, setMaxPlayers] = useState(4); // Default max players, can be updated based on game settings
    const [isConnecting, setIsConnecting] = useState(true); // Track if we're still connecting to the lobby

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

        // Fetch the initial state of the lobby when the component mounts
        fetchInitialState();

        //Connect to game unique Realtime channel to listen for updates on players joining or leaving
        const channel = supabase.channel(`party_game:${gameId}`);

        //Listen/receive live state broadcasts from the server when players join or leave the lobby
        channel.on('broadcast', {event: 'game-state'}, (payload) => {
            console.log('Realtime update received:', payload);
            
            const newPlayer = payload.payload?.player;
            if (newPlayer) {
                setPlayers((prevPlayers) => {
                    const exists = prevPlayers.some((p) => p.id === newPlayer.id);
                    if (exists) return prevPlayers; //avoid duplicate players

                    return [...prevPlayers, newPlayer];
                })
            }
        });

        //subscribe to start receiving updates from the channel
        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Successfully subscribed to channel');
            }
        });

        //Clean up when leaving the room aka when the component unmounts or gameId changes
        return () => {
            supabase.removeChannel(channel);
        };
    }, [gameId]);

    return (
        <div className={styles.home}>
            {/* This is used to show the lobby status, whether we are waiting for players or lobby is full*/}
            <p className={styles.tagline}>
                YOU ARE THE HOST OF THE LOBBY
            </p>
            <p className={styles.tagline}>
                {isConnecting 
                    ? 'CONNECTING TO ROOM...' 
                    : lobbyFull 
                        ? 'LOBBY IS FULL' 
                        : `WAITING FOR OTHER PLAYERS (${players.length}/${maxPlayers})`
                }
            </p>

            <p className={styles.tagline}>SHARE LOBBY ID: {gameId}</p>

            <p className={styles.tagline}>PLAYERS JOINED:</p>

            {/* Live Player List */}
            <div style={{ margin: '1rem 0' }}>
                {players.length === 0 ? (
                    <p style={{ opacity: 0.7 }}>No players yet...</p>
                ) : (
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {players.map((p, index) => (
                            <li key={p.id || index} style={{ margin: '0.5rem 0' }}>
                                👤 {p.name}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Main actions container */}
            <div className={styles.actionContainer}>
                <button className={styles.start_button} onClick={() => setCurrentView('party')}>
                    BACK
                </button>
                <button 
                    className={styles.start_button}
                    disabled={!lobbyFull || isConnecting}
                >
                    START GAME
                </button>
            </div>
        </div>
    );
}

export default PartyWaitingRoom;