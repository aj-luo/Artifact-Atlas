import styles from './Footer.module.css';
import xIcon from '../assets/x_logo.png'
import discordIcon from '../assets/discord_logo.png'
import youtubeIcon from '../assets/youtube_logo.png'
import instagramIcon from '../assets/instagram_logo.png'
import List from '../List/List.jsx'

function Footer() {
    return(
        <footer className={styles.footer_root}>
            <div className={styles.footer_container}>
                <div className={styles.footer_left}>
                    <List />
                    <span className={styles.social_media_icons}>
                        <a href="https://x.com/halfdomestudios" target="_blank" rel="noreferrer"><img className={styles.company_logos} src={xIcon.src} alt="x_logo" /></a>
                        <a href="https://discord.gg/q9Bjkv4gm2" target="_blank" rel="noreferrer"><img className={styles.company_logos} src={discordIcon.src} alt="discord_logo" /></a>
                        <a href="https://youtube.com/@halfdomegames?si=nOaNDF23uz7cnsP5" target="_blank" rel="noreferrer"><img className={styles.company_logos} src={youtubeIcon.src} alt="youtube_logo" /></a>
                        <a href="https://www.instagram.com/halfdomestudios/" target="_blank" rel="noreferrer"><img className={styles.company_logos} src={instagramIcon.src} alt="instagram_logo" /></a>
                    </span>
                    
                    <p className={styles.copyright}>&copy; {new Date().getFullYear()} Half-Dome Studios. All rights reserved.</p>
                </div>
            </div>
        </footer> 
    );
}

export default Footer