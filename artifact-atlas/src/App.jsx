import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import ReactFlagsSelect from "react-flags-select";
import vase from "./assets/Chinese_vase.jpg";

function App() {

  const [selected, setSelected] = useState("");
  const [year, setYear] = useState(2026);

  const marks = {
    0: '0 AD',
    500: '500',
    1000: '1000',
    1500: '1500',
    2026: {
      style: { color: 'red', fontWeight: 'bold' },
      label: 'Present',
    },
  };


  return (
    <>
      <div className="game-container">
        <h1 className="title">Artifact Atlas</h1>
        <img className="image" src={vase} alt="Chinese Vase" />
      <div className='input_section'>
          <ReactFlagsSelect
            selected={selected}
            onSelect={(code) => setSelected(code)}
            searchable
            placeholder="Select a country"
          />
          <h3>Selected Year: {year}</h3>
          <Slider 
              min={0} 
              max={2026} 
              defaultValue={2026} 
              marks={marks} 
              step={1} // Move year by year
              onChange={(val) => setYear(val)}
              trackStyle={{ backgroundColor: '#646cff' }}
              handleStyle={{ borderColor: '#646cff', opacity: 1 }}
            />
            <button className="game-button">Submit Guess</button>
            <button className="game-button">Forfeit</button>
      </div>
        <div className="guess_list">
          <h2>Guesses</h2>
          <ul>
            <li>No guesses yet</li>
          </ul>
        </div>
      </div>
    </>
  )
}

export default App
