import styles from './Homepage.module.css';
import loading from '../assets/loading.gif';

function Homepage({ onStart, isLoading }) {
    return (
        <div className={styles.home}>
            <p className={styles.tagline}>IDENTITY ARTIFACTS FROM AROUND THE WORLD!</p>

            <button className={styles.start_button} onClick={onStart} disabled={isLoading}>
                {isLoading ? <img src={loading.src} alt="Loading..." className={styles.loadingIcon} /> : 'Play'}
            </button>
            
            <div className={styles.videoContainer}>
                <iframe 
                    width="560" 
                    height="400" 
                    src="https://www.youtube.com/embed/1A_unkC1Rxg" 
                    title="YouTube video player" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                    allowFullScreen
                    className={styles.video}
                ></iframe>
            </div>
        </div>
    );
}

export default Homepage;
