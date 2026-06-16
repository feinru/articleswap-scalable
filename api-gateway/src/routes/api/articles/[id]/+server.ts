import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";

const DEFAULT_ARTICLE_SERVICE_URL = "http://localhost:3000";

function articleServiceUrl(id: string): string {
  const base = env.ARTICLE_SERVICE_URL || DEFAULT_ARTICLE_SERVICE_URL;
  return `${base.replace(/\/$/, "")}/api/articles/${encodeURIComponent(id)}`;
}

export const GET: RequestHandler = async ({ params }) => {
  const upstream = await fetch(articleServiceUrl(params.id));

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json"
    }
  });
};
