import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";

const DEFAULT_ARTICLE_SERVICE_URL = "http://localhost:3000";

function articleServiceUrl(path = ""): string {
  const base = env.ARTICLE_SERVICE_URL || DEFAULT_ARTICLE_SERVICE_URL;
  return `${base.replace(/\/$/, "")}/api/articles${path}`;
}

async function proxyArticleRequest(request: Request, path = ""): Promise<Response> {
  const upstream = await fetch(articleServiceUrl(path), {
    method: request.method,
    headers: {
      "content-type": request.headers.get("content-type") || "application/json",
      accept: request.headers.get("accept") || "application/json"
    },
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text()
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json"
    }
  });
}

export const GET: RequestHandler = async ({ url, request }) => {
  return proxyArticleRequest(request, url.search);
};

export const POST: RequestHandler = async ({ request }) => {
  return proxyArticleRequest(request);
};
