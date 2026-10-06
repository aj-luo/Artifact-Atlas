import styles from './GameScreenProper.module.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

// Helper to format remaining seconds into M:SS format
const formatTime = (seconds) => {
    if (seconds == null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

// 3 different sublayouts (Lobby / Briefing View)
function ArcheologistLayout() {
    return (
        <div className={`${styles.roleCard} ${styles.archeologistRole}`}>
            <span className={styles.roleBadge}>Role Assigned</span>
            <h2>YOU ARE THE ARCHEOLOGIST 📜</h2>
            <p>You will see the full artifact details and the image. Write an accurate, convincing description to guide the Guesser.</p>
        </div>
    );
}

function GuesserLayout() {
    return (
        <div className={`${styles.roleCard} ${styles.guesserRole}`}>
            <span className={styles.roleBadge}>Role Assigned</span>
            <h2>YOU ARE THE GUESSER 🔍</h2>
            <p>Wait for all players to submit their descriptions, then deduce who the true Archeologist is.</p>
        </div>
    );
}

function ImposterLayout() {
    return (
        <div className={`${styles.roleCard} ${styles.imposterRole}`}>
            <span className={styles.roleBadge}>Role Assigned</span>
            <h2>YOU ARE THE IMPOSTER 🎭</h2>
            <p>You will only see the image! Bluff your description convincing enough to trick the Guesser into choosing you.</p>
        </div>
    );
}

// Active gameplay view for Archeologist
function ArcheologistGameplay({ imageUrl, artifactName, artifactUrl, setCurrentView, gameId, timeLeft }) {
    const [explanation, setExplanation] = useState('');
    const explanationRef = useRef('');
    const autoSubmittedRef = useRef(false);

    const handleTextChange = (e) => {
        const val = e.target.value;
        setExplanation(val);
        explanationRef.current = val;
    };

    const performSubmit = useCallback(async (textToSubmit) => {
        if (autoSubmittedRef.current) return;
        autoSubmittedRef.current = true;

        const finalExplanation = textToSubmit.trim() ? textToSubmit.trim() : 'no submission';

        try {
            const playerId = localStorage.getItem('playerId');
            const nickname = localStorage.getItem('nickname');

            const response = await fetch(`/api/party/${gameId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerId: playerId,
                    explanation: finalExplanation,
                    nickname: nickname
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server returned status ${response.status}: ${errorText}`);
            }

            setCurrentView('votingpage');
        } catch (error) {
            console.error("Failed to submit explanation:", error);
        }
    }, [gameId, setCurrentView]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        await performSubmit(explanation);
    };

    useEffect(() => {
        if (timeLeft === 0 && !autoSubmittedRef.current) {
            performSubmit(explanationRef.current);
        }
    }, [timeLeft, performSubmit]);

    return (
        <div className={styles.gameplayContainer}>
            <div className={styles.artifactCard}>
                {imageUrl && (
                    <div className={styles.imageWrapper}>
                        <img src={imageUrl} alt={artifactName || 'Artifact'} className={styles.artifactImage} />
                    </div>
                )}
                {artifactName && <h3 className={styles.artifactTitle}>{artifactName}</h3>}
                {artifactUrl && (
                    <a href={artifactUrl} target="_blank" rel="noopener noreferrer" className={styles.artifactLink}>
                        View Full Artifact Reference ↗
                    </a>
                )}
            </div>

            <form onSubmit={handleSubmit} className={styles.submissionForm}>
                <div className={styles.textareaWrapper}>
                    <textarea
                        value={explanation}
                        maxLength={500}
                        onChange={handleTextChange}
                        placeholder="Provide your factual artifact description..."
                        rows={4}
                        className={styles.textarea}
                    />
                    <div className={styles.charCounter}>
                        {explanation.length}/500
                    </div>
                </div>
                <button type="submit" className={styles.submitButton}>
                    Submit Explanation
                </button>
            </form>
        </div>
    );
}

// Active gameplay view for Imposter
function ImposterGameplay({ imageUrl, gameId, setCurrentView, timeLeft }) {
    const [explanation, setExplanation] = useState('');
    const explanationRef = useRef('');
    const autoSubmittedRef = useRef(false);

    const handleTextChange = (e) => {
        const val = e.target.value;
        setExplanation(val);
        explanationRef.current = val;
    };

    const performSubmit = useCallback(async (textToSubmit) => {
        if (autoSubmittedRef.current) return;
        autoSubmittedRef.current = true;

        const finalExplanation = textToSubmit.trim() ? textToSubmit.trim() : 'no submission';

        try {
            const playerId = localStorage.getItem('playerId');
            const nickname = localStorage.getItem('nickname');

            const response = await fetch(`/api/party/${gameId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerId: playerId,
                    explanation: finalExplanation,
                    nickname: nickname
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server returned status ${response.status}: ${errorText}`);
            }

            setCurrentView('votingpage');
        } catch (error) {
            console.error("Failed to submit explanation:", error);
        }
    }, [gameId, setCurrentView]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        await performSubmit(explanation);
    };

    useEffect(() => {
        if (timeLeft === 0 && !autoSubmittedRef.current) {
            performSubmit(explanationRef.current);
        }
    }, [timeLeft, performSubmit]);

    return (
        <div className={styles.gameplayContainer}>
            <div className={styles.artifactCard}>
                {imageUrl && (
                    <div className={styles.imageWrapper}>
                        <img src={imageUrl} alt="Artifact" className={styles.artifactImage} />
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} className={styles.submissionForm}>
                <div className={styles.textareaWrapper}>
                    <textarea
                        value={explanation}
                        maxLength={500}
                        onChange={handleTextChange}
                        placeholder="Bluff your description to convince everyone you are the real Archeologist..."
                        rows={4}
                        className={styles.textarea}
                    />
                    <div className={styles.charCounter}>
                        {explanation.length}/500
                    </div>
                </div>
                <button type="submit" className={styles.submitButton}>
                    Submit Bluff
                </button>
            </form>
        </div>
    );
}

function GameScreenProper({ setCurrentView, gameId, isHost, players, myRole, setImage }) {

    const [timeLeft, setTimeLeft] = useState(null);
    const [started, setStarted] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(true);

    const [imageUrl, setImageUrl] = useState('');
    const [artifactName, setArtifactName] = useState('');
    const [artifactUrl, setArtifactUrl] = useState('');

    const channelRef = useRef(null);

    useEffect(() => {
        let isMounted = true;
        let retryTimeout = null;

        const fetchGameData = async () => {
            if (!gameId) return;

            try {
                const endpoint = myRole === 'archeologist'
                    ? `/api/party/${gameId}/details/archeologist`
                    : `/api/party/${gameId}/details`;

                const response = await fetch(endpoint);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Server returned status ${response.status}: ${errorText}`);
                }

                const data = await response.json();

                if (data && data.artifact_image_url) {
                    if (isMounted) {
                        setImageUrl(data.artifact_image_url || '');
                        setImage(data.artifact_image_url);
                        setArtifactName(data.artifact_title || '');
                        setArtifactUrl(data.artifact_url || '');
                        
                        if (data.countdown_minutes != null) {
                            setTimeLeft(data.countdown_minutes * 60);
                        }
                        setIsLoadingData(false);
                    }
                } else {
                    if (isMounted) {
                        retryTimeout = setTimeout(fetchGameData, 1000);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch game data on mount, retrying...", error);
                if (isMounted) {
                    retryTimeout = setTimeout(fetchGameData, 1000);
                }
            }
        };

        fetchGameData();

        const channel = supabase.channel(`party_game:${gameId}`);
        channelRef.current = channel;

        channel.on('broadcast', { event: 'game-initializing' }, (event) => {
            console.log('Game start signal received:', event);
            setStarted(true);
        });

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Successfully subscribed to party game channel');
            }
        });

        return () => {
            isMounted = false;
            if (retryTimeout) clearTimeout(retryTimeout);
            supabase.removeChannel(channel);
        };
    }, [gameId, myRole, setImage]);

    useEffect(() => {
        if (started && myRole === 'guesser') {
            setCurrentView('votingpage');
        }
    }, [started, myRole, setCurrentView]);

    useEffect(() => {
        if (!started) return;

        const timer = setInterval(() => {
            setTimeLeft((prevTime) => {
                if (prevTime === null) return null;
                if (prevTime <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prevTime - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [started]);

    const handleStart = async () => {
        if (isLoadingData) return;

        try {
            setStarted(true);

            if (channelRef.current) {
                await channelRef.current.send({
                    type: 'broadcast',
                    event: 'game-initializing',
                    payload: { message: 'Game is being started' }
                });
            }
        } catch (error) {
            console.error('Failed to start game:', error);
        }
    };

    const renderRoleLayout = () => {
        switch (myRole) {
            case 'archeologist':
                return <ArcheologistLayout players={players} />;
            case 'guesser':
                return <GuesserLayout players={players} />;
            case 'imposter':
                return <ImposterLayout players={players} />;
            default:
                return (
                    <div className={styles.statusBox}>
                        <span className={styles.spinner}></span>
                        <p>Assigning role...</p>
                    </div>
                );
        }
    };

    const renderGameplay = () => {
        switch (myRole) {
            case 'archeologist':
                return (
                    <ArcheologistGameplay 
                        imageUrl={imageUrl} 
                        artifactName={artifactName} 
                        artifactUrl={artifactUrl} 
                        gameId={gameId} 
                        setCurrentView={setCurrentView}
                        timeLeft={timeLeft}
                    />
                );
            case 'imposter':
                return (
                    <ImposterGameplay 
                        imageUrl={imageUrl}
                        gameId={gameId} 
                        setCurrentView={setCurrentView}
                        timeLeft={timeLeft}
                    />
                );
            default:
                return (
                    <div className={styles.statusBox}>
                        <span className={styles.spinner}></span>
                        <p>Redirecting to voting...</p>
                    </div>
                );
        }
    };

    const isLowTime = timeLeft !== null && timeLeft <= 15;

    return (
        <div className={styles.home}>
            {/* Countdown Banner */}
            <div className={`${styles.timerBanner} ${isLowTime ? styles.lowTime : ''}`}>
                <span className={styles.timerLabel}>Time Remaining</span>
                <span className={styles.timerValue}>{formatTime(timeLeft)}</span>
            </div>

            {started ? (
                <div className={styles.mainContent}>
                    {isLoadingData ? (
                        <div className={styles.statusBox}>
                            <span className={styles.spinner}></span>
                            <p>Loading artifact details...</p>
                        </div>
                    ) : (
                        renderGameplay()
                    )}
                </div>
            ) : (
                <div className={styles.briefingContainer}>
                    {renderRoleLayout()}

                    <div className={styles.actionCard}>
                        {isHost ? (
                            <button 
                                className={styles.startButton} 
                                onClick={handleStart} 
                                disabled={isLoadingData}
                            >
                                {isLoadingData ? 'PREPARING ARTIFACT...' : 'START ROUND'}
                            </button>
                        ) : (
                            <div className={styles.waitingState}>
                                <span className={styles.pulseDot}></span>
                                <p>Waiting for host to start the round...</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default GameScreenProper;