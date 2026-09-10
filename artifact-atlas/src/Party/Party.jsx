import styles from './Party.module.css';
import partiers from '../assets/party_archeologists.png';

function Party({ setCurrentView }) {
    return (
        <div className={styles.home}>
            <p className={styles.tagline}>WELCOME TO PARTY MODE!</p>

            <img src={partiers.src} alt="Archeologists" className={styles.archelogistsImage} />
    
            {/* Main actions container */}
            <div className={styles.actionContainer}>
                <button className={styles.start_button} onClick={() => setCurrentView('multiplayer')}>
                    BACK
                </button>
                <button className={styles.start_button} onClick={() => setCurrentView('partylobby')}>
                    CREATE LOBBY
                </button>
                
                {/* Join group holding the Join button and input */}
                <div className={styles.joinGroup}>
                    <button className={styles.start_button}>
                        JOIN LOBBY
                    </button>
                    <input type="text" placeholder="Enter Lobby Code" className={styles.lobbyInput} />
                </div>
            </div>
        </div>
    );
}

export default Party;