import React from 'react'
import Script from 'next/script'

export const Adsense = ({ pId }) => {
  return (
    <Script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${pId}`}
      crossOrigin="anonymous"
      strategy='afterInteractive'
    />
  )
}

export default Adsense
