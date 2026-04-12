import React from 'react'
import { useEffect } from 'react'

export const AdBanner = ({ dataAdSlot, dataAdFormat, dataFullWidthResponsive }) => {

    useEffect(()=> {
        try {(window.adsbygoogle = window.adsbygoogle || []).push({});}
        catch (error) {
            console.log(error.message);
        }
        
    }, []);

  return (
    <ins className="adsbygoogle"
      style={{ display: 'block' }}
      data-ad-client="ca-pub-9278425510747491"
      data-ad-slot={dataAdSlot}
      data-ad-format={dataAdFormat}
      data-full-width-responsive={dataFullWidthResponsive}>
    </ins>
  )
}

export default AdBanner;