import styles from './GameScreenProper.module.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

// 3 different sublayouts (Lobby View)

function ArcheologistLayout({ players }) {
    return (
        <div className={styles.roleContainer}>
            <h2>YOU ARE THE ARCHEOLOGIST 📜</h2>
            <p>You will be given the artifact details AND the image.</p>
        </div>
    );
}

function GuesserLayout({ players }) {
    return (
        <div className={styles.roleContainer}>
            <h2>YOU ARE THE GUESSER 🔍</h2>
            <p>Wait for submissions, then guess who the true Archeologist is.</p>
        </div>
    );
}

function ImposterLayout({ players }) {
    return (
        <div className={styles.roleContainer}>
            <h2>YOU ARE THE IMPOSTER! SHHHHHHH....... 🎭</h2>
            <p>You will only be able to see the artifact image. Bluff your way through the explanation!</p>
        </div>
    );
}

// Active gameplay views for writers

function ArcheologistGameplay({ players, imageUrl, artifactName, artifactUrl, setCurrentView, gameId, timeLeft }) {
    const [explanation, setExplanation] = useState('');
    const explanationRef = useRef('');
    const autoSubmittedRef = useRef(false);

    // Keep explanationRef synced with state for timer closure access
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

            if (playerId) {
                console.log('Found playerId:', playerId);
            } else {
                console.log('No playerId found in localStorage');
            }

            const response = await fetch(`/api/party/${gameId}/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
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

            const data = await response.json();
            console.log("Submission successful:", data);

            setCurrentView('votingpage');
        } catch (error) {
            console.error("Failed to submit explanation:", error);
        }
    }, [gameId, setCurrentView]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        await performSubmit(explanation);
    };

    // Auto-submit when time reaches 0
    useEffect(() => {
        if (timeLeft === 0 && !autoSubmittedRef.current) {
            performSubmit(explanationRef.current);
        }
    }, [timeLeft, performSubmit]);

    return (
        <div className={styles.gameplayContainer}>
            {imageUrl && (
                <img src={imageUrl} alt={artifactName || 'Artifact'} className={styles.artifactImage} />
            )}
            {artifactName && <h3>{artifactName}</h3>}
            {artifactUrl && (
                <p>
                    <a href={artifactUrl} target="_blank" rel="noopener noreferrer">
                        View Full Artifact Reference
                    </a>
                </p>
            )}

            <form onSubmit={handleSubmit} className={styles.submissionForm}>
                <textarea
                    value={explanation}
                    maxLength={500}
                    onChange={handleTextChange}
                    placeholder="Provide your factual artifact description..."
                    rows={4}
                />
                <div className={styles.charCounter}>
                    {explanation.length}/500 characters
                </div>
                <button type="submit">Submit Explanation</button>
            </form>
        </div>
    );
}

function ImposterGameplay({ players, imageUrl, gameId, setCurrentView, timeLeft }) {
    const [explanation, setExplanation] = useState('');
    const explanationRef = useRef('');
    const autoSubmittedRef = useRef(false);

    // Keep explanationRef synced with state for timer closure access
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

            if (playerId) {
                console.log('Found playerId:', playerId);
            } else {
                console.log('No playerId found in localStorage');
            }

            const response = await fetch(`/api/party/${gameId}/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
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

            const data = await response.json();
            console.log("Submission successful:", data);

            setCurrentView('votingpage');
        } catch (error) {
            console.error("Failed to submit explanation:", error);
        }
    }, [gameId, setCurrentView]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        await performSubmit(explanation);
    };

    // Auto-submit when time reaches 0
    useEffect(() => {
        if (timeLeft === 0 && !autoSubmittedRef.current) {
            performSubmit(explanationRef.current);
        }
    }, [timeLeft, performSubmit]);

    return (
        <div className={styles.gameplayContainer}>
            {imageUrl && (
                <img src={imageUrl} alt="Artifact" className={styles.artifactImage} />
            )}

            <form onSubmit={handleSubmit} className={styles.submissionForm}>
                <textarea
                    value={explanation}
                    maxLength={500}
                    onChange={handleTextChange}
                    placeholder="Bluff your description to convince everyone you are the real Archeologist..."
                    rows={4}
                />
                <div className={styles.charCounter}>
                    {explanation.length}/500 characters
                </div>
                <button type="submit">Submit Bluff</button>
            </form>
        </div>
    );
}

function GameScreenProper({ setCurrentView, gameId, isHost, players, myRole, setImage }) {

    const [timeLeft, setTimeLeft] = useState(null);
    const [started, setStarted] = useState(false);

    const [imageUrl, setImageUrl] = useState('');
    const [artifactName, setArtifactName] = useState('');
    const [artifactUrl, setArtifactUrl] = useState('');

    const channelRef = useRef(null);

    useEffect(() => {
        let isMounted = true;

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

                if (isMounted) {
                    setImageUrl(data.artifact_image_url || '');
                    //this one is the set the global image state
                    setImage(data.artifact_image_url);
                    setArtifactName(data.artifact_title || '');
                    setArtifactUrl(data.artifact_url || '');
                    
                    if (data.countdown_minutes != null) {
                        setTimeLeft(data.countdown_minutes * 60);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch game data on mount:", error);
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
            supabase.removeChannel(channel);
        };
    }, [gameId, myRole]);

    // Redirect guesser immediately on game start
    useEffect(() => {
        if (started && myRole === 'guesser') {
            setCurrentView('votingpage');
        }
    }, [started, myRole, setCurrentView]);

    // Countdown Timer for writers
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
                return <p>Loading role information...</p>;
        }
    };

    const renderGameplay = () => {
        switch (myRole) {
            case 'archeologist':
                return (
                    <ArcheologistGameplay 
                        players={players} 
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
                        players={players} 
                        imageUrl={imageUrl}
                        gameId={gameId} 
                        setCurrentView={setCurrentView}
                        timeLeft={timeLeft}
                    />
                );
            default:
                return <p>Redirecting to voting...</p>;
        }
    };

    return (
        <div className={styles.home}>
            <div className={styles.timer}>
                Time Remaining: {timeLeft != null ? `${timeLeft}s` : 'Loading...'}
            </div>
            {started ? (
                <div>
                    {renderGameplay()}
                </div>
            ) : (
                <>
                    {renderRoleLayout()}

                    {isHost ? (
                        <button onClick={handleStart}>
                            Start
                        </button>
                    ) : (
                        <p>Waiting for host to start....</p>
                    )}
                </>
            )}
        </div>
    );
}

export default GameScreenProper;