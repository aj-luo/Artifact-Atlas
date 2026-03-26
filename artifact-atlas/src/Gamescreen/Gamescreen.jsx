import styles from './Gamescreen.module.css'
import React, { useState, useEffect, useRef } from 'react';
import Gameselectors from '../Gameselectors/Gameselectors.jsx'
import Finishdisplay  from '../Finishdisplay/Finishdisplay.jsx';


function Gamescreen() {

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
        setGameId(null);
        setImageUrl(null);
        setGuesses([]);
        setArtifact(null);
        setGameStatus("active");
        await handleStartGame();
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
                    {guesses.map((guess, i) => (
                        <li key={i}>
                            <div className={styles.guess}>
                                {guess.country} {guess.year} | {guess.distanceKm === 0 ? '✓' : `${guess.cardinal} ${guess.distanceKm} km`} | ⏰ {guess.yearHint}
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}

export default Gamescreen
