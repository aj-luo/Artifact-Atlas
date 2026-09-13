import styles from './JoinLobby.module.css';
import { useState } from 'react';

function JoinLobby({ setCurrentView }) {
    const [lobbyCode, setLobbyCode] = useState('');
    const [nickname, setNickname] = useState('');
    const [isJoining, setIsJoining] = useState(false);

    const handleJoinLobby = async () => { // 1. Added async
    if (!lobbyCode.trim() || !nickname.trim()) {
        alert('Please enter both a lobby code and a nickname.');
        return;
    }

    try {
        setIsJoining(true);
        console.log(`Joining lobby with code: ${lobbyCode} and nickname: ${nickname}`);

        // 2. Added await here
        const response = await fetch(`/api/party/${lobbyCode}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: nickname }),
        });

        if (!response.ok) {
            throw new Error('Failed to join lobby');
        }

        // 3. Added await here
        const data = await response.json(); 
        
        // Persist local player ID if returned
        if (data.playerId) {
            localStorage.setItem('playerId', data.playerId);
        }

        console.log('Joined Lobby successfully:', data);
        setCurrentView('partywaitingroom');
    } catch (error) {
        console.error('Error joining lobby:', error);
        alert('Could not join lobby. Please check your lobby code.');
    } finally {
        setIsJoining(false);
    }
};

    return (
        <div className={styles.home}>
            <p className={styles.tagline}>JOIN LOBBY</p>
    
            {/* Main actions container */}
            <div className={styles.actionContainer}>
                <button className={styles.start_button} onClick={() => setCurrentView('party')}>
                    BACK
                </button>
                
                {/* Join group holding the Join button and input */}
                <div className={styles.joinGroup}>
                    <button className={styles.start_button} onClick={handleJoinLobby} disabled={isJoining}>
                        {isJoining ? 'JOINING...' : 'JOIN'}
                    </button>
                    <input 
                        type="text" 
                        placeholder="Enter Lobby Code" 
                        className={styles.lobbyInput} 
                        value={lobbyCode}
                        onChange={(e) => setLobbyCode(e.target.value)}
                    />
                    <input 
                        type="text" 
                        placeholder="Enter Nickname" 
                        className={styles.lobbyInput} 
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                    />
                </div>
            </div>
        </div>
    );
}

export default JoinLobby;