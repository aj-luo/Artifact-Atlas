import styles from './GameScreenProper.module.css';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

// 3 different sublayouts (Lobby View)

function ArcheologistLayout({ players }) {
    return (
        <div className={styles.roleContainer}>
            <h2>YOU ARE THE ARCHEOLOGIST 📜</h2>
            <p>You will be given the artifact details AND the image.</p>
            {/* Artifact details + Image + Explanation form */}
        </div>
    );
}

function GuesserLayout({ players }) {
    return (
        <div className={styles.roleContainer}>
            <h2>YOU ARE THE GUESSER 🔍</h2>
            <p>Wait for submissions, then guess who the true Archeologist is.</p>
            {/* Voting/Guessing controls */}
        </div>
    );
}

function ImposterLayout({ players }) {
    return (
        <div className={styles.roleContainer}>
            <h2>YOU ARE THE IMPOSTER! SHHHHHHH....... 🎭</h2>
            <p>You will only be able to see the artifact image. Bluff your way through the explanation!</p>
            {/* Image + Explanation form */}
        </div>
    );
}

// 3 active gameplay views

function ArcheologistGameplay({ players, imageUrl, artifactName, artifactUrl }) {
    const [explanation, setExplanation] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        // TODO: Send explanation to server/broadcast to room
        console.log("Archeologist explanation submitted:", explanation);
    };

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
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder="Provide your factual artifact description..."
                    rows={4}
                />
                <button type="submit">Submit Explanation</button>
            </form>
        </div>
    );
}

function GuesserGameplay({ players, imageUrl }) {
    return (
        <div className={styles.gameplayContainer}>
            {imageUrl && (
                <img src={imageUrl} alt="Artifact" className={styles.artifactImage} />
            )}
            <p>Examine the artifact and wait for player submissions to find the true Archeologist!</p>
        </div>
    );
}

function ImposterGameplay({ players, imageUrl }) {
    const [explanation, setExplanation] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        // TODO: Send explanation to server/broadcast to room
        console.log("Imposter explanation submitted:", explanation);
    };

    return (
        <div className={styles.gameplayContainer}>
            {imageUrl && (
                <img src={imageUrl} alt="Artifact" className={styles.artifactImage} />
            )}

            <form onSubmit={handleSubmit} className={styles.submissionForm}>
                <textarea
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder="Bluff your description to convince everyone you are the real Archeologist..."
                    rows={4}
                />
                <button type="submit">Submit Bluff</button>
            </form>
        </div>
    );
}

function GameScreenProper({ setCurrentView, gameId, isHost, players, myRole }) {
    const channelRef = useRef(null);

    // Used to store the time state
    const [timeLeft, setTimeLeft] = useState(null);

    // Started tracker
    const [started, setStarted] = useState(false);

    // State for imageUrl
    const [imageUrl, setImageUrl] = useState('');

    // State for artifactname
    const [artifactName, setArtifactName] = useState('');

    // State for artifactUrl
    const [artifactUrl, setArtifactUrl] = useState('');

    // Fetch game data when component mounts or when gameId/myRole changes
    useEffect(() => {
        let isMounted = true;

        const fetchGameData = async () => {
            if (!gameId) return;

            try {
                // 1. Determine endpoint
                const endpoint = myRole === 'archeologist'
                    ? `/api/party/${gameId}/details/archeologist`
                    : `/api/party/${gameId}/details`;

                // 2. Fetch data
                const response = await fetch(endpoint);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Server returned status ${response.status}: ${errorText}`);
                }

                const data = await response.json();

                // 3. Update state with response properties
                if (isMounted) {
                    setImageUrl(data.artifact_image_url || '');
                    setArtifactName(data.artifact_title || '');
                    setArtifactUrl(data.artifact_url || '');
                    
                    // Convert countdown_minutes to seconds if provided, otherwise default to existing
                    if (data.countdown_minutes != null) {
                        setTimeLeft(data.countdown_minutes * 60);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch game data on mount:", error);
            }
        };

        fetchGameData();

        return () => {
            isMounted = false;
        };
    }, [gameId, myRole]);

    const handleStart = async () => {
        try {
            setStarted(true);

            // TODO: Broadcast start message to other players via channelRef / Supabase Realtime

            //REMEMBER TO BROADCAST TO OTHER PLAYERS TO ALSO START

            // Start timer
            const timer = setInterval(() => {
                setTimeLeft((prevTime) => {
                    if (prevTime <= 1) {
                        clearInterval(timer);
                        return 0;
                    }
                    return prevTime - 1;
                });
            }, 1000);

        } catch (error) {
            console.error('Failed to start', error);
        }
    };

    // Render helper function to select layout (Lobby)
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

    // Render active gameplay components with required data props
    const renderGameplay = () => {
        switch (myRole) {
            case 'archeologist':
                return (
                    <ArcheologistGameplay 
                        players={players} 
                        imageUrl={imageUrl} 
                        artifactName={artifactName} 
                        artifactUrl={artifactUrl} 
                    />
                );
            case 'guesser':
                return (
                    <GuesserGameplay 
                        players={players} 
                        imageUrl={imageUrl} 
                    />
                );
            case 'imposter':
                return (
                    <ImposterGameplay 
                        players={players} 
                        imageUrl={imageUrl} 
                    />
                );
            default:
                return <p>Loading role information...</p>;
        }
    };

    return (
        <div className={styles.home}>
            <div className={styles.timer}>
                Time Remaining: {timeLeft != null ? `${timeLeft}s` : 'Loading...'}
            </div>
            {started ? (
                /* Displayed after game starts */
                <div>
                    {renderGameplay()}
                </div>
            ) : (
                /* Displayed before game starts (Lobby view) */
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