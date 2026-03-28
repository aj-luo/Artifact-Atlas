import styles from './Finishdisplay.module.css'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import React, { useState } from 'react';
import loading from '../assets/loading.gif'
import x_icon from '../assets/x-mark.png'

countries.registerLocale(enLocale)

function Finishdisplay({status, onNewGame, artifact}) {

    const [isNewGame, setIsNewGame] = useState(false)

    const [modal, setModal] = useState(false);

    const handleNewGame = async () => {
        setIsNewGame(true)
        try {
            await onNewGame()
        } finally {
            setIsNewGame(false)
        }
    }

    const yearRange = artifact
        ? (artifact.beginYear === artifact.endYear
            ? `${artifact.beginYear}`
            : `${artifact.beginYear}  to  ${artifact.endYear}`)
        : null;

    const countryName = artifact
        ? (countries.getName(artifact.country, 'en') ?? artifact.country)
        : null;

    return (
        <>
        <div className={styles.content}>
            {status === "won" ? (
                <h1>You Won!</h1>
            ) : (
                <h1>Game Over</h1>
            )}
            {artifact && (
                <h2>Artifact Details: {countryName}, {yearRange}</h2>
            )}
            {artifact?.linkResource && (
                <a href={artifact.linkResource} target="_blank" rel="noreferrer" className={styles.resourcelink}>
                    View on The Met
                </a>
            )}
            <div>
                <button className={styles.game_button} onClick={handleNewGame} disabled={isNewGame}>
                    {isNewGame ? <img src={loading} alt="Loading" className={styles.loadingIcon} /> : 'New Game 🕹️'}
                </button>
                <button className={styles.game_button} onClick={() => setModal(true)}>
                    Flag 🚩
                </button>
            </div>
        </div>
        {modal && (
                // 3. Changed class names to use the 'styles' object
                <div className={styles.modal} onClick={() => setModal(false)}>
                  <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                    <h2>Contact Us</h2>
                    <form className={styles.form} action="https://formspree.io/f/xaqdyelz" method="POST">
                    <div className={styles.inputContainer}>
                      <input type="text" placeholder="Name" name="name" className={styles.inputField} required/>
                      <input type="email" placeholder="Email" name="email" className={styles.inputField} required/>
                      <textarea className={`${styles.inputField} ${styles.messageField}`} placeholder="Message" name="message" required></textarea>
                      </div>
                      <button className={styles.closeModal} onClick={() => setModal(false)}>
                        <img className={styles.closeIcon}  src={x_icon} alt="Close" />
                      </button>
                      <button type="submit" className={styles.sendButton}>SEND</button>
                    </form>
                  </div>
                </div>
              )}
        </>
    )
}

export default Finishdisplay
