import chinese_vase from '../assets/Chinese_vase.jpg'
import styles from './Gamescreen.module.css'
import HistorySlider from '../HistorySlider/HistorySlider.jsx'
import React, { useState, useMemo } from 'react';
import Select from 'react-select';
import countryList from 'react-select-country-list';
import ReactFlagsSelect from "react-flags-select";


function Gamescreen() {
    //for direction hints
    const directions = []

    //This is the hook to set the country the user selects
    const [selectedCountry, setSelectedCountry] = useState("");

    //This is the state (year) value we pass to the child HistorySlider component as props
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);

    const user_guess = [selectedCountry, selectedYear]

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

    return (
        <div className={styles.game_ui}>
            <img src={chinese_vase} className={styles.image}>
            </img>
            <div className={styles.selectors}>
                <div className={styles.countryselector}>
                    <ReactFlagsSelect
                    selected={selectedCountry}
                    onSelect={(code) => setSelectedCountry(code)}
                    customLabels={{
                        BN: "Brunei",
                        TL: "East Timor",
                        SZ: "Eswatini",
                        GY: "Guyana",
                        MK: "North Macedonia",
                        VC: "Saint Vincent and the Grenadines",
                        VA: "Vatican City",
                        BO: "Bolivia",
                        VN: "Vietnam",
                        IR: "Iran",
                        CZ: "Czech Republic",
                        CD: "Congo (Democratic Republic)",
                        CG: "Congo (Republic)",
                        CV: "Cabo Verde",
                        LA: "Laos",
                        FM: "Micronesia",
                        MD: "Moldova",
                        PS: "Palestine",
                        ST: "São Tomé and Príncipe",
                        VE: "Venezuela"
                    }}
                    placeholder="Select Country"
                    searchable />
                </div>
                <HistorySlider
                    value={selectedYear}
                    onYearChange={setSelectedYear}></HistorySlider>
                <div className={styles.buttons}>
                    <button className={styles.game_button}>
                        Submit
                    </button>
                    <button className={styles.game_button}>
                        Forfeit
                    </button>
                    <button className={styles.game_button}>
                        Flag
                    </button>
                </div>
            </div>
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