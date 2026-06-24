// The normalized representation of a business.
//
// Everything in Beacon flows through this one shape: ingestion fills it in
// (from a live site and/or hand-supplied facts), and every generator reads
// from it to emit agent-legible artifacts. Keep it the single source of truth.

export interface Address {
  street?: string;
  city?: string;
  region?: string; // state / province
  postalCode?: string;
  country?: string;
}

export interface Geo {
  lat: number;
  lng: number;
}

export interface OpeningHours {
  // Days as full names: "Monday", "Tuesday", ... or "Public Holidays".
  days: string[];
  opens: string; // "09:00"
  closes: string; // "17:00"
}

export interface Service {
  name: string;
  description?: string;
  price?: string; // free-form, e.g. "from $120" or "$80/hr"
  url?: string;
}

export interface Product {
  name: string;
  description?: string;
  price?: string;
  sku?: string;
  url?: string;
  availability?: string; // "InStock" | "OutOfStock" | free text
}

export interface FAQ {
  question: string;
  answer: string;
}

export type ActionKind = "contact" | "quote" | "book" | "order" | "custom";

// What an agent can *do* with this business. This is the transactability
// layer — discoverability tells an AI the business exists; actions let the
// AI actually transact on a customer's behalf.
export interface AgentAction {
  name: string; // human/agent label, e.g. "Request a quote"
  kind: ActionKind;
  description: string;
  // How the action is performed. For MVP we describe an HTTP endpoint the
  // agent can POST to (or a mailto/tel fallback when no endpoint exists).
  endpoint?: string;
  method?: "GET" | "POST";
  params?: ActionParam[];
}

export interface ActionParam {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "email" | "tel";
  required: boolean;
  description?: string;
}

export interface BusinessProfile {
  name: string;
  legalName?: string;
  tagline?: string;
  description?: string;

  // schema.org type, e.g. "LocalBusiness", "Restaurant", "Plumber".
  schemaType?: string;

  url?: string; // canonical human-facing site
  agentUrl?: string; // where the generated agent site is hosted
  logo?: string;
  image?: string;

  email?: string;
  phone?: string;
  address?: Address;
  geo?: Geo;
  areaServed?: string[];

  hours?: OpeningHours[];
  priceRange?: string; // "$$"

  services?: Service[];
  products?: Product[];
  faqs?: FAQ[];

  socials?: Record<string, string>; // { twitter: "https://...", ... }
  keywords?: string[];

  actions?: AgentAction[];

  // Provenance: where each chunk of data came from. Honesty by construction —
  // a buyer (and an agent) can see what was extracted vs. asserted.
  sources?: string[];
}

// A generated output file, ready to be written to the bundle directory.
export interface OutputFile {
  path: string; // relative to the output root
  content: string;
}

export type BuildMode = "companion" | "upgrade";
