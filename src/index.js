export default {
  async fetch(request, env) {

    if (request.method !== "POST") {
      return new Response("Crawler API OK");
    }

    try {
      const { domain } = await request.json();

      if (!domain) {
        return Response.json({ error: "missing domain" }, { status: 400 });
      }

      const domains = await crawl(domain, env);

      return Response.json({ domains });

    } catch (err) {
      return Response.json(
        { error: "crawl failed" },
        { status: 500 }
      );
    }
  }
};


/* ========================= */

async function crawl(domain, env) {

  const cached = await env.CACHE.get(domain);
  if (cached) {
    return JSON.parse(cached);
  }

  const url = "https://" + domain;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; WebMapBot/1.0)"
    },
    redirect: "follow"
  });

  const html = await res.text();

  const matches = [...html.matchAll(/href=["'](https?:\/\/[^"']+)/gi)];

  const domains = new Set();

  const blacklist = [
    "google.com",
    "facebook.com",
    "twitter.com",
    "linkedin.com",
    "doubleclick",
    "youtube.com"
  ];

  for (const m of matches) {
    try {
      const d = new URL(m[1]).hostname;

      if (
        d !== domain &&
        !blacklist.some(b => d.includes(b))
      ) {
        domains.add(d);
      }

    } catch {}
  }

  const result = [...domains].slice(0, 30);

  await env.CACHE.put(
    domain,
    JSON.stringify(result),
    { expirationTtl: 86400 } 
  );

  return result;
}
