import Link from 'next/link';
import styles from './Multiplayer.module.css';
import archelogists from '../assets/archeologists.png';

function Multiplayer({ setCurrentView }) {
    return (
    <div className={styles.home}>
        
            <p className={styles.tagline}>MULTIPLAYER</p>

            <img src={archelogists.src} alt="Archeologists" className={styles.archelogistsImage} />
    
            <p className={styles.tagline}>CHOOSE YOUR GAME MODE!</p>
    
            <div className={styles.button_container}>
                <Link href="/battle-royale" className={styles.start_button}>
                    COMPETITIVE
                </Link>
                <button  onClick={() => setCurrentView('party')} className={styles.start_button}>
                    PARTY
                </button>
            </div>
        </div>
    )
}

export default Multiplayer;
