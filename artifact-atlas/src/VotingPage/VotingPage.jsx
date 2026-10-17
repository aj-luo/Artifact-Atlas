import styles from './VotingPage.module.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

function ArtifactImageViewer({ src, alt }) {
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        if (!isExpanded) return;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setIsExpanded(false);
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isExpanded]);

    return (
        <>
            <div className={styles.imageWrapper}>
                <button
                    type="button"
                    className={styles.imageButton}
                    onClick={() => setIsExpanded(true)}
                    aria-label={`View ${alt} full screen`}
                >
                    <img src={src} alt={alt} className={styles.artifactImage} />
                </button>
            </div>
            {isExpanded && (
                <div
                    className={styles.imageLightbox}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`${alt} full screen`}
                    onClick={() => setIsExpanded(false)}
                >
                    <button
                        type="button"
                        className={styles.closeLightbox}
                        onClick={() => setIsExpanded(false)}
                        aria-label="Close full screen image"
                        autoFocus
                    >
                        ×
                    </button>
                    <img
                        src={src}
                        alt={alt}
                        className={styles.expandedArtifactImage}
                        onClick={(event) => event.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
}

function VotingPage({ setCurrentView, gameId, isHost, players = [], myRole, image, roundDuration, setIsCorrect, setGuessTimedOut }) {
    const [descriptions, setDescriptions] = useState({});
    const [loading, setLoading] = useState(true);
    const [selectedPlayerId, setSelectedPlayerId] = useState(null);
    const [decisionTimeLeft, setDecisionTimeLeft] = useState(null);
    const channelRef = useRef(null);
    const decisionDeadlineRef = useRef(null);
    const guessSubmittedRef = useRef(false);
    const timeoutHandledRef = useRef(false);
    const formatTime = (seconds) => {
        if (seconds == null) return '--:--';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    };

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
                        setGuessTimedOut(Boolean(payload.payload.timedOut));
                        setCurrentView('resultpage');
                    }
                }
            )
            .subscribe();
        channelRef.current = channel;

        return () => {
            isSubscribed = false;
            channelRef.current = null;
            supabase.removeChannel(channel);
        };
    }, [gameId, setCurrentView, setIsCorrect, setGuessTimedOut]);

    const descriptionEntries = Object.entries(descriptions);
    const isGuesser = myRole?.toLowerCase() === 'guesser';
    const allSubmissionsReceived = players.length > 0 && descriptionEntries.length >= players.length - 1;

    const handleGuessTimeout = useCallback(async () => {
        if (timeoutHandledRef.current || guessSubmittedRef.current) return;
        timeoutHandledRef.current = true;
        setIsCorrect(false);
        setGuessTimedOut(true);

        try {
            await channelRef.current?.send({
                type: 'broadcast',
                event: 'guess_submitted',
                payload: { isCorrect: false, timedOut: true },
            });
        } finally {
            setCurrentView('resultpage');
        }
    }, [setCurrentView, setGuessTimedOut, setIsCorrect]);

    useEffect(() => {
        if (!allSubmissionsReceived || roundDuration == null) return;

        if (decisionDeadlineRef.current == null) {
            decisionDeadlineRef.current = Date.now() + roundDuration * 1000;
        }
        const deadline = decisionDeadlineRef.current;
        const updateRemaining = () => {
            setDecisionTimeLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
        };
        updateRemaining();
        const timer = setInterval(updateRemaining, 250);
        return () => clearInterval(timer);
    }, [allSubmissionsReceived, roundDuration]);

    useEffect(() => {
        if (isGuesser && allSubmissionsReceived && decisionTimeLeft === 0) {
            void handleGuessTimeout();
        }
    }, [isGuesser, allSubmissionsReceived, decisionTimeLeft, handleGuessTimeout]);

    const handleGuessArcheologist = async () => {
        if (!selectedPlayerId || decisionTimeLeft === 0 || timeoutHandledRef.current) return;
        guessSubmittedRef.current = true;

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

            timeoutHandledRef.current = true;
            setIsCorrect(isCorrect);
            setGuessTimedOut(false);

            await channelRef.current?.send({
                type: 'broadcast',
                event: 'guess_submitted',
                payload: { isCorrect, timedOut: false },
            });

            setCurrentView('resultpage');

        } catch (error) {
            console.error('Error in handleGuessArcheologist:', error);
            guessSubmittedRef.current = false;
            if (decisionTimeLeft === 0) void handleGuessTimeout();
        }
    };

    return (
        <div className={styles.home}>
            {allSubmissionsReceived && (
                <div
                    className={`${styles.timerBanner} ${decisionTimeLeft !== null && decisionTimeLeft <= 15 ? styles.lowTime : ''}`}
                    role="timer"
                    aria-label={`Guesser decision time remaining ${formatTime(decisionTimeLeft)}`}
                >
                    <span className={styles.timerLabel}>Guesser Decision Time</span>
                    <span className={styles.timerValue}>{formatTime(decisionTimeLeft)}</span>
                </div>
            )}
            {isGuesser && allSubmissionsReceived && decisionTimeLeft !== null && (
                <p className={styles.decisionPrompt}>
                    You have <strong>{formatTime(decisionTimeLeft)}</strong> to make your decision.
                </p>
            )}

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
                    <ArtifactImageViewer src={image} alt="Artifact" />
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
                                disabled={!selectedPlayerId || decisionTimeLeft === 0}
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
                            <p className={allSubmissionsReceived ? styles.deliberatingMessage : ''}>
                                {allSubmissionsReceived ? 'Guesser is deliberating' : 'Waiting for all player descriptions...'}
                            </p>
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
