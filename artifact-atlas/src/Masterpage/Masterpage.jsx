import styles from './Masterpage.module.css';

function Masterpage({ setCurrentView }) {
  return (
    <div className={styles.home}>
      <p className={styles.tagline}>WELCOME TO ARTIFACT ATLAS! CHOOSE YOUR GAME MODE:</p>


      <div className={styles.cardContainer}>
  
        {/* FIRST CARD */}
        <div className={styles.modeCard}>
            <div className={styles.iconWrapper}>👤</div>
            <h2 className={styles.cardTitle}>SINGLEPLAYER</h2>
            <p className={styles.cardDescription}>
            Test your historical knowledge within 5 guesses. Analyze artifacts 
            from world-class collections, date objects, and identify their country of origin!
            </p>
            <div className={styles.cardDetails}>
            <p>⏱️ Time Trials</p>
            <p>🔍 Object Analysis</p>
            <p>📊 Personal Best</p>
            </div>
            <button onClick={() => setCurrentView('home')} className={styles.start_button}>
            PLAY SINGLEPLAYER
            </button>
        </div>

        {/* SECOND CARD */}
        <div className={styles.modeCard}>
            <div className={styles.iconWrapper}>👥</div>
            <h2 className={styles.cardTitle}>MULTIPLAYER</h2>
            <p className={styles.cardDescription}>
            Play with or against friends in real-time. Challenge each other with competitive mode or have some light hearted fun in party mode, the choice is yours!
            </p>
            <div className={styles.cardDetails}>
            <p>⏱️ Time Trials</p>
            <p>🔍 Object Analysis</p>
            <p>📊 Personal Best</p>
            </div>
            <button onClick={() => setCurrentView('multiplayer')} className={styles.start_button}>
            PLAY MULTIPLAYER
            </button>
        </div>

        </div>
    </div>
  );
}

export default Masterpage;