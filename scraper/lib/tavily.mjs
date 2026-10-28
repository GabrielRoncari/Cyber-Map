// Busca web do Tavily (plano grátis: 1.000 créditos por mês; busca básica = 1 crédito).

// Às vezes o Tavily devolve zero resultados e, repetida, a mesma busca traz dez:
// uma segunda tentativa custa um crédito e evita perder a busca do dia.
export async function searchWeb(query, options) {
  const results = await searchOnce(query, options);
  return results.length ? results : searchOnce(query, options);
}

async function searchOnce(query, { apiKey, includeDomains = [], excludeDomains = [], maxResults = 10 }) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      topic: "general",
      country: "brazil",
      max_results: maxResults,
      include_domains: includeDomains,
      exclude_domains: excludeDomains
    }),
    signal: AbortSignal.timeout(30000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Tavily: HTTP ${response.status} ${body.detail?.error || body.error || ""}`.trim());
  return (body.results || []).map((result) => ({ url: result.url, title: result.title || "", snippet: result.content || "" }));
}
