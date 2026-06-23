// JSON-LD structured data (Schema.org). This is what Google's AI Overviews,
// ChatGPT browsing, Perplexity and friends parse to understand and *cite* a
// business. Emitting clean, rich JSON-LD is the single highest-leverage thing
// for AI discoverability.

import type { BusinessProfile } from "../types.ts";
import { prune } from "../util.ts";

const DAY_MAP: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function openingHoursSpec(p: BusinessProfile) {
  if (!p.hours?.length) return undefined;
  return p.hours.map((h) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: h.days.map((d) => DAY_MAP[d.toLowerCase()] ?? d),
    opens: h.opens,
    closes: h.closes,
  }));
}

export function buildJsonLd(p: BusinessProfile): object {
  const graph: any[] = [];

  const business = prune({
    "@type": p.schemaType || "LocalBusiness",
    "@id": p.url ? `${p.url.replace(/\/$/, "")}/#business` : undefined,
    name: p.name,
    legalName: p.legalName,
    description: p.description,
    slogan: p.tagline,
    url: p.url,
    logo: p.logo,
    image: p.image,
    email: p.email ? `mailto:${p.email}` : undefined,
    telephone: p.phone,
    priceRange: p.priceRange,
    keywords: p.keywords?.join(", "),
    areaServed: p.areaServed,
    address: p.address
      ? prune({
          "@type": "PostalAddress",
          streetAddress: p.address.street,
          addressLocality: p.address.city,
          addressRegion: p.address.region,
          postalCode: p.address.postalCode,
          addressCountry: p.address.country,
        })
      : undefined,
    geo: p.geo
      ? { "@type": "GeoCoordinates", latitude: p.geo.lat, longitude: p.geo.lng }
      : undefined,
    openingHoursSpecification: openingHoursSpec(p),
    sameAs: p.socials ? Object.values(p.socials) : undefined,
    makesOffer: p.services?.map((s) =>
      prune({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: s.name, description: s.description },
        url: s.url,
        priceSpecification: s.price
          ? { "@type": "PriceSpecification", price: s.price }
          : undefined,
      }),
    ),
  });
  graph.push(business);

  if (p.products?.length) {
    for (const prod of p.products) {
      graph.push(
        prune({
          "@type": "Product",
          name: prod.name,
          description: prod.description,
          sku: prod.sku,
          url: prod.url,
          offers: prune({
            "@type": "Offer",
            price: prod.price,
            availability: prod.availability
              ? `https://schema.org/${prod.availability.replace(/[^a-z]/gi, "")}`
              : undefined,
          }),
        }),
      );
    }
  }

  if (p.faqs?.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: p.faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

export function jsonLdScript(p: BusinessProfile): string {
  return `<script type="application/ld+json">\n${JSON.stringify(buildJsonLd(p), null, 2)}\n</script>`;
}
