import styles from './Asset.module.css';
import download from '../assets/download.png';
import logo from '../assets/AA_logo.png'


function Asset() {
    return (
        <div className= {styles.approot}>
            <div className={styles.block}>
                <div className={styles.container}>
                    <div className={styles.title}>
                        <h1>Assets</h1>
                    </div>
                    <div className={styles.asset2}>
                        <h2>Asset 2: Artifact Atlas logo (.png file)</h2>
                        <img className={styles.logo} src={logo.src} alt="logo" />
                        <a href={logo.src} download><button className={styles.downloadButton}><img src={download.src} width="30" height="30"></img></button></a>
                    </div>
                </div>
            </div>
        </div>
    );
};


export default Asset;