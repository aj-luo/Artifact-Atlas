import styles from './Instruction.module.css';
import youtube from '../assets/youtube_logo.png';
import link from '../assets/link.png'
import question from '../assets/question.png';
import lightbulb from '../assets/lightbulb.png';
import sadface from '../assets/sadface.png';
import timezone from '../assets/timezone.png';

function Instruction() {
    return (
        <div className= {styles.approot}>
            <div className={styles.block}>
                <div className={styles.container}>
                    <div className={styles.title}>
                        <h1>Instructions</h1>
                    </div>
                    <div className={styles.videoButton}><a href="https://www.youtube.com/watch?v=1A_unkC1Rxg" target="_blank"><button className={styles.Buttons}> <img src={youtube} width="40" height="30"></img> <h4>Tutorial</h4></button></a></div>
                    <div className={styles.content}>
                        <div className={styles.steps}>
                            <div className={styles.instruction_box}>
                                <p>Guess the country or origin and time period of an artifact!</p>
                                <img src={question} alt="Question" />
                            </div>
                            <div className={styles.instruction_box}>
                                <p>You must guess the country and the year within the time range that it was created!</p>
                                <img src={timezone} alt="Timezone" />
                            </div>
                            <div className={styles.instruction_box}>
                                <p>If your guess is incorrect, you will get a distance/year hint!</p>
                                <img src={lightbulb} alt="Lightbulb" />
                            </div>
                            <div className={styles.instruction_box}>
                                <p>If you dont get the answer after 5 guesses, you lose!</p>
                                <img src={sadface} alt="Sad Face" />
                            </div>
                            <div className={styles.instruction_box}>
                                <p>If you are still unsure on instructions, go to the link at the top!</p>
                                <img src={link} alt="Link" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Instruction;