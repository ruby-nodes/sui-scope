import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  const specification = await readFile(
    join(process.cwd(), "../../docs/openapi.yaml"),
    "utf8",
  );
  return new Response(specification, {
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
