import '../index.css'

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

      </head>

      <body>
        {children}
      </body>
    </html>
  )
}