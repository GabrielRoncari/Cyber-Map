// Regras sem IA: valida o que o modelo extraiu, põe coordenadas pela tabela do
// IBGE, compara com o events.json e grava no mesmo formato do arquivo.
import { readFileSync } from "node:fs";
import { hostOf, normalize, slugify, urlKey } from "./text.mjs";

const geo = JSON.parse(readFileSync(new URL("../data/municipios.json", import.meta.url), "utf8")).municipios;
const cityIndex = Object.fromEntries(Object.entries(geo).map(([uf, rows]) => [uf, new Map(rows.map((row) => [normalize(row[0]), row]))]));

export const linkKeys = ["site", "tickets", "cfp", "instagram", "twitter", "bluesky", "mastodon", "facebook", "linkedin", "youtube", "discord", "telegram", "github"];
const types = new Set(["conference", "ctf", "meetup", "workshop"]);
const ticketHosts = /(^|\.)(sympla\.com\.br|eventbrite\.com(\.br)?|even3\.com\.br|doity\.com\.br|ingresse\.com|bileto\.sympla\.com\.br)$/;
// Palavras de prazo/preço num trecho já normalizado (sem acento, minúsculo).
// "até" não entra: a Sympla escreve o horário do evento como "De 7 de março, às
// 09h00; até 7 de março, às 19h00".
const deadlineWords = /\b(lote|valor|preco|desconto|promocional|prazo|inscricoes|inscricao|submissao|submissoes|cfp)\b/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value) => isoDate.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

export const findCity = (city, uf) => cityIndex[uf]?.get(normalize(city)) || null;
// O trecho citado pelo modelo existe mesmo na página (texto ou dados estruturados)?
export const quotedIn = (page, evidence) => {
  const needle = normalize(evidence);
  return needle.length >= 4 && normalize(`${page.text}\n${JSON.stringify(page.structured)}`).includes(needle);
};

// Valida um evento vindo do modelo. Devolve { event, verified, warning, evidence } ou { reject }.
export function checkCandidate(raw, page, today) {
  const uf = String(raw.state || "").toLowerCase().trim();
  const reject = (reason) => ({ reject: `${raw.name || "?"}: ${reason}` });
  if (!raw.securityEvent) return reject("não é de segurança");
  if (!raw.inPerson) return reject("não é presencial");
  if (raw.vendorEvent) return reject("evento de um fornecedor só");
  if (!/^(br|brasil|brazil)$/i.test(String(raw.country || "").trim())) return reject(`fora do Brasil (${raw.country})`);
  if (!types.has(raw.type)) return reject(`tipo ${raw.type}`);
  if (!cityIndex[uf]) return reject(`UF inválida (${raw.state})`);
  const city = findCity(raw.city || "", uf);
  if (!city) return reject(`cidade não encontrada no IBGE (${raw.city}/${uf.toUpperCase()})`);
  const startDate = String(raw.startDate || "").trim();
  const endDate = String(raw.endDate || "").trim();
  if (!validDate(startDate)) return reject(`data inválida (${raw.startDate})`);
  if (endDate && (!validDate(endDate) || endDate < startDate || daysBetween(startDate, endDate) > 14)) return reject(`fim inválido (${raw.endDate})`);
  // O site mostra o ano todo: o que já passou neste ano entra; de anos anteriores, não.
  if ((endDate || startDate) < `${today.slice(0, 4)}-01-01`) return reject("é de ano anterior");
  if (daysBetween(today, startDate) > 730) return reject("data mais de 2 anos à frente");
  const name = String(raw.name || "").replace(/\s+/g, " ").trim();
  if (name.length < 3) return reject("sem nome");

  // Só vale link que está na página (ou a própria página): nada de URL inventada.
  const known = new Set(page.hrefs.map(urlKey));
  const links = {};
  for (const key of linkKeys) {
    const value = String(raw.links?.[key] || "").trim();
    if (value && /^https?:\/\//.test(value) && known.has(urlKey(value))) links[key] = value;
  }
  if (!links.tickets && ticketHosts.test(hostOf(page.url))) links.tickets = page.url;

  // A data tem de aparecer na página: o trecho citado pelo modelo precisa existir
  // lá, ter o dia de início e não ser prazo de ingresso ("valor especial até 06/05").
  // Nada disso descarta o evento: vira um ⚠️ no PR.
  const evidence = String(raw.evidence || "").trim();
  const startDay = Number(startDate.slice(8));
  let warning = null;
  if (!quotedIn(page, evidence)) warning = "trecho não achado na página";
  else if (!new RegExp(`(^|\\D)0?${startDay}(\\D|$)`).test(evidence)) warning = "o trecho não mostra o dia do evento";
  else if (deadlineWords.test(normalize(evidence))) warning = "o trecho parece prazo de ingresso, não a data do evento";

  const event = {
    name,
    calendarLabel: String(raw.calendarLabel || name).trim().slice(0, 24),
    type: raw.type,
    city: city[0],
    state: uf,
    lat: city[1],
    lon: city[2]
  };
  if (raw.venue && String(raw.venue).trim()) event.venue = String(raw.venue).trim();
  event.startDate = startDate;
  if (endDate && endDate !== startDate) event.endDate = endDate;
  event.description = String(raw.description || "").trim();
  if (Object.keys(links).length) event.links = links;
  return { event, verified: !warning, warning, evidence, source: page.url };
}

// Nome sem ano, sem acento e sem palavras genéricas: "Security BSides Curitiba
// 2026" e "BSides Curitiba" viram o mesmo conjunto {bsides, curitiba}.
const genericWords = new Set(["security", "conference", "conferencia", "congresso", "evento", "edicao", "the", "of", "de", "da", "do", "das", "dos", "e", "em", "and", "brasil", "brazil"]);
const nameTokens = (name, drop) => new Set(normalize(name).split(" ").filter((word) => word && !genericWords.has(word) && !drop?.has(word) && !/^\d+$/.test(word) && !/^(19|20)\d\d$/.test(word)));
// Palavra igual, ou uma começando pela outra: "BSidesSP" casa com "BSides".
const matches = (word, other) => word === other || (Math.min(word.length, other.length) >= 5 && (word.startsWith(other) || other.startsWith(word)));
const similarity = (a, b, drop) => {
  const x = nameTokens(a, drop);
  const y = [...nameTokens(b, drop)];
  if (!x.size || !y.length) return 0;
  let shared = 0;
  x.forEach((word) => { if (y.some((other) => matches(word, other))) shared++; });
  return shared / (x.size + y.length - shared);
};

// Mesmo evento: mesma UF e (mesmo dia, ou nome parecido com até 45 dias de
// diferença). Edição do ano seguinte, a ~1 ano de distância, conta como nova.
// O nome da cidade não conta: "Security Leaders Rio de Janeiro" e "BSides Rio de
// Janeiro" não são o mesmo evento.
export const sameEvent = (a, b) => {
  if (a.state !== b.state) return false;
  const cityWords = new Set([a.city, b.city].flatMap((city) => normalize(city || "").split(" ")));
  const score = similarity(a.name, b.name, cityWords);
  if (a.startDate === b.startDate && score > 0) return true;
  return score >= 0.5 && Math.abs(daysBetween(a.startDate, b.startDate)) <= 45;
};

export const isIgnored = (candidate, ignore) => {
  if ((ignore.urls || []).some((url) => urlKey(url) === urlKey(candidate.source))) return true;
  return (ignore.names || []).some((name) => slugify(name) === slugify(candidate.event.name) || similarity(name, candidate.event.name) >= 0.8);
};

// O que mudou num evento que já está no mapa (data ou cidade).
export const differences = (current, found) => ["startDate", "endDate", "city"]
  .filter((key) => (current[key] || "") !== (found[key] || ""))
  .map((key) => ({ key, current: current[key] || "—", found: found[key] || "—" }));

export const mergeEvents = (existing, additions) => [...existing, ...additions]
  .sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"));

// Mesmo formato do arquivo à mão: 2 espaços e quebra de linha no fim.
export const serializeEvents = (data) => `${JSON.stringify(data, null, 2)}\n`;
