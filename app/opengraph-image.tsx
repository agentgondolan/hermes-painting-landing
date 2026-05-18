import { ImageResponse } from 'next/og'

export const alt = 'Makeyourcraft custom paint-by-numbers kit preview'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'
export const dynamic = 'force-static'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'center',
          background:
            'radial-gradient(circle at 72% 24%, rgba(215,161,95,0.42), transparent 30%), linear-gradient(135deg, #120d0a 0%, #241810 48%, #f6f1e8 48%, #ead8bf 100%)',
          color: '#f8f4ec',
          display: 'flex',
          fontFamily: 'Arial, sans-serif',
          height: '100%',
          justifyContent: 'space-between',
          padding: '72px 84px',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 640 }}>
          <div
            style={{
              color: '#d7a15f',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: 'uppercase',
            }}
          >
            Makeyourcraft
          </div>
          <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 0.94 }}>
            Custom paint by numbers from your photo
          </div>
          <div style={{ color: '#ead8bf', fontSize: 31, lineHeight: 1.25 }}>
            Upload a picture. Preview your artwork. Create a meaningful handmade gift.
          </div>
        </div>
        <div
          style={{
            alignItems: 'center',
            background: '#f8f4ec',
            border: '18px solid #3b2618',
            boxShadow: '0 32px 90px rgba(0,0,0,0.32)',
            display: 'flex',
            height: 360,
            justifyContent: 'center',
            transform: 'rotate(-4deg)',
            width: 330,
          }}
        >
          <div
            style={{
              background:
                'linear-gradient(135deg, #d7a15f 0 18%, #ead8bf 18% 36%, #7b4b2a 36% 54%, #f8f4ec 54% 72%, #c35f46 72% 100%)',
              border: '8px solid #120d0a',
              display: 'flex',
              height: 250,
              width: 220,
            }}
          />
        </div>
      </div>
    ),
    size,
  )
}
