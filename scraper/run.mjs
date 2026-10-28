#!/usr/bin/env node
// Coletor de eventos do Cyber Map.
//
//   node scraper/run.mjs              acha eventos novos e grava em data/events.json
//   node scraper/run.mjs --dry-run    só mostra o que acharia, sem gravar
//   node scraper/run.mjs --max-pages 8
//   node scraper/run.mjs --completo   carga inicial: todas as buscas de uma vez,
//                                     mais uma por capital, até 200 páginas, relendo o cache
//
// Fluxo: busca (Tavily) + listagens + sites já conhecidos → triagem pela IA →
// leitura das páginas → extração pela IA em JSON → regras sem IA (cidade no IBGE,
// links presentes na página, data citada na página) → deduplicação → events.json.
// O GitHub Actions roda isso todo dia e abre um PR para revisão.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPage } from "./lib/page.mjs";
import { generateJson, QuotaError, usage } from "./lib/gemini.mjs";
import { searchWeb } from "./lib/tavily.mjs";
import { checkCandidate, differences, isIgnored, linkKeys, mergeEvents, quotedIn, sameEvent, serializeEvents } from "./lib/events.mjs";
import { hostOf, urlKey } from "./lib/text.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const paths = {
  events: join(root, "data/events.json"),
  sources: join(here, "sources.json"),
  ignore: join(here, "ignore.json"),
  cacheDir: join(here, ".cache"),
  cache: join(here, ".cache/state.json"),
  prBody: join(here, ".cache/pr-body.md"),
  env: join(root, ".env")
};

const args = process.argv.slice(2);
const flag = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const dryRun = args.includes("--dry-run");
const fullLoad = args.includes("--completo");
const maxPages = Number(flag("--max-pages")) || (fullLoad ? 200 : 24);
const pagesPerCall = 4;
const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);

// Chaves locais num .env (fora do git); no Actions elas vêm dos secrets.
if (existsSync(paths.env)) {
  for (const line of readFileSync(paths.env, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
const geminiKey = process.env.GEMINI_API_KEY;
const tavilyKey = process.env.TAVILY_API_KEY;
// Os 2.5 só atendem quem já os usava (changelog de 18/09/2026); 3.x é o plano grátis atual.
const models = (process.env.GEMINI_MODELS || "gemini-3.5-flash-lite,gemini-3.8-flash").split(",").map((item) => item.trim()).filter(Boolean);
if (!geminiKey) {
  console.error("Falta GEMINI_API_KEY (crie em https://aistudio.google.com/apikey e ponha no .env ou nos secrets do repositório).");
  process.exit(1);
}

const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const year = Number(today.slice(0, 4));
// O site mostra o ano inteiro (a aba "Já rolou"), então vale tudo desde 1º de janeiro.
const yearStart = `${year}-01-01`;
const sources = readJson(paths.sources, {});
const ignore = readJson(paths.ignore, { names: [], urls: [] });
const data = readJson(paths.events, { events: [] });
const cache = readJson(paths.cache, { pages: {}, triage: {} });
const report = { searches: [], listings: [], leads: 0, triaged: 0, kept: 0, read: 0, fetchErrors: [], rejected: [], errors: [], quota: null };

const day = 864e5;
const fresh = (entry, days) => Boolean(entry) && Date.now() - Date.parse(entry.at) < days * day;
// Página com evento: relê em 14 dias (datas mudam). Sem evento: 30. Erro: amanhã.
const pageTtl = (entry) => ({ events: 14, empty: 30 }[entry?.status] ?? 1);
// Na carga completa só vale o que a própria carga já leu: assim ela relê o que o
// diário descartou e, se a cota acabar no meio, continua de onde parou.
const pageFresh = (key) => fresh(cache.pages[key], pageTtl(cache.pages[key])) && (!fullLoad || cache.pages[key].full === true);
const excludeDomains = sources.excludeDomains || [];
const excluded = (url) => excludeDomains.some((domain) => hostOf(url) === domain || hostOf(url).endsWith(`.${domain}`));
const fill = (text) => String(text).replaceAll("{ano}", String(year)).replaceAll("{proximo}", String(year + 1));

/* ---------- 1. Pistas: busca web e listagens ---------- */

const leads = new Map();
const addLead = (lead) => {
  const key = urlKey(lead.url);
  if (!key || excluded(lead.url) || leads.has(key)) return;
  leads.set(key, lead);
};

if (tavilyKey) {
  // Rodízio: cada dia usa um pedaço da lista, para caber nos 1.000 créditos/mês.
  // A carga completa faz todas de uma vez, mais uma busca por capital.
  const searches = sources.searches || [];
  const perCity = sources.completo?.porCidade;
  const fullSearches = [...searches, ...(perCity ? (sources.completo.cidades || []).map((city) => ({ query: perCity.replaceAll("{cidade}", city) })) : [])];
  const perRun = fullLoad ? fullSearches.length : Math.min(sources.searchesPerRun || 10, searches.length);
  const start = fullLoad ? 0 : (Math.floor(Date.now() / day) * perRun) % Math.max(searches.length, 1);
  for (let i = 0; i < perRun; i++) {
    const search = fullLoad ? fullSearches[i] : searches[(start + i) % searches.length];
    const query = fill(search.query);
    try {
      const results = await searchWeb(query, { apiKey: tavilyKey, includeDomains: search.includeDomains || [], excludeDomains });
      results.forEach((result) => addLead({ ...result, origin: `busca: ${query}` }));
      report.searches.push(`${query} (${results.length})`);
    } catch (error) {
      report.errors.push(`busca "${query}": ${error.message}`);
    }
  }
} else {
  report.errors.push("sem TAVILY_API_KEY: busca web desligada, só listagens e sites conhecidos");
}

for (const listing of sources.listings || []) {
  try {
    const page = await fetchPage(fill(listing));
    const items = page.structured.filter((item) => item.url);
    items.forEach((item) => addLead({
      url: item.url,
      title: item.name,
      snippet: [item.startDate, [item.city, item.region].filter(Boolean).join(" "), item.description].filter(Boolean).join(" · "),
      origin: `listagem: ${hostOf(page.url)}`
    }));
    report.listings.push(`${fill(listing)} (${items.length})`);
  } catch (error) {
    report.errors.push(`listagem ${fill(listing)}: ${error.message}`);
  }
}
report.leads = leads.size;

// Sites e ingressos de eventos futuros que já estão no mapa: relidos para pegar
// mudança de data ou a edição seguinte. Vão direto para a leitura, sem triagem.
const fixed = new Map();
const addFixed = (url, origin) => { const key = urlKey(url); if (key && !excluded(url) && !fixed.has(key)) fixed.set(key, { url, origin }); };
(sources.pages || []).forEach((url) => addFixed(fill(url), "fonte fixa"));
data.events.filter((event) => (event.endDate || event.startDate) >= today).forEach((event) => {
  ["site", "tickets"].forEach((key) => { if (event.links?.[key]) addFixed(event.links[key], `já no mapa: ${event.name}`); });
});

/* ---------- 2. Triagem: quais pistas parecem página de evento ---------- */

const triageSchema = { type: "OBJECT", properties: { keep: { type: "ARRAY", items: { type: "INTEGER" } } }, required: ["keep"] };
const triageSystem = `Você faz a triagem de resultados de busca para o Cyber Map, um mapa de eventos PRESENCIAIS de segurança da informação e cultura hacker no Brasil (conferências, CTFs, meetups, workshops). Hoje é ${today}.
Devolva em "keep" os índices dos resultados que provavelmente são a página de um evento assim (ou uma agenda com eventos assim) de ${year} em diante, inclusive os que já aconteceram em ${year}.
Descarte: notícias e artigos, cursos online, vagas, webinars, eventos de TI genérica, segurança do trabalho, segurança patrimonial e eventos de outros países. Na dúvida, mantenha.`;

const toTriage = [...leads].filter(([key]) => !fixed.has(key) && !pageFresh(key) && !fresh(cache.triage[key], 30));
let quotaHit = false;
for (let i = 0; i < toTriage.length && !quotaHit; i += 60) {
  const chunk = toTriage.slice(i, i + 60);
  const prompt = chunk.map(([, lead], index) => `${index}. ${lead.title} — ${String(lead.snippet).replace(/\s+/g, " ").slice(0, 280)} (${lead.url})`).join("\n");
  try {
    const { value } = await generateJson({ apiKey: geminiKey, models, system: triageSystem, prompt, schema: triageSchema });
    const keep = new Set(value.keep || []);
    chunk.forEach(([key], index) => { cache.triage[key] = { at: new Date().toISOString(), keep: keep.has(index) }; });
    report.triaged += chunk.length;
    report.kept += keep.size;
  } catch (error) {
    if (error instanceof QuotaError) { quotaHit = true; report.quota = error.message; } else report.errors.push(`triagem: ${error.message}`);
  }
}

/* ---------- 3. Leitura e extração ---------- */

const queue = [
  ...[...leads].filter(([key]) => cache.triage[key]?.keep && !fixed.has(key)).map(([key, lead]) => ({ key, ...lead })),
  ...[...fixed].map(([key, item]) => ({ key, ...item }))
].filter((item) => !pageFresh(item.key)).slice(0, maxPages);

const extractSchema = {
  type: "OBJECT",
  properties: {
    events: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          page: { type: "INTEGER" },
          name: { type: "STRING" },
          calendarLabel: { type: "STRING" },
          type: { type: "STRING", enum: ["conference", "ctf", "meetup", "workshop", "other"] },
          securityEvent: { type: "BOOLEAN" },
          inPerson: { type: "BOOLEAN" },
          vendorEvent: { type: "BOOLEAN" },
          country: { type: "STRING" },
          city: { type: "STRING" },
          state: { type: "STRING" },
          startDate: { type: "STRING" },
          endDate: { type: "STRING", nullable: true },
          venue: { type: "STRING", nullable: true },
          description: { type: "STRING" },
          links: { type: "OBJECT", nullable: true, properties: Object.fromEntries(linkKeys.map((key) => [key, { type: "STRING", nullable: true }])) },
          evidence: { type: "STRING" }
        },
        required: ["page", "name", "calendarLabel", "type", "securityEvent", "inPerson", "vendorEvent", "country", "city", "state", "startDate", "description", "evidence"]
      }
    }
  },
  required: ["events"]
};
const extractSystem = `Você extrai eventos de páginas web para o Cyber Map, um mapa de eventos PRESENCIAIS de segurança da informação e cultura hacker no Brasil. Hoje é ${today}.
Regras:
- Use só o que está escrito na página (TEXTO e DADOS ESTRUTURADOS). Nunca complete com conhecimento próprio.
- Se a página não anuncia nenhum evento com data, devolva "events": [].
- Uma página pode ter vários eventos (agenda): devolva cada um, com "page" = número da página.
- securityEvent = true só se o tema central for segurança da informação, cibersegurança, hacking, CTF ou cultura hacker. Feira de TI genérica, segurança do trabalho ou patrimonial = false.
- inPerson = true se há local físico (híbrido conta); só online = false. country = "BR" se for no Brasil.
- vendorEvent = true se for evento comercial de uma empresa só sobre os próprios produtos (roadshow, lançamento, demo de fabricante). Conferência com vários palestrantes e empresas = false, mesmo com patrocinador.
- Eventos que já aconteceram neste ano também valem: devolva-os normalmente.
- Datas em AAAA-MM-DD. endDate só se durar mais de um dia (último dia, inclusivo); senão null.
- A data é a do evento acontecer. Prazo de ingresso, lote, preço promocional, inscrição ou chamada de palestras NÃO é data do evento. Se a página não diz o dia do evento (só "Maio 2027", por exemplo), não invente: deixe esse evento de fora.
- city = nome oficial do município (ex.: "Florianópolis", não "Floripa"). state = sigla da UF em minúsculas (ex.: "sp").
- calendarLabel = nome curto para a linha do tempo, até 18 caracteres (ex.: "BSides SP", "Mind The Sec").
- type = conference, ctf, meetup, workshop ou other.
- description = uma frase em português, até 140 caracteres, só com fatos da página.
- links: só URLs que aparecem em LINKS daquela página ou a própria URL. site = site oficial do evento; tickets = ingressos ou inscrição; cfp = chamada de palestras.
- evidence = copie literalmente da página o trecho (até 120 caracteres) que mostra o dia em que o evento acontece.`;

const pageBlock = (page, index) => [
  `### PÁGINA ${index}`,
  `URL: ${page.url}`,
  `TÍTULO: ${page.title}`,
  page.description ? `DESCRIÇÃO: ${page.description}` : "",
  page.structured.length ? `DADOS ESTRUTURADOS: ${JSON.stringify(page.structured.slice(0, 8))}` : "",
  `LINKS: ${page.hrefs.filter((href) => hostOf(href) !== hostOf(page.url) || /ingresso|ticket|inscri|cfp|call|palestr/i.test(href)).slice(0, 40).join(" ")}`,
  "TEXTO:",
  page.text.slice(0, 6000)
].filter(Boolean).join("\n");

const now = () => new Date().toISOString();
const fetched = [];
for (let i = 0; i < queue.length; i += 4) {
  const results = await Promise.allSettled(queue.slice(i, i + 4).map((item) => fetchPage(item.url)));
  results.forEach((result, offset) => {
    const item = queue[i + offset];
    if (result.status === "fulfilled") fetched.push({ item, page: result.value });
    else {
      cache.pages[item.key] = { at: now(), status: "error", error: result.reason.message, events: [], full: fullLoad || undefined };
      report.fetchErrors.push(`${item.url}: ${result.reason.message}`);
    }
  });
}
report.read = fetched.length;

for (let i = 0; i < fetched.length && !quotaHit; i += pagesPerCall) {
  const batch = fetched.slice(i, i + pagesPerCall);
  try {
    const { value } = await generateJson({ apiKey: geminiKey, models, system: extractSystem, prompt: batch.map(({ page }, index) => pageBlock(page, index)).join("\n\n"), schema: extractSchema });
    // Com várias páginas por chamada o modelo às vezes troca o número da página:
    // o evento fica com a página onde o trecho que ele citou está de verdade.
    const owner = (raw) => {
      if (batch[raw.page] && quotedIn(batch[raw.page].page, raw.evidence)) return raw.page;
      const found = batch.findIndex(({ page }) => quotedIn(page, raw.evidence));
      return found === -1 ? raw.page : found;
    };
    const found = (value.events || []).map((raw) => ({ ...raw, page: owner(raw) }));
    batch.forEach(({ item, page }, index) => {
      const accepted = [];
      found.filter((raw) => raw.page === index).forEach((raw) => {
        const checked = checkCandidate(raw, page, today);
        if (checked.reject) report.rejected.push(`${checked.reject} — ${page.url}`);
        else accepted.push({ ...checked, origin: item.origin });
      });
      cache.pages[item.key] = { at: now(), status: accepted.length ? "events" : "empty", events: accepted, full: fullLoad || undefined };
    });
  } catch (error) {
    if (error instanceof QuotaError) { quotaHit = true; report.quota = error.message; } else report.errors.push(`extração: ${error.message}`);
  }
}

/* ---------- 4. O que é novo, o que mudou ---------- */

const candidates = Object.values(cache.pages)
  .filter((entry) => fresh(entry, 60))
  .flatMap((entry) => entry.events || [])
  .filter((candidate) => (candidate.event.endDate || candidate.event.startDate) >= yearStart && !isIgnored(candidate, ignore));

const additions = [];
const changes = [];
for (const candidate of candidates) {
  const current = data.events.find((event) => sameEvent({ ...event, state: String(event.state).toLowerCase() }, candidate.event));
  if (current) {
    const diffs = differences(current, candidate.event);
    if (diffs.length && !changes.some((change) => change.current === current && urlKey(change.source) === urlKey(candidate.source))) changes.push({ current, diffs, source: candidate.source });
    continue;
  }
  const twin = additions.findIndex((other) => sameEvent(other.event, candidate.event));
  const score = (item) => (item.verified ? 10 : 0) + Object.keys(item.event.links || {}).length;
  if (twin === -1) additions.push(candidate);
  else if (score(candidate) > score(additions[twin])) additions[twin] = candidate;
}

/* ---------- 5. Grava ---------- */

if (additions.length && !dryRun) {
  writeFileSync(paths.events, serializeEvents({ ...data, events: mergeEvents(data.events, additions.map((item) => item.event)) }));
}

// Poda o cache: nada com mais de 90 dias.
for (const store of [cache.pages, cache.triage]) {
  for (const [key, entry] of Object.entries(store)) if (!fresh(entry, 90)) delete store[key];
}
mkdirSync(paths.cacheDir, { recursive: true });
writeFileSync(paths.cache, `${JSON.stringify(cache, null, 1)}\n`);

const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const formatDates = ({ startDate, endDate }) => {
  const [y, m, d] = startDate.split("-").map(Number);
  if (!endDate) return `${d} ${months[m - 1]} ${y}`;
  const [y2, m2, d2] = endDate.split("-").map(Number);
  return y === y2 && m === m2 ? `${d}–${d2} ${months[m - 1]} ${y}` : `${d} ${months[m - 1]} – ${d2} ${months[m2 - 1]} ${y2}`;
};
const cell = (text) => String(text).replace(/\|/g, "\\|").replace(/\s+/g, " ");
const lines = [];
if (additions.length) {
  lines.push(`## ${additions.length} ${additions.length === 1 ? "evento novo" : "eventos novos"} para revisar`, "");
  lines.push("| Evento | Datas | Local | Tipo | Fonte | Data conferida |", "|---|---|---|---|---|---|");
  additions.forEach(({ event, source, verified, warning, evidence }) => {
    const check = verified ? `✅ “${cell(evidence)}”` : `⚠️ ${warning || "trecho não achado na página"}${evidence ? `: “${cell(evidence)}”` : ""}`;
    lines.push(`| ${cell(event.name)} | ${formatDates(event)} | ${cell(event.city)} · ${event.state.toUpperCase()} | ${event.type} | [${hostOf(source)}](${source}) | ${check} |`);
  });
  lines.push("", "Datas, cidade, descrição e links vêm da IA: confira na fonte antes de aprovar. Os logos não são preenchidos.");
  lines.push("Para recusar um evento de vez, ponha o nome dele em `scraper/ignore.json` na branch principal: o próximo run tira ele daqui. Editar este PR não basta, porque o coletor refaz a branch todo dia.");
} else {
  lines.push("## Nenhum evento novo");
}
if (changes.length) {
  lines.push("", "## Possíveis mudanças em eventos do mapa (não alterados aqui)", "");
  changes.forEach(({ current, diffs, source }) => {
    lines.push(`- **${current.name}**: ${diffs.map((diff) => `${diff.key} ${diff.current} → ${diff.found}`).join(", ")} ([fonte](${source}))`);
  });
}
lines.push("", "<details><summary>Execução</summary>", "");
if (fullLoad) lines.push("- Modo: carga completa (todas as buscas, uma por capital, cache relido)");
lines.push(`- Buscas: ${report.searches.length ? report.searches.join("; ") : "nenhuma"}`);
lines.push(`- Listagens: ${report.listings.length ? report.listings.join("; ") : "nenhuma"}`);
lines.push(`- Pistas: ${report.leads}; triadas agora: ${report.triaged} (mantidas ${report.kept}); páginas lidas: ${report.read}`);
lines.push(`- Gemini: ${usage.calls} chamadas, ${usage.tokens} tokens, por modelo ${JSON.stringify(usage.byModel)}`);
if (Object.keys(usage.unavailable).length) lines.push(`- Modelos fora: ${Object.entries(usage.unavailable).map(([model, why]) => `${model} (${why})`).join("; ")}`);
if (report.quota) lines.push(`- Cota: parou antes do fim (${report.quota}); o resto fica para o próximo run`);
if (report.rejected.length) lines.push(`- Descartados pelas regras: ${report.rejected.length}`, ...report.rejected.slice(0, 30).map((item) => `  - ${item}`));
if (report.fetchErrors.length) lines.push(`- Páginas com erro: ${report.fetchErrors.length}`, ...report.fetchErrors.slice(0, 15).map((item) => `  - ${item}`));
if (report.errors.length) lines.push(...report.errors.map((item) => `- ${item}`));
lines.push("", "</details>");
const body = `${lines.join("\n")}\n`;
writeFileSync(paths.prBody, body);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, body);

console.log(body);
console.log(dryRun ? "(--dry-run: data/events.json não foi alterado)" : additions.length ? `data/events.json: +${additions.length}` : "data/events.json sem mudanças");
// Falha visível no Actions se a IA só deu erro (cota esgotada não conta como falha).
if (report.errors.some((item) => item.startsWith("extração") || item.startsWith("triagem")) && !Object.keys(usage.byModel).length) process.exit(1);
