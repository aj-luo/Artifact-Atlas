import styles from './Finishdisplay.module.css'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import { useState } from 'react'

countries.registerLocale(enLocale)

function Finishdisplay({status, onNewGame, artifact}) {

    const [showReport, setShowReport]             = useState(false);
    const [dateWrong, setDateWrong]               = useState(false);
    const [locationWrong, setLocationWrong]       = useState(false);
    const [description, setDescription]           = useState('');
    const [reportStatus, setReportStatus]         = useState(null); // 'sent' | 'error'

    const yearRange = artifact
        ? (artifact.beginYear === artifact.endYear
            ? `${artifact.beginYear}`
            : `${artifact.beginYear}–${artifact.endYear}`)
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
                <a href={artifact.linkResource} target="_blank" rel="noreferrer">
                    View on The Met
                </a>
            )}
            <div>
                <button className={styles.game_button} onClick={onNewGame}>
                    New Game
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
    )
}

export default Finishdisplay
