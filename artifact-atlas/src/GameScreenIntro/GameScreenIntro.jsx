import styles from './GameScreenIntro.module.css';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

function GameScreenIntro({ setCurrentView, gameId, isHost, players, setMyRole }) {
    const [isStarting, setStarting] = useState(false);
    const channelRef = useRef(null);

    // 1. State for selected player roles
    const [archeologist, setArcheologist] = useState('');
    const [guesser, setGuesser] = useState('');

    // Check if both roles are picked before allowing game start
    const isPicked = archeologist !== '' && guesser !== '';

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

            // 1. Send API call first to initialize game on server
            const response = await fetch(`/api/party/${gameId}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ archeologist, guesser }),
            });

            if (!response.ok) {
                alert('Failed to create game.');
                throw new Error('Failed to create game');
            }

            // 2. Broadcast roles to all connected guest players
            if (channelRef.current) {
                await channelRef.current.send({
                    type: 'broadcast',
                    event: 'game-starting',
                    payload: { 
                        message: 'Game is being started',
                        archeologist,
                        guesser
                    }
                });
            }

            // 3. Set the HOST'S own role directly
            const myPlayerId = localStorage.getItem(`party_player_${gameId}`) || localStorage.getItem('playerId');
            const hostRole = determineRole(myPlayerId, archeologist, guesser);
            
            if (typeof setMyRole === 'function') {
                setMyRole(hostRole);
            }
            console.log(`Host role set directly: ${hostRole}`);

            // 4. Go to gameplay screen
            setCurrentView('gamePlay');

        } catch (error) {
            console.error('Failed to start', error);
            setStarting(false);
        }
    };

    return (
        <div className={styles.home}>
            <p className={styles.tagline}>
                HOST/ADMIN WILL PICK ONE GUESSER AND ONE ARCHEOLOGIST. THE OTHER PLAYERS BY DEFAULT WILL BE SET TO IMPOSTERS. ONCE THE GAME STARTS, YOU WILL GET THE TIME LIMIT TO WRITE AN EXPLANATION OF THE ARTIFACT. THE TRUE ARCHEOLOGIST WILL BE ABLE TO SEE THE ARTIFACT DETAILS AND IMAGE WHILE THE OTHERS WILL ONLY SEE AN IMAGE.
                AT THE END OF THE TIME LIMIT, THE GUESSER WILL HAVE TO GUESS WHO THE TRUE ARCHEOLOGIST IS. IF THEY GUESS CORRECTLY, THE ARCHEOLOGIST AND GUESSER WIN. IF THEY GUESS INCORRECTLY, THE IMPOSTERS WIN.
            </p>

            {/* Main actions container */}
            {isStarting ? (
                <p>Starting Game....</p>
            ) : (
                <div className={styles.actionContainer}>
                    {isHost ? (
                        <>
                            {/* Make the host choose the archeologist */}
                            <label htmlFor="archeologist-select">Select Archeologist:</label>
                            <select 
                                id="archeologist-select" 
                                value={archeologist} 
                                onChange={(e) => setArcheologist(e.target.value)}
                            >
                                <option value="">-- Choose Player --</option>
                                {players.map((player) => (
                                    <option 
                                        key={player.id} 
                                        value={player.id}
                                        disabled={player.id === guesser}
                                    > 
                                        {player.name}
                                    </option>
                                ))}
                            </select>

                            {/* Make the host choose the guesser */}
                            <label htmlFor="guesser-select">Select Guesser:</label>
                            <select 
                                id="guesser-select" 
                                value={guesser} 
                                onChange={(e) => setGuesser(e.target.value)}
                            >
                                <option value="">-- Choose Player --</option>
                                {players.map((player) => (
                                    // Disable selecting the same player as archeologist
                                    <option 
                                        key={player.id} 
                                        value={player.id} 
                                        disabled={player.id === archeologist}
                                    >
                                        {player.name}
                                    </option>
                                ))}
                            </select>

                            {/* Show "BEGIN GAME" button only after both roles are picked */}
                            {isPicked ? (
                                <button className={styles.start_button} onClick={handleStart}>
                                    SELECT ROLES
                                </button>
                            ) : (
                                <p style={{ color: '#888' }}>Please select both an Archeologist and a Guesser to begin.</p>
                            )}
                        </>
                    ) : (
                        <p>waiting for host to pick roles and start the game...</p>
                    )}
                </div>
            )}
        </div>
    );
}

export default GameScreenIntro;