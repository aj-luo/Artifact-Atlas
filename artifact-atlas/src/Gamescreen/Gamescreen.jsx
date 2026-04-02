import styles from './Gamescreen.module.css'
import React, { useState, useEffect, useRef } from 'react';
import Gameselectors from '../Gameselectors/Gameselectors.jsx'
import Finishdisplay  from '../Finishdisplay/Finishdisplay.jsx';
import Flag from 'react-world-flags';
import { motion } from 'framer-motion';


function Gamescreen() {

    const directions = {
        N: '⬆️',
        NE: '↗️',
        E: '➡️',
        SE: '↘️',
        S: '⬇️',
        SW: '↙️',
        W: '⬅️',
        NW: '↖️'
    }


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
            const response = await fetch('/api/game/new', {
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

    //when the page reloads, load the game state from localStorage
    useEffect(()=> {
        const savedGameStatus = window.localStorage.getItem('gameStatus');
        const savedGuesses = JSON.parse(window.localStorage.getItem('guesses'));
        const savedGameId = window.localStorage.getItem('gameId');
        const savedArtifact = JSON.parse(window.localStorage.getItem('artifact'));

        if (savedGameStatus) setGameStatus(savedGameStatus);
        if (savedGuesses) setGuesses(savedGuesses);
        if (savedGameId) setGameId(savedGameId);
        if (savedArtifact) setArtifact(savedArtifact);
    }, [])


    return (
        <div className={styles.game_ui}>
            {imageUrl && (
                <motion.img 
                    key={imageUrl}
                    src={imageUrl} 
                    className={styles.image} 
                    alt="Artifact"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                />
            )}
            {gameStatus === "active" && (
                <motion.div
                    key="gameselectors"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
                >
                    <Gameselectors
                        status={gameStatus}
                        setGameStatus={setGameStatus}
                        gameId={gameId}
                        setGuesses={setGuesses}
                        setArtifact={setArtifact}
                    />
                </motion.div>
            )}
            {(gameStatus === "won" || gameStatus === "lost") && (
                <motion.div
                    key="finishdisplay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
                >
                    <Finishdisplay status={gameStatus} onNewGame={handleNewGame} artifact={artifact} gameId={gameId}/>
                </motion.div>
            )}
            <motion.div 
                className={styles.guesses}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
            >
                <ul className={styles.guess_list}>
                    {Array.from({ length: MAX_GUESSES }).map((_, i) => {
                        const guess = guesses[i];
                        return (
                            <li key={i}>
                                {guess ? (
                                    <motion.div 
                                        className={styles.guess}
                                        key={`guess-${i}-${guess.country}-${guess.year}`}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.4, ease: "easeOut" }}
                                    >
                                        <Flag code={guess.country} style={{ width: 24, marginRight: 6, verticalAlign: 'middle' }} />
                                        {guess.year} | {guess.countryCorrect ? '✓' : `${directions[guess.cardinal]} ${guess.distanceKm} km`} | ⏰ {guess.yearHint}
                                    </motion.div>
                                ) : (
                                    <div className={styles.guess_placeholder}></div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </motion.div>
        </div>
    )
}

export default Gamescreen
