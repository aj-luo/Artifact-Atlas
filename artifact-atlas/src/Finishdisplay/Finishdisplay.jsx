import styles from './Finishdisplay.module.css'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

import React, { useState } from 'react';
import loading from '../assets/loading.gif'
import x_icon from '../assets/x-mark.png'


countries.registerLocale(enLocale)

function Finishdisplay({status, onNewGame, artifact}) {


    const [showReport, setShowReport]             = useState(false);
    const [dateWrong, setDateWrong]               = useState(false);
    const [locationWrong, setLocationWrong]       = useState(false);
    const [description, setDescription]           = useState('');
    const [reportStatus, setReportStatus]         = useState(null); // 'sent' | 'error'

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

    const handleReport = async () => {
        if (!artifact?.objectId) return;
        if (!dateWrong && !locationWrong && !description.trim()) return;
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    objectId:             artifact.objectId,
                    is_date_incorrect:    dateWrong,
                    is_location_incorrect: locationWrong,
                    description:          description.trim() || null,
                }),
            });
            setReportStatus(res.ok ? 'sent' : 'error');
        } catch {
            setReportStatus('error');
        }
    };

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
                {artifact && (
                    <button
                        className={styles.game_button}
                        onClick={() => { setShowReport(v => !v); setReportStatus(null); }}
                    >
                        Flag
                    </button>
                )}
            </div>

            {showReport && (
                <div className={styles.report_form}>
                    {reportStatus === 'sent' ? (
                        <p>Report submitted. Thank you!</p>
                    ) : (
                        <>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={dateWrong}
                                    onChange={e => setDateWrong(e.target.checked)}
                                />
                                {' '}Date is incorrect
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={locationWrong}
                                    onChange={e => setLocationWrong(e.target.checked)}
                                />
                                {' '}Location is incorrect
                            </label>
                            <textarea
                                className={styles.report_textarea}
                                placeholder="Additional details (optional)"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={3}
                            />
                            {reportStatus === 'error' && (
                                <p className={styles.report_error}>Failed to submit. Try again.</p>
                            )}
                            <button
                                className={styles.game_button}
                                onClick={handleReport}
                                disabled={!dateWrong && !locationWrong && !description.trim()}
                            >
                                Submit Report
                            </button>
                        </>
                    )}
                </div>
            )}
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
