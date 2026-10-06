import TimeToggle from '../TimeToggle/TimeToggle';
import RangeToggle from '../RangeToggle/RangeToggle';
import styles from './PartyLobby.module.css';
import { useState } from 'react';

function PartyLobby({ setCurrentView, setGameId, setIsHost }) {
    const [playerCount, setPlayerCount] = useState(4);
    const [timeLimit, setTimeLimit] = useState(5);
    const [nickname, setNickname] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

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
        
        const pId = data.playerId || data.player?.id || data.id;

        if (pId) {
            localStorage.setItem('playerId', pId);
            localStorage.setItem(`party_player_${targetGameId}`, pId);
            localStorage.setItem('nickname', nickname);
            console.log('Saved local player ID:', pId);
        } else {
            console.warn('No player ID returned from join API. Response was:', data);
        }
    };

    // Orchestrates sequential creation and navigation
    const handleStart = async (e) => {
        if (e) e.preventDefault();
        setErrorMessage('');

        if (!nickname.trim()) {
            setErrorMessage('Please enter a nickname before creating a room.');
            return;
        }

        try {
            setIsCreating(true);
            
            // 1. Create the lobby
            const newGameId = await handleCreateLobby();
            
            // 2. Join the newly created lobby
            await handleCreatePlayer(newGameId, nickname.trim());

            // 3. Set host state
            setIsHost(true);
            
            // 4. Switch view
            setCurrentView('partywaitingroom');
            
        } catch (error) {
            console.error('Failed to start party session:', error);
            setErrorMessage('Could not set up lobby. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className={styles.home}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <p className={styles.tagline}>HOST A GAME</p>
                    <h1 className={styles.title}>Create Lobby</h1>
                </div>

                <form className={styles.form} onSubmit={handleStart}>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Players</label>
                        <RangeToggle value={playerCount} onChange={setPlayerCount} />
                    </div>

                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Time Limit</label>
                        <TimeToggle value={timeLimit} onChange={setTimeLimit} />
                    </div>

                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Host Nickname</label>
                        <input 
                            type="text" 
                            placeholder="Enter your alias" 
                            className={styles.lobbyInput} 
                            value={nickname}
                            maxLength={16}
                            onChange={(e) => setNickname(e.target.value)}
                            disabled={isCreating}
                        />
                    </div>

                    {errorMessage && <div className={styles.errorBadge}>{errorMessage}</div>}

                    <div className={styles.buttonGroup}>
                        <button 
                            type="button"
                            className={styles.backButton} 
                            onClick={() => setCurrentView('party')}
                            disabled={isCreating}
                        >
                            Back
                        </button>
                        <button 
                            type="submit" 
                            className={styles.createButton} 
                            disabled={isCreating}
                        >
                            {isCreating ? (
                                <span className={styles.loadingFlex}>
                                    <span className={styles.spinner}></span>
                                    Creating...
                                </span>
                            ) : (
                                'Create Lobby'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default PartyLobby;