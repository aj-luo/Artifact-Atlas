import styles from './ResultPage.module.css';
import { supabase } from '../lib/supabaseClient';
import { useEffect, useState, useRef } from 'react';

function ResultPage({ isCorrect, isHost, gameId, setCurrentView }) {

    const channelRef = useRef(null);
    const [starting, setStarting] = useState(false);
    const [archeologist, setArcheologist] = useState('');
    const [archeologistDescription, setArcheologistDescription] = useState('');
    const [artifactUrl, setArtifactUrl] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!gameId) return;

        const fetchArcheologist = async () => {
            try {
                const response = await fetch(`/api/party/${gameId}/archeologist`);
                if (response.ok) {
                    const data = await response.json();
                    setArcheologist(data.nickname);
                    setArcheologistDescription(data.description || 'No description submitted.');
                    setArtifactUrl(data.artifact_url || '');
                }
            } catch (error) {
                console.error('Failed to fetch archeologist:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchArcheologist();
    }, [gameId]);

    useEffect(() => {
        if (!gameId) return;

        const channel = supabase.channel(`party_game:${gameId}`);
        channelRef.current = channel;

        channel.on('broadcast', { event: 'game-restarting' }, (event) => {
            console.log('Game start signal received:', event);
            setStarting(true);

            setTimeout(() => {
                setCurrentView('gameintro');
            }, 1000);
        });

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Successfully subscribed to party game channel');
            }
        });

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [gameId, setCurrentView]);

    const handleNewGame = async () => {
        setStarting(true);

        try {
            const response = await fetch(`/api/party/${gameId}/reset`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                setStarting(false);
                alert('Failed to start new game.');
                throw new Error('Failed to start new game');
            }

            if (channelRef.current) {
                await channelRef.current.send({
                    type: 'broadcast',
                    event: 'game-restarting',
                });
            }

            setTimeout(() => {
                setCurrentView('gameintro');
            }, 1000);
        } catch (error) {
            console.error('Failed to reset game:', error);
            setStarting(false);
        }
    };

    return (
        <div className={styles.container}>
            {starting ? (
                <div className={styles.statusBox}>
                    <span className={styles.spinner}></span>
                    <p>Starting Next Round...</p>
                </div>
            ) : (
                <div className={styles.resultContainer}>
                    {isCorrect ? (
                        <div className={`${styles.resultCard} ${styles.correct}`}>
                            <span className={styles.outcomeBadge}>Victory</span>
                            <h2 className={styles.resultTitle}>Correct Guess! 🎉</h2>
                            
                            <p className={styles.resultDescription}>
                                The Guesser successfully identified the true Archeologist!
                            </p>

                            <div className={styles.archeologistBox}>
                                <span className={styles.archeologistLabel}>True Archeologist</span>
                                <span className={styles.archeologistName}>
                                    {loading ? '...' : archeologist || 'Unknown'}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className={`${styles.resultCard} ${styles.wrong}`}>
                            <span className={styles.outcomeBadge}>Imposters Win</span>
                            <h2 className={styles.resultTitle}>Wrong Guess! 🎭</h2>
                            
                            <p className={styles.resultDescription}>
                                The Imposters successfully deceived the Guesser!
                            </p>

                            <div className={styles.archeologistBox}>
                                <span className={styles.archeologistLabel}>True Archeologist Was</span>
                                <span className={styles.archeologistName}>
                                    {loading ? '...' : archeologist || 'Unknown'}
                                </span>
                            </div>
                        </div>
                    )}

                    <div className={styles.revealCard}>
                        <div className={styles.revealSection}>
                            <span className={styles.revealLabel}>True Archeologist’s Description</span>
                            <p className={styles.revealText}>
                                {loading ? 'Loading…' : archeologistDescription || 'No description submitted.'}
                            </p>
                        </div>
                        <div className={styles.revealSection}>
                            <span className={styles.revealLabel}>Artifact URL</span>
                            {loading ? (
                                <p className={styles.revealText}>Loading…</p>
                            ) : artifactUrl ? (
                                <a className={styles.artifactLink} href={artifactUrl} target="_blank" rel="noreferrer">
                                    {artifactUrl}
                                </a>
                            ) : (
                                <p className={styles.revealText}>URL unavailable.</p>
                            )}
                        </div>
                    </div>

                    {/* Action Area */}
                    <div className={styles.actionCard}>
                        {isHost ? (
                            <button 
                                className={styles.newGameButton} 
                                onClick={handleNewGame}
                            >
                                START NEW GAME
                            </button>
                        ) : (
                            <div className={styles.waitingState}>
                                <span className={styles.pulseDot}></span>
                                <p>Waiting for host to start a new game...</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default ResultPage;
