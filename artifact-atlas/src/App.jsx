import { useState } from 'react'
import Footer from './Footer/Footer.jsx'
import Gamescreen from './Gamescreen/Gamescreen.jsx'
import Homepage from './Homepage/Homepage.jsx'
import logo from './assets/AA_logo.png'
import hdlogo from './assets/half-dome-logo.png'
import { Routes, Route, useLocation } from "react-router-dom"
import Privacy from './Privacy/Privacy.jsx';
import TOS from './TOS/TOS.jsx'
import Asset from './Asset/Asset.jsx'
import Instruction from './Instructions/Instructions.jsx'

function App() {
  const [started, setStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = async () => {
    setIsLoading(true);
    setTimeout(() => {
      setStarted(true);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <Routes>
      {/* ROUTE 1: The Entire Game Page */}
      <Route path="/" element={
        <div className='page'>
          <div className='item1'>
            <div className='logo_wrapper'>
              <img src={logo} className='logo' alt="logo" />
            </div>
            <div style={{position: 'absolute', right: '20px', display: 'flex', alignItems: 'center', gap: '10px'}}>
               {/* ... Your SVG and Half Dome links ... */}
            </div>
          </div>
          
          <div className='item2'>
            {started 
              ? <Gamescreen /> 
              : <Homepage onStart={handleStart} isLoading={isLoading} />
            }
          </div>

          <div className='item3'>
            <Footer />
          </div>
        </div>
      } />

      {/* ROUTE 2: The Entire Privacy Page (No Header/Footer) */}
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/tos" element={<TOS />} />
      <Route path="/assets" element={<Asset />} />
      <Route path="/instructions" element={<Instruction />} />
      {/* ROUTE 3: Add more full-page routes here */}
      {/* <Route path="/tos" element={<TOS />} /> */}
    </Routes>
  );
}

export default App
