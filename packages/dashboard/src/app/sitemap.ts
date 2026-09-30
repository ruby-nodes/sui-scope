import type { MetadataRoute } from "next";

import { fetchProviders } from "@/lib/api-client";

const SITE_URL = "https://scope.rubynodes.io";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL + "/", changeFrequency: "daily", priority: 1 },
    {
      url: SITE_URL + "/methodology",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    { url: SITE_URL + "/api", changeFrequency: "monthly", priority: 0.8 },
  ];

  try {
    const providers = await fetchProviders();
    return [
      ...staticPages,
      ...providers.map((provider) => ({
        url: SITE_URL + "/provider/" + encodeURIComponent(provider.id),
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
    ];
  } catch {
    return staticPages;
  }
}
