// Utilitários de texto do coletor.

export const stripAccents = (value) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
// Mesmo slug do site (js/cyber-map.js), para os eventos casarem pelo nome.
export const slugify = (value) => stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const normalize = (value) => stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Muito site brasileiro escreve "mar&ccedil;o": além das básicas, vai o Latin-1
// inteiro (U+00A0 a U+00FF, na ordem) e a pontuação tipográfica mais comum.
const latin1 = "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml";
const namedEntities = {
  ...Object.fromEntries(latin1.split(" ").map((name, index) => [name, String.fromCodePoint(0xa0 + index)])),
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„",
  bull: "•", hellip: "…", euro: "€", trade: "™"
};
// Nomes diferenciam maiúsculas (&Atilde; ≠ &atilde;); &AMP; e afins caem no minúsculo.
export const decodeEntities = (value) => value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, code) => {
  if (code[0] !== "#") return namedEntities[code] ?? namedEntities[code.toLowerCase()] ?? match;
  const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
  return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
});

// Texto legível de uma página: sem scripts e estilos, uma linha por bloco.
export const htmlToText = (html) => decodeEntities(html
  .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/header|\/footer|\/dd|\/dt|\/time)\b[^>]*>/gi, "\n")
  .replace(/<[^>]+>/g, " "))
  .split("\n")
  .map((line) => line.replace(/\s+/g, " ").trim())
  .filter(Boolean)
  .join("\n");

// URL comparável: sem fragmento, sem barra final, host em minúsculas.
export const urlKey = (value) => {
  try {
    const url = new URL(value);
    url.hash = "";
    return `${url.protocol}//${url.host.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  } catch {
    return null;
  }
};
export const hostOf = (value) => {
  try { return new URL(value).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
};
