import { useState } from 'react'
import Footer from './Footer/Footer.jsx'
import Gamescreen from './Gamescreen/Gamescreen.jsx'
import Homepage from './Homepage/Homepage.jsx'
import logo from './assets/AA_logo.png'
import hdlogo from './assets/half-dome-logo.png'

function App() {
  const [started, setStarted] = useState(false);

  return (
    <>
     <div className='page'>
        <div className='item1'>

          <div className='logo_wrapper'>
            <img src={logo} className='logo'></img>
          </div>

          <a href="https://www.halfdome.games/" target='_blank'><img src={hdlogo} className='hdlogo'></img></a>

        </div>
        <div className='item2'>
          {started
            ? <Gamescreen />
            : <Homepage onStart={() => setStarted(true)} />
          }
        </div>
        <div className='item3'>
          <Footer />
        </div>
     </div>
    </>
  )
}

export default App
