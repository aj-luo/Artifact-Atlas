import TimeToggle from '../TimeToggle/TimeToggle';
import RangeToggle from '../RangeToggle/RangeToggle';
import styles from './PartyLobby.module.css';
import { useState } from 'react';

function PartyLobby({ setCurrentView }) {
    //These are the default values for time limit and player count. They can be changed by the user using the toggles below. hooks can be used to store the values and update them when the user changes them. The values can then be passed to the backend when creating the lobby.
    const [playerCount, setPlayerCount] = useState(4);
    const [timeLimit, setTimeLimit] = useState(5);

    //hook to track whether the lobby is being created or not. We also want to check the status, if it is true then we have a loading gif replace the create button.
    const [isCreating, setIsCreating] = useState(false);

    const handleCreateLobby = async () => {
        setIsCreating(true);
        try {
            const response = await fetch('/api/party/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    playerCount: playerCount,
                    countdownMinutes: timeLimit,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to create lobby');
            }

            const data = await response.json();
            console.log('Lobby Created successfully with ID:', data.gameId);

            // Optional: Store data.gameId in state or context here before transitioning
            setCurrentView('lobby'); // or wherever players wait in lobby
        } catch (error) {
            console.error('Error creating lobby:', error);
            alert('Could not create lobby. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className={styles.home}>
            <p className={styles.tagline}>CREATE A LOBBY</p>

            {/*These are the toggles for player count and time limit */}    
            <RangeToggle value={playerCount} onChange={setPlayerCount} />
            <TimeToggle value={timeLimit} onChange={setTimeLimit} />
    
            {/* Main actions container */}
            <div className={styles.actionContainer}>
                <button className={styles.start_button} onClick={() => setCurrentView('party')}>
                    BACK
                </button>
                <button className={styles.start_button}>
                    CREATE
                </button>
            </div>
        </div>
    );
}

export default PartyLobby;