import { SingleScreenPreviewShell } from "@/components/single-screen-preview/single-screen-preview-shell"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://painting.makeyourcraft.com"

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["Organization", "OnlineStore"],
      "@id": `${siteUrl}/#organization`,
      name: "Makeyourcraft",
      url: siteUrl,
      logo: `${siteUrl}/favicon.svg`,
      description:
        "Makeyourcraft creates personalized paint-by-numbers kits from customer photos.",
      sameAs: ["https://makeyourcraft.com"],
    },
    {
      "@type": "Service",
      "@id": `${siteUrl}/#custom-paint-by-numbers-service`,
      name: "Custom paint by numbers from your photo",
      serviceType: "Personalized paint-by-numbers kit",
      provider: {
        "@id": `${siteUrl}/#organization`,
      },
      areaServed: "Worldwide",
      url: siteUrl,
      description:
        "Upload a photo, preview it as custom artwork, and order a personalized paint-by-numbers kit for a handmade gift.",
      offers: {
        "@type": "Offer",
        availability: "https://schema.org/InStock",
        url: siteUrl,
      },
    },
  ],
}

export default function Home() {
  return (
    <>
      <section className="sr-only" aria-labelledby="seo-heading">
        <h1 id="seo-heading">Custom paint by numbers from your photo</h1>
        <p>
          Makeyourcraft turns favorite photos into personalized paint-by-numbers
          kits. Upload your picture, preview the custom artwork, and create a
          meaningful handmade gift for family, couples, pet lovers, or yourself.
        </p>
        <p>
          Each kit is designed to make painting approachable: a numbered canvas,
          matching colors, and a personal image transformed into a relaxing craft
          experience.
        </p>
      </section>
      <SingleScreenPreviewShell />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </>
  )
}
