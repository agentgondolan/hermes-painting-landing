import type { Metadata } from 'next'
import { Inter_Tight, Outfit } from 'next/font/google'
import { AnalyticsProvider } from '@/components/analytics-provider'
import './globals.css'

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
})

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dottingo.sg'
const title = 'Custom Paint by Numbers from Your Photo | Dottingo'
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
    siteName: 'Dottingo',
    type: 'website',
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: 'Dottingo custom paint-by-numbers kit preview',
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
      <body className={`${interTight.variable} ${outfit.variable}`}>
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  )
}
