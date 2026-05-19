import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import { AnalyticsProvider } from '@/components/analytics-provider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://painting.makeyourcraft.com'
const title = 'Custom Paint by Numbers from Your Photo | Makeyourcraft'
const description =
  'Turn your favorite photo into a personalized paint-by-numbers kit. Upload a picture, preview your custom artwork, and create a meaningful handmade gift.'
const ogImage = '/opengraph-image.png'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: ['/favicon.svg'],
    apple: ['/favicon.svg'],
  },
  openGraph: {
    title,
    description,
    url: '/',
    siteName: 'Makeyourcraft',
    type: 'website',
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: 'Makeyourcraft custom paint-by-numbers kit preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [ogImage],
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
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  )
}
