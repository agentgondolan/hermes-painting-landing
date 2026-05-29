import { SingleScreenPreviewShell } from "@/components/single-screen-preview/single-screen-preview-shell"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dottingo.sg"

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["Organization", "OnlineStore"],
      "@id": `${siteUrl}/#organization`,
      name: "Dottingo",
      url: siteUrl,
      logo: `${siteUrl}/favicon.svg`,
      description:
        "Dottingo creates personalized dot art kits from customer photos.",
      sameAs: ["https://dottingo.sg"],
    },
    {
      "@type": "Service",
      "@id": `${siteUrl}/#custom-dot-art-service`,
      name: "Custom dot art from your photo",
      serviceType: "Personalized dot art kit",
      provider: {
        "@id": `${siteUrl}/#organization`,
      },
      areaServed: "Worldwide",
      url: siteUrl,
      description:
        "Upload a photo, preview it as custom dot artwork, and order a personalized dot art kit for a mindful handmade gift.",
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
        <h1 id="seo-heading">Custom dot art from your photo</h1>
        <p>
          Dottingo turns favorite photos into personalized dot art
          kits. Upload your picture, preview the custom artwork, and create a
          meaningful handmade gift for family, couples, pet lovers, or yourself.
        </p>
        <p>
          Each kit is designed to make creativity approachable: a custom dot canvas,
          matching markers, and a personal image transformed into a relaxing craft
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
