import styles from './Gamescreen.module.css'
import React, { useState, useEffect, useRef } from 'react';
import Gameselectors from '../Gameselectors/Gameselectors.jsx'
import Finishdisplay  from '../Finishdisplay/Finishdisplay.jsx';
import Flag from 'react-world-flags';


function Gamescreen() {

    const MAX_GUESSES = 5;

    const [gameStatus, setGameStatus] = useState("active"); // possible values: "active", "won", "lost"
    const [gameId, setGameId] = useState(null);
    const [imageUrl, setImageUrl] = useState(null);
    const [guesses, setGuesses] = useState([]);
    const [artifact, setArtifact] = useState(null);

    // Prevents React StrictMode double-invocation from creating two games
    const gameStarted = useRef(false);

    const handleStartGame = async () => {
        if (gameStarted.current) return;
        gameStarted.current = true;
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/game/new`, {
                method: 'POST'
            })
            const data = await response.json()
            setGameId(data.gameId)
            setImageUrl(data.imageUrl)
        }
        catch (error) {
            console.log(error)
        }
    }

    const handleNewGame = async () => {
        gameStarted.current = false;
        // keep current screen visible while loading new game
        try {
            await handleStartGame();
            setGuesses([]);
            setArtifact(null);
            setGameStatus("active");
        } catch (error) {
            console.log(error);
            // keep old state if new game fails
        }
    }

    useEffect(() => {
        handleStartGame();
    }, [])


    return (
        <div className={styles.game_ui}>
            {imageUrl && <img src={imageUrl} className={styles.image} alt="Artifact" />}
            {gameStatus === "active" && (
                <Gameselectors
                    status={gameStatus}
                    setGameStatus={setGameStatus}
                    gameId={gameId}
                    setGuesses={setGuesses}
                    setArtifact={setArtifact}
                />
            )}
            {(gameStatus === "won" || gameStatus === "lost") && (
                <Finishdisplay status={gameStatus} onNewGame={handleNewGame} artifact={artifact}/>
            )}
            <div className={styles.guesses}>
                <ul className={styles.guess_list}>
                    {Array.from({ length: MAX_GUESSES }).map((_, i) => {
                        const guess = guesses[i];
                        return (
                            <li key={i}>
                                {guess ? (
                                    <div className={styles.guess}>
                                        <Flag code={guess.country} style={{ width: 24, marginRight: 6, verticalAlign: 'middle' }} />
                                        {guess.year} | {guess.countryCorrect ? '✓' : `${guess.cardinal} ${guess.distanceKm} km`} | ⏰ {guess.yearHint}
                                    </div>
                                ) : (
                                    <div className={styles.guess_placeholder}></div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    )
}

export default Gamescreen
