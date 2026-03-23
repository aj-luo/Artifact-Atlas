import styles from './Finishdisplay.module.css'

function Finishdisplay({status, setGameStatus}) {

    return (
        <div className={styles.content}>
            {status === "won" ? (
                <h1>Congratulations! You Won!</h1>
            ) : (
                <h1>Game Over</h1>
            )}
            <h2>Artifact Details: China, 1500s</h2>
            <div>
                <button className={styles.game_button} onClick={() => setGameStatus("active")}>
                    New Game
                </button>
                <button className={styles.game_button}>Flag</button>
            </div>
            
        </div>
    )
}

export default Finishdisplay