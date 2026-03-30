import styles from './Finishdisplay.module.css'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

import React, { useState } from 'react';
import loading from '../assets/loading.gif'
import x_icon from '../assets/x-mark.png'


countries.registerLocale(enLocale)

function Finishdisplay({status, onNewGame, artifact, gameId}) {


    const [showReport, setShowReport]             = useState(false);
    const [dateWrong, setDateWrong]               = useState(false);
    const [locationWrong, setLocationWrong]       = useState(false);
    const [description, setDescription]           = useState('');
    const [reportStatus, setReportStatus]         = useState(null); // 'sent' | 'error'

    const [isNewGame, setIsNewGame] = useState(false)

    const [modal, setModal] = useState(false);
    const [reportFields, setReportFields] = useState({ is_date_incorrect: false, is_location_incorrect: false, description: '' });

    const handleReport = async (e) => {
        e.preventDefault();
        if (!artifact?.objectId) return;
        setReportStatus('submitting');
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    objectId:             artifact.objectId,
                    is_date_incorrect:    reportFields.is_date_incorrect,
                    is_location_incorrect: reportFields.is_location_incorrect,
                    description:          reportFields.description || undefined,
                }),
            });
            setReportStatus(res.ok ? 'success' : 'error');
        } catch {
            setReportStatus('error');
        }
    };

    const handleCloseModal = () => {
        setModal(false);
        setReportStatus(null);
        setReportFields({ is_date_incorrect: false, is_location_incorrect: false, description: '' });
    };

    //location and date incorrect toggle state hooks
    const [locationIncorrect, setLocationIncorrect] = useState(false);
    const [dateIncorrect, setDateIncorrect] = useState(false);

    const handleNewGame = async () => {
        setIsNewGame(true)
        try {
            await onNewGame()
        } finally {
            setIsNewGame(false)
        }
    }

    const handleSubmitFlag = async (e) => {
        e.preventDefault();
        // Here you would typically send the flag data to your backend for processing
        const flagData = {
            objectId: gameId,
            is_location_incorrect: locationIncorrect,
            is_date_incorrect: dateIncorrect,
            description: e.target.description.value
        };
        console.log(flagData);

        try {
            await fetch(`${import.meta.env.VITE_API_URL}/api/report`, {
                method: 'POST',
                body: JSON.stringify(flagData)
            });
        } catch (error) {
            console.error('Error submitting flag:', error);
        }
        // Reset form and close modal after submission
        setLocationIncorrect(false);
        setDateIncorrect(false);
        e.target.reset();
        setModal(false);
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
                    {isNewGame ? <img src={loading} alt="Loading" className={styles.loadingIcon} /> : 'New Game 🕹️'}
                </button>
                <button className={styles.game_button} onClick={() => setModal(true)} disabled={!artifact?.objectId}>
                    Flag 🚩
                </button>
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
                <div className={styles.modal} onClick={handleCloseModal}>
                  <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                    <button className={styles.closeModal} onClick={handleCloseModal}>
                      <img className={styles.closeIcon} src={x_icon} alt="Close" />
                    </button>
                    <h2>Report Inaccuracy</h2>

                    {reportStatus === 'success' ? (
                      <p>Thanks — your report has been submitted.</p>
                    ) : (
                      <form className={styles.form} onSubmit={handleReport}>
                        <div className={styles.inputContainer}>
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
                        {reportStatus === 'error' && <p className={styles.errorText}>Something went wrong — please try again.</p>}
                        <button
                          type="submit"
                          className={styles.sendButton}
                          disabled={reportStatus === 'submitting' || (!reportFields.is_date_incorrect && !reportFields.is_location_incorrect && !reportFields.description)}
                        >
                          {reportStatus === 'submitting' ? 'Sending…' : 'Submit Report'}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}
        </>
    )
}

export default Finishdisplay
