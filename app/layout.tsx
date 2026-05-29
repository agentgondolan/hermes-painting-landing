import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import { AnalyticsProvider } from '@/components/analytics-provider'
import './globals.css'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dottingo.sg'
const title = 'Custom Dot Art from Your Photo | Dottingo'
const description =
  'Turn your favorite photo into a personalized dot art kit. Upload a picture, preview your custom artwork, and create a meaningful handmade gift.'
const ogImage = '/opengraph-image.png'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [{ url: '/favicon.png', type: 'image/png' }],
    shortcut: ['/favicon.png'],
    apple: ['/apple-touch-icon.png'],
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
        alt: 'Dottingo custom dot art kit preview',
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
      <body className={outfit.variable}>
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  )
}
