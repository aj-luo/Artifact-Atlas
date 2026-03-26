import styles from './Gameselectors.module.css'
import HistorySlider from '../HistorySlider/HistorySlider.jsx'
import React, { useState } from 'react';
import ReactFlagsSelect from "react-flags-select";
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

countries.registerLocale(enLocale)

function Gameselectors({status, setGameStatus, gameId, setGuesses, setArtifact}) {

    const [selectedCountry, setSelectedCountry] = useState("");

    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);

    const [yearInput, setYearInput] = useState(String(currentYear));

    const handleYearInputChange = (e) => {
        setYearInput(e.target.value);
        const parsed = parseInt(e.target.value, 10);
        if (!isNaN(parsed) && parsed >= -3000 && parsed <= currentYear) {
            setSelectedYear(parsed);
        }
    };

    const handleSliderChange = (year) => {
        setSelectedYear(year);
        setYearInput(String(year));
    };

    //API call to submit a guess for evaluation (right/wrong)
    const handleSubmit = async () => {
        if (!gameId || !selectedCountry) return;

        // ReactFlagsSelect returns ISO alpha-2 (e.g. "CN"); backend expects alpha-3 (e.g. "CHN")
        const alpha3 = countries.alpha2ToAlpha3(selectedCountry);
        if (!alpha3) return;

        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/game/${gameId}/guess`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    country: alpha3,
                    year: selectedYear
                })
            })
            const data = await response.json()

            setGuesses(prev => [...prev, {
                country: selectedCountry,
                year: selectedYear,
                cardinal: data.geo?.cardinal ?? '',
                distanceKm: data.geo?.distanceKm ?? 0,
                yearHint: data.year?.hint ?? ''
            }])

            if (data.gameStatus === 'won' || data.gameStatus === 'lost') {
                if (data.artifact) setArtifact(data.artifact);
                setGameStatus(data.gameStatus);
            }
        }
        catch (error) {
            console.log(error)
        }
    }

    //API call to give up, this will display the answer and render the page to have a next button
    const handleForfeit = async () => {
        if (!gameId) return;
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/game/${gameId}/guess`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ forfeit: true })
            })
            const data = await response.json()
            if (data.artifact) setArtifact(data.artifact);
        }
        catch (error) {
            console.log(error)
        }
        setGameStatus("lost");
    }

    return (
            <div className={styles.selectors}>
                <div className={styles.countryselector}>
                    <ReactFlagsSelect
                    selected={selectedCountry}
                    onSelect={(code) => setSelectedCountry(code)}
                    selectButtonClassName={styles.flagSelectButton}
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
                    onYearChange={handleSliderChange}
                    className={styles.historySlider}>
                </HistorySlider>
                <input
                    type="number"
                    value={yearInput}
                    onChange={handleYearInputChange}
                    min="-3000"
                    max={currentYear}
                    placeholder="Enter year"
                    className={styles.yearInput}
                />
                <div className={styles.buttons}>
                    <button className={styles.game_button} onClick={handleSubmit}>
                        Submit
                    </button>
                    <button className={styles.game_button} onClick={handleForfeit}>
                        Forfeit
                    </button>
                </div>
            </div>
    )
}

export default Gameselectors
