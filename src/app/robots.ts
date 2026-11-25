import type { MetadataRoute } from "next";

// Az admin útvonal szándékosan nincs itt felsorolva (az elárulná). Az admin oldalak noindex fejlécet kapnak.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }] };
}
