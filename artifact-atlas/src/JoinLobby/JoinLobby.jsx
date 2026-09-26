import styles from './JoinLobby.module.css';
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

function JoinLobby({ setCurrentView, setGameId }) {
    const [lobbyCode, setLobbyCode] = useState('');
    const [nickname, setNickname] = useState('');
    const [isJoining, setIsJoining] = useState(false);

    const handleJoinLobby = async () => {
        if (!lobbyCode.trim() || !nickname.trim()) {
            alert('Please enter both a lobby code and a nickname.');
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
                throw new Error('Failed to join lobby');
            }

            const data = await response.json(); 
            
            // Persist local player ID if returned
            if (data.playerId) {
                localStorage.setItem('playerId', data.playerId);
            }

            console.log('Joined Lobby successfully:', data);

            // Realtime broadcast setup
            if (data.playerId) {
                const channel = supabase.channel(`party_game:${cleanCode}`);

                // Subscribe to the channel to send the broadcast message
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

                        // 1. Give the WebSocket a tiny window to flush the message before cleanup
                        setTimeout(() => {
                            supabase.removeChannel(channel);
                        }, 200);

                        // 2. Navigate ONLY AFTER subscription & broadcast dispatch complete
                        setGameId(cleanCode);
                        setCurrentView('partywaitingroom');
                    }
                });
            } else {
                // Fallback navigation if no playerId returned
                setGameId(cleanCode);
                setCurrentView('partywaitingroom');
            }
        } catch (error) {
            console.error('Error joining lobby:', error);
            alert('Could not join lobby. Please check your lobby code.');
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