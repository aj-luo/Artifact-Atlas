import styles from './VotingPage.module.css';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

function VotingPage({ setCurrentView, gameId, isHost, players, myRole, image, setIsCorrect }) {
    const [descriptions, setDescriptions] = useState({});
    const [loading, setLoading] = useState(true);
    const [selectedPlayerId, setSelectedPlayerId] = useState(null);

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
        return data;
    };

    useEffect(() => {
        if (!gameId) return;

        let isSubscribed = true;

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
                    if (payload.payload) {
                        setIsCorrect(payload.payload.isCorrect);
                        setCurrentView('resultpage');
                    }
                }
            )
            .subscribe();

        return () => {
            isSubscribed = false;
            supabase.removeChannel(channel);
        };
    }, [gameId, setCurrentView, setIsCorrect]);

    const handleGuessArcheologist = async () => {
        if (!selectedPlayerId) return;

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
            const isCorrect = data.isArcheologist;

            setIsCorrect(isCorrect);

            const channel = supabase.channel(`party_games_changes_${gameId}`);
            await channel.send({
                type: 'broadcast',
                event: 'guess_submitted',
                payload: { isCorrect },
            });

            setCurrentView('resultpage');

        } catch (error) {
            console.error('Error in handleGuessArcheologist:', error);
        }
    };

    const descriptionEntries = Object.entries(descriptions);
    const isGuesser = myRole?.toLowerCase() === 'guesser';

    return (
        <div className={styles.home}>
            {/* Header / Briefing Section */}
            <header className={styles.headerGroup}>
                <div className={styles.headerBadge}>
                    {isGuesser ? 'Guesser Phase' : 'Voting Phase'}
                </div>
                <h2 className={styles.title}>
                    {isGuesser ? 'Identify the Archeologist' : 'Submissions Under Review'}
                </h2>
                <p className={styles.subtitle}>
                    {isGuesser 
                        ? 'Read through all descriptions below and select who you think is the real Archeologist.'
                        : 'The Guesser is reviewing all submitted descriptions...'
                    }
                </p>
            </header>

            {/* Artifact Reference Image */}
            {image && (
                <div className={styles.artifactCard}>
                    <div className={styles.imageWrapper}>
                        <img src={image} alt="Artifact" className={styles.artifactImage} />
                    </div>
                </div>
            )}

            {/* Submissions Section */}
            <div className={styles.submissionsContainer}>
                <div className={styles.sectionHeader}>
                    <span className={styles.sectionTitle}>Submitted Descriptions</span>
                    <span className={styles.countBadge}>{descriptionEntries.length} Received</span>
                </div>

                {loading ? (
                    <div className={styles.statusBox}>
                        <span className={styles.spinner}></span>
                        <p>Loading descriptions...</p>
                    </div>
                ) : descriptionEntries.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p>No descriptions submitted yet.</p>
                    </div>
                ) : isGuesser ? (
                    /* ================= GUESSER INTERACTIVE VIEW ================= */
                    <div className={styles.guesserSection}>
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
                                        <div className={styles.cardHeader}>
                                            <span className={styles.authorTag}>{nickname}</span>
                                            {isSelected && <span className={styles.checkIcon}>✓ Selected</span>}
                                        </div>
                                        <p className={styles.descriptionText}>{text}</p>
                                    </button>
                                );
                            })}
                        </div>

                        <div className={styles.actionCard}>
                            <button
                                className={styles.guessButton}
                                disabled={!selectedPlayerId}
                                onClick={handleGuessArcheologist}
                            >
                                SUBMIT GUESS
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ================= NON-GUESSER VIEW ================= */
                    <div className={styles.spectatorSection}>
                        <div className={styles.waitingState}>
                            <span className={styles.pulseDot}></span>
                            <p>Waiting for the Guesser to make their decision...</p>
                        </div>

                        <div className={styles.descriptionList}>
                            {descriptionEntries.map(([playerId, entry]) => {
                                const isObject = typeof entry === 'object' && entry !== null;
                                const nickname = isObject ? entry.nickname || 'Anonymous' : 'Anonymous';
                                const text = isObject ? entry.explanation : entry;

                                return (
                                    <div key={playerId} className={styles.descriptionCard}>
                                        <div className={styles.cardHeader}>
                                            <span className={styles.authorTag}>{nickname}</span>
                                        </div>
                                        <p className={styles.descriptionText}>{text}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default VotingPage;