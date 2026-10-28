// Baixa uma página e separa o que interessa ao extrator: texto, links e dados
// estruturados (JSON-LD de Event e o JSON que a Sympla embute na página).
import { decodeEntities, htmlToText } from "./text.mjs";

const userAgent = "Mozilla/5.0 (compatible; CyberMapBot/1.0; coletor de eventos do Cyber Map)";

export async function fetchPage(url, { timeoutMs = 20000, maxChars = 3_000_000 } = {}) {
  const response = await fetch(url, {
    headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml", "accept-language": "pt-BR,pt;q=0.9,en;q=0.5" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (type && !/html|xml/i.test(type)) throw new Error(`não é HTML (${type})`);
  const html = (await response.text()).slice(0, maxChars);
  // A Even3 responde sem content-type: aí vale o começo do corpo.
  if (!type && !/^[\s﻿]*(<!doctype html|<html|<!--)/i.test(html.slice(0, 2000))) throw new Error("não é HTML (sem content-type)");
  return parsePage(html, response.url || url);
}

const attributes = (tag) => {
  const found = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) found[match[1].toLowerCase()] = decodeEntities(match[3] ?? match[4] ?? "");
  return found;
};

const asText = (value) => (typeof value === "string" ? value : Array.isArray(value) ? asText(value[0]) : value?.name || "");
const clip = (value, size) => (value && value.length > size ? `${value.slice(0, size)}…` : value || "");

// Event do schema.org, achatado no formato que o prompt mostra.
const fromSchemaEvent = (node) => {
  const location = Array.isArray(node.location) ? node.location[0] : node.location || {};
  const address = typeof location.address === "object" ? location.address : {};
  return {
    name: asText(node.name),
    startDate: node.startDate || "",
    endDate: node.endDate || "",
    url: asText(node.url),
    attendanceMode: asText(node.eventAttendanceMode).replace(/^.*\//, ""),
    status: asText(node.eventStatus).replace(/^.*\//, ""),
    venue: asText(location.name),
    city: asText(address.addressLocality) || (typeof location.address === "string" ? location.address : ""),
    region: asText(address.addressRegion),
    country: asText(address.addressCountry),
    description: clip(asText(node.description), 300)
  };
};

const collectEvents = (node, out) => {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((item) => collectEvents(item, out)); return; }
  const type = [].concat(node["@type"] || []).join(" ");
  if (/Event\b/.test(type) && node.startDate) out.push(fromSchemaEvent(node));
  ["@graph", "itemListElement", "item", "subEvent"].forEach((key) => collectEvents(node[key], out));
};

export function parsePage(html, url) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const meta = (name) => metas.find((item) => item.property === name || item.name === name)?.content || "";
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();

  const structured = [];
  for (const match of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectEvents(JSON.parse(match[1]), structured); } catch { /* JSON-LD quebrado: o texto da página ainda serve */ }
  }
  // A Sympla não usa JSON-LD, mas embute {"name":…,"startDate":…,"endDate":…} no HTML.
  for (const match of html.matchAll(/"name":"((?:[^"\\]|\\.){3,200})","startDate":"(\d{4}-\d{2}-\d{2}[^"]*)","endDate":"(\d{4}-\d{2}-\d{2}[^"]*)"/g)) {
    try {
      structured.push({ name: JSON.parse(`"${match[1]}"`), startDate: match[2], endDate: match[3], url });
    } catch { /* escape inválido: ignora este trecho */ }
  }

  const hrefs = new Set([url]);
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const raw = decodeEntities(match[2] ?? match[3] ?? "").trim();
    if (!raw || raw.startsWith("#") || /^(mailto|tel|javascript):/i.test(raw)) continue;
    try {
      const absolute = new URL(raw, url);
      if (/^https?:$/.test(absolute.protocol)) hrefs.add(absolute.href);
    } catch { /* href inválido */ }
  }

  return {
    url,
    title: meta("og:title") || title,
    description: meta("og:description") || meta("description"),
    structured,
    hrefs: [...hrefs],
    text: htmlToText(html.replace(/^[\s\S]*?<body\b[^>]*>/i, ""))
  };
}
