import React from 'react'
import { useEffect, useRef } from 'react'

export const AdBanner = ({ dataAdSlot, adStyle }) => {
  const adRef = useRef(null)
  const hasInitialized = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (hasInitialized.current) return

      const adElement = adRef.current
      if (!adElement) return

      if (
        adElement.getAttribute('data-adsbygoogle-status') === 'done' ||
        adElement.getAttribute('data-ad-requested') === 'true'
      ) {
        hasInitialized.current = true
        return
      }

      try {
        adElement.setAttribute('data-ad-requested', 'true')
        ;(window.adsbygoogle = window.adsbygoogle || []).push({})
        hasInitialized.current = true
      } catch (error) {
        adElement.removeAttribute('data-ad-requested')
        const message = error?.message || ''
        if (!message.includes('already have ads')) {
          console.error(message)
        }
      }
    }, 0)

    return () => clearTimeout(timer)
  }, [])

  return (
    <ins
      ref={adRef}
      className="adsbygoogle"
      style={adStyle || { display: 'block' }}
      data-ad-client="ca-pub-9278425510747491"
      data-ad-slot={dataAdSlot}
    ></ins>
  )
}

export default AdBanner
