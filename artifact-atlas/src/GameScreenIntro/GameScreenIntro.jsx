import styles from './GameScreenIntro.module.css';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

function GameScreenIntro({ setCurrentView, gameId, isHost, players = [], setMyRole }) {
    const [isStarting, setStarting] = useState(false);
    const channelRef = useRef(null);

    // Only host picks the guesser now
    const [guesser, setGuesser] = useState('');

    // Check if the guesser role is picked before allowing game start
    const isPicked = guesser !== '';

    // Helper function to figure out a player's role given chosen IDs
    const determineRole = (myPlayerId, archeologistId, guesserId) => {
        if (myPlayerId === archeologistId) return 'archeologist';
        if (myPlayerId === guesserId) return 'guesser';
        return 'imposter';
    };

    // Set up the realtime channel for ALL players (Host and Guests)
    useEffect(() => {
        if (!gameId) return;

        // 1. Create channel instance
        const channel = supabase.channel(`party_game:${gameId}`);
        channelRef.current = channel;

        // 2. Register broadcast listener BEFORE subscribing
        channel.on('broadcast', { event: 'game-starting' }, (event) => {
            console.log('Game start signal received:', event);
            setStarting(true);

            const myPlayerId = localStorage.getItem(`party_player_${gameId}`) || localStorage.getItem('playerId');
            const { archeologist: archId, guesser: guessId } = event.payload;

            // Determine client's role
            const assignedRole = determineRole(myPlayerId, archId, guessId);

            // Update role in parent state
            if (typeof setMyRole === 'function') {
                setMyRole(assignedRole);
            }
            console.log(`Assigned role via broadcast: ${assignedRole}`);

            setCurrentView('gamePlay');
        });

        // 3. Subscribe to the channel
        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Successfully subscribed to party game channel');
            }
        });

        // 4. Cleanup channel when component unmounts
        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [gameId, setCurrentView, setMyRole]);

    const handleStart = async () => {
        try {
            setStarting(true);

            // 1. Randomly pick Archeologist from remaining eligible players (excluding Guesser)
            const eligiblePlayers = players.filter((p) => p.id !== guesser);

            if (eligiblePlayers.length === 0) {
                alert('Not enough players to select an Archeologist!');
                setStarting(false);
                return;
            }

            const randomIndex = Math.floor(Math.random() * eligiblePlayers.length);
            const selectedArcheologistId = eligiblePlayers[randomIndex].id;

            console.log(`Guesser: ${guesser}, Randomly Picked Archeologist: ${selectedArcheologistId}`);

            // 2. Send API call to initialize game on server
            const response = await fetch(`/api/party/${gameId}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ archeologist: selectedArcheologistId, guesser }),
            });

            if (!response.ok) {
                alert('Failed to create game.');
                throw new Error('Failed to create game');
            }

            // 3. Broadcast roles to all connected guest players
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

            // 4. Set the HOST'S own role directly
            const myPlayerId = localStorage.getItem(`party_player_${gameId}`) || localStorage.getItem('playerId');
            const hostRole = determineRole(myPlayerId, selectedArcheologistId, guesser);
            
            if (typeof setMyRole === 'function') {
                setMyRole(hostRole);
            }
            console.log(`Host role set directly: ${hostRole}`);

            // 5. Go to gameplay screen
            setCurrentView('gamePlay');

        } catch (error) {
            console.error('Failed to start', error);
            setStarting(false);
        }
    };

    return (
        <div className={styles.home}>
            <p className={styles.tagline}>
                HOST/ADMIN WILL PICK ONE GUESSER. THE ARCHEOLOGIST WILL BE RANDOMLY ASSIGNED, AND THE OTHER PLAYERS WILL BE SET TO IMPOSTERS. ONCE THE GAME STARTS, YOU WILL GET THE TIME LIMIT TO WRITE AN EXPLANATION OF THE ARTIFACT. THE TRUE ARCHEOLOGIST WILL BE ABLE TO SEE THE ARTIFACT DETAILS AND IMAGE WHILE THE OTHERS WILL ONLY SEE AN IMAGE.
                AT THE END OF THE TIME LIMIT, THE GUESSER WILL HAVE TO GUESS WHO THE TRUE ARCHEOLOGIST IS. IF THEY GUESS CORRECTLY, THE ARCHEOLOGIST AND GUESSER WIN. IF THEY GUESS INCORRECTLY, THE IMPOSTERS WIN.
            </p>

            {/* Main actions container */}
            {isStarting ? (
                <p>Starting Game....</p>
            ) : (
                <div className={styles.actionContainer}>
                    {isHost ? (
                        <>
                            {/* Host only selects the guesser */}
                            <label htmlFor="guesser-select">Select Guesser:</label>
                            <select 
                                id="guesser-select" 
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

                            {/* Show "BEGIN GAME" button once guesser is selected */}
                            {isPicked ? (
                                <button className={styles.start_button} onClick={handleStart}>
                                    SELECT ROLES
                                </button>
                            ) : (
                                <p style={{ color: '#888' }}>Please select a Guesser to begin.</p>
                            )}
                        </>
                    ) : (
                        <p>Waiting for host to pick roles and start the game...</p>
                    )}
                </div>
            )}
        </div>
    );
}

export default GameScreenIntro;