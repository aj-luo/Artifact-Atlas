import '../index.css'
import Script from 'next/script' 

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
     crossorigin="anonymous"></script>
        <meta name="google-adsense-account" content="ca-pub-4634976137290206"></meta>
      </head>
      <body>{children}</body>
    </html>
  )
}
