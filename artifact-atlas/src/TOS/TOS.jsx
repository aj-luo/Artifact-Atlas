import styles from './TOS.module.css';
import { Link } from "react-router-dom";

function TOS() {
    return (
        <div className= {styles.approot}>
            <div className={styles.block}>
                <div className={styles.container}>
                    <div className={styles.title}>
                        <h1>Terms of Service</h1>
                    </div>
                    <div className={styles.content}>
                        <h2>1. Acceptance of Terms</h2>
                        <p>By accessing or using our game, you agree to comply with and be bound by the following Terms of Service. If you do not agree to these terms, please do not use this Game.</p>

                        <h2>2. Intellectual Property Rights</h2>
                        <p>All content within the Game, including but not limited to code, graphics, music, text, and logos, is the property of Half-Dome Studios and is protected by copyright laws. You may not reproduce, distribute, or create derivative works from this content without express written permission.</p>

                        <h2>3. User Conduct</h2>
                        <p>By playing this game, you agree not to</p>
                        <ol>
                            <li>use cheats, hacks, or automation software to modify the game experience.</li>
                            <li>attempt to disrupt or overload the game servers.</li>
                            <li>use the game for any illegal purpose.</li>
                            <li>We reserve the right to ban any user who violates these rules.</li>
                        </ol>

                        <h2>4. "As Is" Disclaimer</h2>
                        <p>This Game is provided "as is" without any warranties of any kind, either express or implied. We do not guarantee that the Game will be error-free, uninterrupted, or secure.</p>

                        <h2>5. Limitation of Liability</h2>
                        <p>Half-Dome Studios shall not be liable for any damages resulting from your use of, or inability to use, this Game. This includes, but is not limited to, damages for loss of data, loss of profits, or computer failure.</p>
                        
                        <h2>6. Changes to Terms of Service</h2>
                        <p>We reserve the right to modify these terms at any time. Continued use of the Game constitutes acceptance of any updated terms.</p>

                        <h2>7. Governing Law</h2>
                        <p>These terms are governed by the laws of Canada.</p>

                        <h2>8. Contact Us</h2>
                        <p>If you have any questions about this Terms of Service, please contact us at halfdomegames@gmail.com</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TOS;