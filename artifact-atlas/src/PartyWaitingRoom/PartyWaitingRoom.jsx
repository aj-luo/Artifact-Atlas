import styles from './PartyWaitingRoom.module.css';
import { useState } from 'react';

function PartyWaitingRoom({ setCurrentView, gameId }) {
    //These are the default values for time limit and player count. They can be changed by the user using the toggles below. hooks can be used to store the values and update them when the user changes them. The values can then be passed to the backend when creating the lobby.
    const [lobbyFull, setLobbyFull] = useState(false); // Track if the lobby is full

    return (
        <div className={styles.home}>
            {/* This is used to show the lobby status, whether we are waiting for players or lobby is full*/}
            <p className={styles.tagline}>
                YOU ARE THE HOST OF THE LOBBY
            </p>
            <p className={styles.tagline}>
                {lobbyFull ? 'LOBBY IS FULL' : 'WAITING FOR OTHER PLAYERS'}
            </p>

            <p className={styles.tagline}>SHARE LOBBY ID: {gameId}</p>

            <p className={styles.tagline}>PLAYERS JOINED:</p>

            {/* Main actions container */}
            <div className={styles.actionContainer}>
                <button className={styles.start_button} onClick={() => setCurrentView('party')}>
                    BACK
                </button>
                <button className={styles.start_button}>
                    START GAME
                </button>
            </div>
        </div>
    );
}

export default PartyWaitingRoom;