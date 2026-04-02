import styles from './Privacy.module.css';

function Privacy() {
    return (
        <div className= {styles.approot}>
            <div className={styles.block}>
                <div className={styles.container}>
                    <div className={styles.title}>
                        <h1>Privacy Policy</h1>
                    </div>
                    <div className={styles.content}>
                        <h1>At Half-Dome Studios, we respect your privacy. This policy outlines what data we collect and how we use it.</h1>
                        <h2>1. What Data We Collect</h2>
                        <p>We only collect anonymous, technical game data to improve the gameplay experience. This includes:</p>
                        <ul>
                            <li>Game progress (levels completed, missions finished).</li>
                            <li>In-game statistics (high scores, time played, items collected).</li>
                            <li>Performance metrics (crashes, framerate data).</li>
                        </ul>

                        <h2>2. What Data We DO NOT Collect</h2>
                        <p>We do not collect any personally identifiable information, such as:</p>
                        <ul>
                            <li>Your name, email address, or physical address.</li>
                            <li>IP addresses or location data.</li>
                            <li>Device identifiers (unless required strictly for saving progress locally).</li>
                        </ul>

                        <h2>3. How We Use Data</h2>
                        <p>The data collected is used solely to:</p>
                        <ul>
                            <li>improve the gameplay experience by analysing game balance and difficulty.</li>
                            <li>analyze game performance and identify issues/bugs.</li>
                            <li>detect and prevent cheating or abuse of the game system.</li>
                        </ul>

                        <h2>4. Data Sharing</h2>
                        <p>We do not sell, trade, or rent your data to third parties.</p>

                        <h2>5. Contact Us</h2>
                        <p>If you have any questions about this Privacy Policy, please contact us at halfdomegames@gmail.com</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Privacy;