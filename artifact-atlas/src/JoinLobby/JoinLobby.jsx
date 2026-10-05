import styles from './JoinLobby.module.css';
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

function JoinLobby({ setCurrentView, setGameId }) {
    const [lobbyCode, setLobbyCode] = useState('');
    const [nickname, setNickname] = useState('');
    const [isJoining, setIsJoining] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const handleJoinLobby = async (e) => {
        if (e) e.preventDefault();
        setErrorMessage('');

        if (!lobbyCode.trim() || !nickname.trim()) {
            setErrorMessage('Please fill in both the lobby code and your nickname.');
            return;
        }

        try {
            setIsJoining(true);
            const cleanCode = lobbyCode.trim();
            console.log(`Joining lobby with code: ${cleanCode} and nickname: ${nickname}`);

            const response = await fetch(`/api/party/${cleanCode}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nickname }),
            });

            if (!response.ok) {
                setErrorMessage('Failed to join lobby. Code may be invalid or room is full.');
                setIsJoining(false);
                return;
            }

            const data = await response.json(); 
            
            // Persist local player ID if returned
            if (data.playerId) {
                localStorage.setItem('playerId', data.playerId);
                localStorage.setItem('nickname', nickname);
            }

            console.log('Joined Lobby successfully:', data);

            // Realtime broadcast setup
            if (data.playerId) {
                const channel = supabase.channel(`party_game:${cleanCode}`);

                channel.subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('Successfully subscribed to channel, sending broadcast...');
                        
                        await channel.send({
                            type: 'broadcast',
                            event: 'game-state',
                            payload: {
                                player: { id: data.playerId, name: nickname }
                            }
                        });

                        setTimeout(() => {
                            supabase.removeChannel(channel);
                        }, 200);

                        setGameId(cleanCode);
                        setCurrentView('partywaitingroom');
                    }
                });
            } else {
                setGameId(cleanCode);
                setCurrentView('partywaitingroom');
            }
        } catch (error) {
            console.error('Error joining lobby:', error);
            setErrorMessage('Could not connect to lobby. Please check your network.');
            setIsJoining(false);
        }
    };

    return (
        <div className={styles.container}>
            {/* Header Section */}
            <header className={styles.headerGroup}>
                <div className={styles.headerBadge}>Party Mode</div>
                <h2 className={styles.title}>Join a Game</h2>
                <p className={styles.subtitle}>
                    Enter your room code or UUID and choose a nickname to join.
                </p>
            </header>

            {/* Input Card Form */}
            <form className={styles.card} onSubmit={handleJoinLobby}>
                {errorMessage && (
                    <div className={styles.errorBanner}>
                        <span className={styles.errorIcon}>⚠️</span>
                        <span>{errorMessage}</span>
                    </div>
                )}

                <div className={styles.inputGroup}>
                    <label className={styles.inputLabel} htmlFor="lobbyCode">Lobby Code / UUID</label>
                    <input 
                        id="lobbyCode"
                        type="text" 
                        placeholder="e.g. 1e706daa-0191-4ba1-95cf-1dfc5612b1d4" 
                        className={`${styles.lobbyInput} ${styles.codeContainer}`}
                        value={lobbyCode}
                        onChange={(e) => {
                            setLobbyCode(e.target.value);
                            setErrorMessage('');
                        }}
                    />
                </div>

                <div className={styles.inputGroup}>
                    <label className={styles.inputLabel} htmlFor="nickname">Your Nickname</label>
                    <input 
                        id="nickname"
                        type="text" 
                        placeholder="e.g. Explorer_99" 
                        className={styles.lobbyInput} 
                        value={nickname}
                        maxLength={16}
                        onChange={(e) => {
                            setNickname(e.target.value);
                            setErrorMessage('');
                        }}
                    />
                </div>

                <div className={styles.actionArea}>
                    <button 
                        type="submit" 
                        className={styles.joinButton} 
                        disabled={isJoining}
                    >
                        {isJoining ? (
                            <div className={styles.buttonContent}>
                                <span className={styles.spinner}></span>
                                <span>JOINING...</span>
                            </div>
                        ) : (
                            'JOIN LOBBY'
                        )}
                    </button>

                    <button 
                        type="button" 
                        className={styles.backButton} 
                        onClick={() => setCurrentView('party')}
                    >
                        ← BACK TO MENU
                    </button>
                </div>
            </form>
        </div>
    );
}

export default JoinLobby;