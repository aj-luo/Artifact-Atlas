import TimeToggle from '../TimeToggle/TimeToggle';
import RangeToggle from '../RangeToggle/RangeToggle';
import styles from './PartyLobby.module.css';
import { useState } from 'react';

function PartyLobby({ setCurrentView, setGameId }) {
    const [playerCount, setPlayerCount] = useState(4);
    const [timeLimit, setTimeLimit] = useState(5);
    const [nickname, setNickname] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Creates the game lobby and returns the new gameId
    const handleCreateLobby = async () => {
        const response = await fetch('/api/party/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        
        // Save game ID to parent state
        setGameId(data.gameId);
        return data.gameId;
    };

    // Joins the created game lobby using the passed gameId and nickname
    const handleCreatePlayer = async (targetGameId, playerNickname) => {
        const response = await fetch(`/api/party/${targetGameId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: playerNickname }),
        });

        if (!response.ok) {
            throw new Error('Failed to join lobby');
        }

        const data = await response.json();
        console.log('Joined Lobby successfully:', data);
        
        // Persist local player ID if returned
        if (data.playerId) {
            localStorage.setItem('playerId', data.playerId);
        }
    };

    // Orchestrates sequential creation and navigation
    const handleStart = async () => {
        if (!nickname.trim()) {
            alert('Please enter a nickname before creating a room.');
            return;
        }

        try {
            setIsCreating(true);
            
            // 1. Create the lobby and extract the new gameId directly
            const newGameId = await handleCreateLobby();
            
            // 2. Join the newly created lobby using the returned gameId
            await handleCreatePlayer(newGameId, nickname.trim());
            
            // 3. Navigate to waiting room on complete success
            setCurrentView('partywaitingroom');
        } catch (error) {
            console.error('Failed to start party session:', error);
            alert('Could not set up lobby. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className={styles.home}>
            <p className={styles.tagline}>CREATE A LOBBY</p>

            <RangeToggle value={playerCount} onChange={setPlayerCount} />
            <TimeToggle value={timeLimit} onChange={setTimeLimit} />

            <div className={styles.joinGroup}>
                <input 
                    type="text" 
                    placeholder="Enter Nickname" 
                    className={styles.lobbyInput} 
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                />
            </div>
    
            <div className={styles.actionContainer}>
                <button 
                    className={styles.start_button} 
                    onClick={() => setCurrentView('party')}
                    disabled={isCreating}
                >
                    BACK
                </button>
                <button 
                    className={styles.start_button} 
                    onClick={handleStart} 
                    disabled={isCreating}
                >
                    {isCreating ? 'Creating...' : 'CREATE'}
                </button>
            </div>
        </div>
    );
}

export default PartyLobby;