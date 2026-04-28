import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
})

export const metadata: Metadata = {
  title: 'Makeyourcraft Painting — Narrative Prototype',
  description:
    'Story-driven prototype for the Makeyourcraft paint-by-numbers landing page, featuring a premium hero, staged transformation flow, and local-first assets.',
  metadataBase: new URL('https://painting.makeyourcraft.com'),
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: ['/favicon.svg'],
    apple: ['/favicon.svg'],
  },
  openGraph: {
    title: 'Makeyourcraft Painting — Narrative Prototype',
    description: 'Story-driven landing prototype for the paint-by-numbers experience.',
    url: 'https://painting.makeyourcraft.com',
    siteName: 'Makeyourcraft Painting',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable}`}>
        {children}
      </body>
    </html>
  )
}
