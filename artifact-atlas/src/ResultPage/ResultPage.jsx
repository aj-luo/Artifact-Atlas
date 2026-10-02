import styles from './ResultPage.module.css';

function ResultPage({ isCorrect, isHost }) {

    const handleNewGame = async () => {
        //we want to call api to make a new game and get the gameId to set state
        
        //we want to redirect to GameScreenIntro

        //we want to send out to all the other players a broadcast to switch screens to GameScreenIntro
    }

    return (
        <div className={styles.container}>
            {isCorrect ? (
                <div className={`${styles.resultCard} ${styles.correct}`}>
                    <h2>Correct!</h2>
                    <p>The Archeologist was successfully identified!</p>
                    <p>Waiting on host to start new game</p>
                </div>
            ) : (
                <div className={`${styles.resultCard} ${styles.wrong}`}>
                    <h2>Wrong!</h2>
                    <p>The imposters won! The true archeologist was ...</p>
                    <p>Waiting on host to start new game</p>
                </div>
            )}

            {/* Display button only if player is the host */}
            {isHost && (
                <button 
                    className={styles.newGameButton} 
                    onClick={handleNewGame}
                >
                    Start New Game
                </button>
            )}
        </div>
    );
}

export default ResultPage;