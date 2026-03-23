import chinese_vase from '../assets/Chinese_vase.jpg'
import styles from './Gamescreen.module.css'
import HistorySlider from '../HistorySlider/HistorySlider.jsx'
import React, { useState, useMemo } from 'react';
import ReactFlagsSelect from "react-flags-select";
import Gameselectors from '../Gameselectors/Gameselectors.jsx'
import Finishdisplay  from '../Finishdisplay/Finishdisplay.jsx';


function Gamescreen() {

    //This is hook to set the current game status
    const [gameStatus, setGameStatus] = useState("active"); // possible values: "active", "won", "lost"

    //for direction hints
    const directions = {
        N: '⬆️',
        S: '⬇️',
        E: '➡️',
        W: '⬅️',
        NW: '↖️',
        SW: '↙️ ',
        NE: '↗️',
        SE: '↘️'
    }

    //This is the hook to set the country the user selects
    const [selectedCountry, setSelectedCountry] = useState("");

    //This is the state (year) value we pass to the child HistorySlider component as props
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);

    const user_guess = [selectedCountry, selectedYear]


    //API call to start a new game session, this will get the picture etc when page loads or next game selected
    const handleStartGame = async () => {
        // 1. First lets handle the API call
        try {
            const response = await fetch('https://localhost:8888/gameid', {
                method: 'GET'
            })
        }
        catch (error) {

        }
    }

    //API call to submit a guess for evaluation (right/wrong)
    const handleSubmit = async () => {
        // 1. First lets handle the API call
        try {
            const response = await fetch('https://localhost:8888/gameid/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    country: selectedCountry,
                    year: selectedYear
                })
            })
        }
        catch (error) {
            console.log(error)
        }

        // 2. Second lets handle the frontend UI portion 

    }

    //API call to give up, this will display the answer and render the page to have a next button
    const handleForfeit = async () => {
        //1. First lets handle the API call
        try {
            const response = await fetch('https://localhost:8888/gameid/forfeit', {
                method: 'POST'
            })
        }
        catch (error) {
            console.log(error)
        }

        //2. Then lets handle the frontend UI portion
    }

    //this flags an item if user thinks it is not valid
    const handleFlag = async () => {
        //1. First lets handle the API call
        try {
            const response = await fetch('https://localhost:8888/gameid/flag', {
                method: 'POST'
            })
        }
        catch (error) {
            console.log(error)
        }
    }

    return (
        <div className={styles.game_ui}>
            <img src={chinese_vase} className={styles.image}></img>
            {gameStatus === "active" && (<Gameselectors status={gameStatus} setGameStatus={setGameStatus}/>)}
            {(gameStatus === "won" || gameStatus === "lost") && (
                <Finishdisplay status={gameStatus} setGameStatus={setGameStatus}/>
            )}
            <div className={styles.guesses}>
                <ul className={styles.guess_list}>
                    <li><div className={styles.guess}>Canada 1870 | ⬅️ 8000 km/4970.97 mi | ⏰ Ahead</div></li>
                    <li><div className={styles.guess}>Canada 1870 | ⬆️ 8000 km/4970.97 mi | ⏰ Behind</div></li>
                    <li><div className={styles.guess}>Canada 1870 | ⬇️ 8000 km/4970.97 mi | ⏰ Ahead</div></li>
                    <li><div className={styles.guess}>Canada 1870 | ➡️ 8000 km/4970.97 mi | ⏰ Behind</div></li>
                    <li><div className={styles.guess}>Canada 1870 | ⬅️ 8000 km/4970.97 mi | ⏰ Ahead</div></li>
                </ul>
            </div>
        </div>
    )
}

export default Gamescreen