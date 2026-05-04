'use client'

import { useState } from 'react'
import Footer from '../Footer/Footer.jsx'
import Gamescreen from '../Gamescreen/Gamescreen.jsx'
import Homepage from '../Homepage/Homepage.jsx'
import logo from '../assets/AA_logo.png'
import halfdome from '../assets/half-dome-logo.png'
import AdBanner from '../Adsense/AdBanner.jsx'

export default function Home() {
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
    <div className='page'>
      <div className='item1'>
        <div className='logo_wrapper'>
          <img src={logo.src} className='logo' alt="logo" />
        </div>
        <div className='partner_logos'>
          <a href='https://www.metmuseum.org/' target='_blank' rel='noreferrer'>
            <svg className='metsvg' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path fill="currentColor" d="M39.74 27.009a11.6 11.6 0 0 0-.88-1.861 10 10 0 0 0-1.33-1.824 7.6 7.6 0 0 0-1.72-1.387 4 4 0 0 0-2.04-.55v15.4A3 3 0 0 0 34 38a2.65 2.65 0 0 0 .64.883 2.8 2.8 0 0 0 .95.55 3.5 3.5 0 0 0 1.17.19V40h-6.13V21.577a4.9 4.9 0 0 0-2.08.4 4.2 4.2 0 0 0-1.47 1.111 5.3 5.3 0 0 0-.94 1.709 11.5 11.5 0 0 0-.54 2.213h-.26a11.5 11.5 0 0 0-.54-2.194 5.5 5.5 0 0 0-.97-1.718 4.3 4.3 0 0 0-1.54-1.121 5.6 5.6 0 0 0-2.21-.4h-1.36V30h1.24a4 4 0 0 0 .57-.133 2.83 2.83 0 0 0 1.22-.788 3.2 3.2 0 0 0 .68-1.339 7.6 7.6 0 0 0 .21-1.909h.29L24 34.947h-.29a5.83 5.83 0 0 0-1.62-3.228A3.8 3.8 0 0 0 20.84 31h-2.12v8.43h2.19a5.15 5.15 0 0 0 2.17-.456 6.5 6.5 0 0 0 1.79-1.216 8 8 0 0 0 1.39-1.737 10.2 10.2 0 0 0 .96-2.023h.26l-.77 6H12.57v-.38a3.5 3.5 0 0 0 1.17-.19 2.8 2.8 0 0 0 .95-.55 2.5 2.5 0 0 0 .63-.893 2.1 2.1 0 0 0 .18-.987V24.5L10 38h-.5L4 25.593V36.5a4.7 4.7 0 0 0 .37 1.487 2.6 2.6 0 0 0 .64.893 2.7 2.7 0 0 0 .95.55 3.5 3.5 0 0 0 1.16.19V40H0v-.38a3.6 3.6 0 0 0 1.17-.19 2.7 2.7 0 0 0 .94-.55 2.5 2.5 0 0 0 .64-.893 3.05 3.05 0 0 0 .23-1.2V23.362A3.1 3.1 0 0 0 0 21.387v-.379h3.07a4.6 4.6 0 0 1 1.94.37 2.69 2.69 0 0 1 1.28 1.472L11 33.5l4.5-11a2.05 2.05 0 0 1 1.17-1.113 4 4 0 0 1 1.7-.379h20.94l.69 6h-.26Zm-15.93-8.017v-.38a2.17 2.17 0 0 0 2.49-2.525V10h-6.82v6.087a2.17 2.17 0 0 0 2.49 2.525v.38h-8.63v-.38a3.5 3.5 0 0 0 1.17-.189 2.8 2.8 0 0 0 .95-.551 2.6 2.6 0 0 0 .64-.892 3.05 3.05 0 0 0 .23-1.2V5.7a6.8 6.8 0 0 0-.41-2.5 4.04 4.04 0 0 0-1.15-1.644 4.6 4.6 0 0 0-1.8-.9 9.2 9.2 0 0 0-2.34-.275v18.612H4.49v-.38a3.5 3.5 0 0 0 1.17-.189 2.8 2.8 0 0 0 .95-.551 2.6 2.6 0 0 0 .64-.883 3 3 0 0 0 .23-1.206V.384a3.94 3.94 0 0 0-1.98.56 8.3 8.3 0 0 0-1.82 1.4 12 12 0 0 0-1.47 1.814 8.7 8.7 0 0 0-.94 1.851h-.26l.77-6h20.19v.38a2.217 2.217 0 0 0-2.49 2.526V9h6.82V2.906A2.22 2.22 0 0 0 23.81.38V0h13.67l.77 6h-.26a10.3 10.3 0 0 0-.96-2.022 8 8 0 0 0-1.39-1.738 6.4 6.4 0 0 0-1.8-1.215 5.15 5.15 0 0 0-2.17-.456h-2.21V9h1.32a3.84 3.84 0 0 0 1.98-.861 4.34 4.34 0 0 0 1.03-3.315h.29l1.18 9.117h-.29a5.9 5.9 0 0 0-.72-1.89A4.64 4.64 0 0 0 31.64 10h-2.18v8.423h2.95a5.15 5.15 0 0 0 2.17-.456 6.7 6.7 0 0 0 1.8-1.216 8.3 8.3 0 0 0 1.39-1.737 11.5 11.5 0 0 0 .96-2.023h.26l-.78 6h-14.4Z"></path></svg>
          </a>
          <div className='partner_divider'></div>
          <a href='https://www.halfdome.games/' target='_blank' rel='noreferrer'>
            <img className='halfdomelogo' src={halfdome.src} alt="Half Dome Logo" />
          </a>
        </div>
      </div>
      
      <div className='item2'>
        <div className='column1'>
        </div>
        <div className='column2'>
          {started
            ? <Gamescreen />
            : <Homepage onStart={handleStart} isLoading={isLoading} />
          }
        </div>
        <div className='column3'>
        </div>
      </div>

      <div className='item3'>
        <Footer />
      </div>
    </div>
  )
}