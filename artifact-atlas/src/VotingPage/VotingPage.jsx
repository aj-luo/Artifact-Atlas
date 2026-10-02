import styles from './VotingPage.module.css';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

function VotingPage({ setCurrentView, gameId, isHost, players, myRole, image, setIsCorrect }) {
    // Store descriptions as an object: { [playerId]: { explanation, nickname } | string }
    const [descriptions, setDescriptions] = useState({});
    const [loading, setLoading] = useState(true);
    
    // Track selected description/player for the Guesser
    const [selectedPlayerId, setSelectedPlayerId] = useState(null);

    // Helper to ensure descriptions are formatted as an object
    const parseDescriptions = (data) => {
        if (!data) return {};
        if (typeof data === 'string') {
            try {
                return JSON.parse(data);
            } catch (e) {
                console.error('Failed to parse descriptions JSON:', e);
                return {};
            }
        }
        return data; // Already a JSON object
    };

    useEffect(() => {
        if (!gameId) return;

        let isSubscribed = true;

        // 1. Fetch initial descriptions for this game
        const fetchInitialDescriptions = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('party_games')
                .select('descriptions')
                .eq('id', gameId)
                .single();

            if (!isSubscribed) return;

            if (error) {
                console.error('Error fetching initial descriptions:', error);
            } else if (data && data.descriptions) {
                setDescriptions(parseDescriptions(data.descriptions));
            }
            setLoading(false);
        };

        fetchInitialDescriptions();

        // 2. Set up Supabase Realtime listener
        const channel = supabase
            .channel(`party_games_changes_${gameId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'party_games',
                    filter: `id=eq.${gameId}`
                },
                (payload) => {
                    if (payload.new && payload.new.descriptions) {
                        setDescriptions(parseDescriptions(payload.new.descriptions));
                    }
                }
            )
            .on(
                'broadcast',
                { event: 'guess_submitted' },
                (payload) => {
                    console.log('Received guess_submitted broadcast:', payload);
                    if (payload.payload) {
                        setIsCorrect(payload.payload.isCorrect);
                        setCurrentView('resultpage');
                    }
                }
            )
            .subscribe();

        // 3. Cleanup subscription
        return () => {
            isSubscribed = false;
            supabase.removeChannel(channel);
        };
    }, [gameId, setCurrentView, setIsCorrect]);

    // Handle guessing action
    const handleGuessArcheologist = async () => {
        if (!selectedPlayerId) return;
        
        console.log('Guessing player as Archeologist:', selectedPlayerId);

        try {
            const response = await fetch(`/api/party/${gameId}/guess`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId: selectedPlayerId }),
            });

            if (!response.ok) {
                throw new Error('Failed to submit guess');
            }

            const data = await response.json();
            console.log('Guess submitted successfully:', data);

            const isCorrect = data.isArcheologist;

            // Once we get the result, we store it in local state
            setIsCorrect(isCorrect);

            // Broadcast result to all other players in the room channel
            const channel = supabase.channel(`party_games_changes_${gameId}`);
            await channel.send({
                type: 'broadcast',
                event: 'guess_submitted',
                payload: { isCorrect },
            });

            // Switch the guesser's view to resultpage
            setCurrentView('resultpage');

        } catch (error) {
            console.error('Error in handleGuessArcheologist:', error);
        }
    };

    // Convert the key-value map into an array for rendering
    const descriptionEntries = Object.entries(descriptions);
    const isGuesser = myRole?.toLowerCase() === 'guesser';

    return (
        <div className={styles.home}>
            <p>VOTING PAGE</p>
            {image && (
                <img 
                    src={image} 
                    alt="Artifact" 
                    className={styles.artifactImage} 
                />
            )}

            <p>Descriptions</p>
            
            {loading ? (
                <p>Loading descriptions...</p>
            ) : descriptionEntries.length === 0 ? (
                <p>No descriptions submitted yet.</p>
            ) : isGuesser ? (
                /* ================= GUESSER VIEW ================= */
                <>
                    <div className={styles.descriptionList}>
                        {descriptionEntries.map(([playerId, entry]) => {
                            const isObject = typeof entry === 'object' && entry !== null;
                            const nickname = isObject ? entry.nickname || 'Anonymous' : 'Anonymous';
                            const text = isObject ? entry.explanation : entry;
                            const isSelected = selectedPlayerId === playerId;

                            return (
                                <button
                                    key={playerId}
                                    type="button"
                                    className={`${styles.descriptionCard} ${styles.selectableCard} ${
                                        isSelected ? styles.selectedCard : ''
                                    }`}
                                    onClick={() => setSelectedPlayerId(playerId)}
                                >
                                    <p><strong>{nickname}:</strong> {text}</p>
                                </button>
                            );
                        })}
                    </div>

                    {/* Guess Action Button */}
                    <button
                        className={styles.guessButton}
                        disabled={!selectedPlayerId}
                        onClick={handleGuessArcheologist}
                    >
                        Guess Archeologist
                    </button>
                </>
            ) : (
                /* ================= NON-GUESSER VIEW ================= */
                <>
                    <p>Waiting for guesser to choose.....</p>
                    <div className={styles.descriptionList}>
                        {descriptionEntries.map(([playerId, entry]) => {
                            const isObject = typeof entry === 'object' && entry !== null;
                            const nickname = isObject ? entry.nickname || 'Anonymous' : 'Anonymous';
                            const text = isObject ? entry.explanation : entry;

                            return (
                                <div key={playerId} className={styles.descriptionCard}>
                                    <p><strong>{nickname}:</strong> {text}</p>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

export default VotingPage;