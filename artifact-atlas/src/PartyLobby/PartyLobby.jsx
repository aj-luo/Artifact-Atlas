import TimeToggle from '../TimeToggle/TimeToggle';
import RangeToggle from '../RangeToggle/RangeToggle';
import styles from './PartyLobby.module.css';
import { useState } from 'react';

function PartyLobby({ setCurrentView }) {
    //These are the default values for time limit and player count. They can be changed by the user using the toggles below. hooks can be used to store the values and update them when the user changes them. The values can then be passed to the backend when creating the lobby.
    const [playerCount, setPlayerCount] = useState(4);
    const [timeLimit, setTimeLimit] = useState(5);

    return (
        <div className={styles.home}>
            <p className={styles.tagline}>CREATE A LOBBY</p>

            {/*These are the toggles for player count and time limit */}    
            <RangeToggle value={playerCount} onChange={setPlayerCount} />
            <TimeToggle value={timeLimit} onChange={setTimeLimit} />
    
            {/* Main actions container */}
            <div className={styles.actionContainer}>
                <button className={styles.start_button} onClick={() => setCurrentView('party')}>
                    BACK
                </button>
                <button className={styles.start_button}>
                    CREATE
                </button>
            </div>
        </div>
    );
}

export default PartyLobby;