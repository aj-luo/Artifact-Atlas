import '../index.css'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import Script from 'next/script' 
import Providers from './providers'

export const metadata = {
  title: 'Artifact Atlas',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
}

export default function RootLayout({
  children,
}) {
  return (
    <html lang="en">
      <head>
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4634976137290206"
     crossOrigin="anonymous"></script>
        <meta name="google-adsense-account" content="ca-pub-4634976137290206"></meta>
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  )
}
