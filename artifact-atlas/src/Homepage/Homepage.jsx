import styles from './Homepage.module.css';

function Homepage({ onStart }) {
    return (
        <div className={styles.home}>
            <p className={styles.tagline}>Identify ancient artefacts from around the world</p>
            <button className={styles.start_button} onClick={onStart}>
                Play
            </button>
        </div>
    );
}

export default Homepage;
