import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://scope.rubynodes.io/sitemap.xml",
    host: "https://scope.rubynodes.io",
  };
}
