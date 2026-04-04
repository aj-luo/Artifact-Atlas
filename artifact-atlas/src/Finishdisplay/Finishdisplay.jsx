import styles from './Finishdisplay.module.css'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import React, { useState } from 'react';
import loading from '../assets/loading.gif'
import x_icon from '../assets/x-mark.png'

countries.registerLocale(enLocale)

function Finishdisplay({status, onNewGame, artifact, gameId}) {

    const [isNewGame, setIsNewGame] = useState(false)
    const [modal, setModal] = useState(false);
    const [reportFields, setReportFields] = useState({ name: '', email: '', is_date_incorrect: false, is_location_incorrect: false, description: '' });
    const [reportStatus, setReportStatus] = useState(null); // 'submitting' | 'success' | 'error'

    const handleNewGame = async () => {
        setIsNewGame(true);
        try {
            await onNewGame();
        } finally {
            setIsNewGame(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setReportStatus('submitting');
        try {
            await fetch('/api/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    objectId:              artifact.objectId,
                    is_date_incorrect:     reportFields.is_date_incorrect,
                    is_location_incorrect: reportFields.is_location_incorrect,
                    description:           reportFields.description || undefined,
                }),
            });
            await fetch('https://formspree.io/f/xaqdyelz', {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name:                  reportFields.name,
                    email:                 reportFields.email,
                    message:               reportFields.description,
                    is_date_incorrect:     reportFields.is_date_incorrect,
                    is_location_incorrect: reportFields.is_location_incorrect,
                }),
            });
            setReportStatus('success');
        } catch {
            setReportStatus('error');
        }
    };

    const handleCloseModal = () => {
        setModal(false);
        setReportStatus(null);
        setReportFields({ name: '', email: '', is_date_incorrect: false, is_location_incorrect: false, description: '' });
    };

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
                    {isNewGame ? <img src={loading.src} alt="Loading" className={styles.loadingIcon} /> : 'New Game 🕹️'}
                </button>
                <button className={styles.game_button} onClick={() => setModal(true)} disabled={!artifact?.objectId}>
                    Flag 🚩
                </button>
            </div>
        </div>

        {modal && (
            <div className={styles.modal} onClick={handleCloseModal}>
                <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                    <button className={styles.closeModal} onClick={handleCloseModal}>
                        <img className={styles.closeIcon} src={x_icon.src} alt="Close" />
                    </button>
                    <h2>Report Inaccuracy</h2>

                    {reportStatus === 'success' ? (
                        <p>Thanks — your report has been submitted.</p>
                    ) : (
                        <form className={styles.form} onSubmit={handleSubmit}>
                            <div className={styles.inputContainer}>
                                <input
                                    type="text"
                                    placeholder="Name"
                                    className={styles.inputField}
                                    value={reportFields.name}
                                    onChange={e => setReportFields(f => ({ ...f, name: e.target.value }))}
                                    required
                                />
                                <input
                                    type="email"
                                    placeholder="Email"
                                    className={styles.inputField}
                                    value={reportFields.email}
                                    onChange={e => setReportFields(f => ({ ...f, email: e.target.value }))}
                                    required
                                />
                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={reportFields.is_date_incorrect}
                                        onChange={e => setReportFields(f => ({ ...f, is_date_incorrect: e.target.checked }))}
                                    />
                                    &nbsp;Date is incorrect
                                </label>
                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={reportFields.is_location_incorrect}
                                        onChange={e => setReportFields(f => ({ ...f, is_location_incorrect: e.target.checked }))}
                                    />
                                    &nbsp;Location is incorrect
                                </label>
                                <textarea
                                    className={`${styles.inputField} ${styles.messageField}`}
                                    placeholder="Additional details (optional)"
                                    value={reportFields.description}
                                    onChange={e => setReportFields(f => ({ ...f, description: e.target.value }))}
                                />
                            </div>
                            {reportStatus === 'error' && (
                                <p className={styles.errorText}>Something went wrong — please try again.</p>
                            )}
                            <button
                                type="submit"
                                className={styles.sendButton}
                                disabled={reportStatus === 'submitting'}
                            >
                                {reportStatus === 'submitting' ? 'Sending…' : 'Submit'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        )}
        </>
    );
}

export default Finishdisplay
