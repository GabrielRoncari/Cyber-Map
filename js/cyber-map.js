(() => {
  // Formulário de issue do repositório (.github/ISSUE_TEMPLATE/sugerir-evento.yml).
  const SUGGEST_URL = "https://github.com/GabrielRoncari/Cyber-Map/issues/new?template=sugerir-evento.yml";
  // Os dois interruptores do design (props showGraticule e showUfLabels).
  const SHOW_GRATICULE = true;
  const SHOW_UF_LABELS = true;

  const mapAsset = "images/brazil.svg";
  const svgNS = "http://www.w3.org/2000/svg";
  // brazil.svg vem com "0 0 613 639"; a margem extra dá espaço para os rótulos
  // da grade e para pinos e rótulos do litoral.
  const VB = [-30, -40, 676, 700];
  const zoomPadding = 36;
  const maxZoom = 4.2;
  // Ponto da sigla de cada UF em coordenadas de brazil.svg: o "pole of
  // inaccessibility" do maior polígono do estado (handoff-cybermap/uf-labels.json).
  // DF não tem sigla: é pequeno demais e o pino de Brasília fica ali.
  const ufLabels = {
    ac: [70.5, 235.8], al: [585.3, 234.6], ap: [347.0, 62.3], am: [133.9, 144.9], ba: [504.4, 272.7],
    ce: [539.8, 159.0], es: [525.6, 382.3], go: [373.2, 344.8], ma: [445.9, 163.9], mt: [289.1, 292.1],
    ms: [296.2, 400.1], mg: [465.8, 361.9], pa: [320.3, 170.7], pb: [594.2, 192.1], pr: [342.5, 475.1],
    pe: [532.8, 206.9], pi: [487.8, 207.7], rj: [505.0, 427.0], rn: [595.1, 171.4], rs: [318.6, 562.1],
    ro: [166.0, 248.2], rr: [196.1, 39.9], sc: [376.6, 523.0], sp: [397.0, 431.8], se: [572.5, 243.4],
    to: [399.5, 248.1]
  };
  const gridLat = [[0, "0° EQUADOR"], [-10, "10°S"], [-20, "20°S"], [-30, "30°S"]];
  const gridLon = [[-70, "70°W"], [-60, "60°W"], [-50, "50°W"], [-40, "40°W"]];
  const tropicLat = -23.44;

  const $ = (selector) => document.querySelector(selector);
  const mapCard = $("#map-card");
  const mapHost = $("#brazil-map");
  const mapStatusText = $("#map-status-text");
  const mapRetry = $("#map-retry");
  const mapHint = $("#map-hint");
  const mapBack = $("#map-back");
  const mapStateLabel = $("#map-state-label");
  const readout = $("#map-readout");
  const readoutCode = $("#map-readout-code");
  const readoutText = $("#map-readout-text");
  const panelKicker = $("#panel-kicker");
  const panelTitle = $("#panel-title");
  const panelClear = $("#panel-clear");
  const tabUp = $("#tab-up");
  const tabPast = $("#tab-past");
  const list = $("#event-list");
  const calTitle = $("#cal-title");
  const calWeeks = $("#cal-weeks");
  const calHint = $("#cal-hint");
  const calState = $("#cal-state");
  const calStateBtn = $("#cal-state-btn");
  const calStateMenu = $("#cal-state-menu");
  const calStateText = $("#cal-state-text");
  const calAll = $("#cal-all");
  const calMine = $("#cal-mine");
  const calExport = $("#cal-export");
  const modal = $("#event-modal");
  const mapPop = $("#map-pop");

  const typeLabels = { conference: "Conferência", ctf: "CTF", meetup: "Meetup", workshop: "Workshop" };
  // Nome completo mais a preposição que ele pede: "no Paraná" / "em Goiás".
  const states = {
    ac: ["Acre", "no"], al: ["Alagoas", "em"], ap: ["Amapá", "no"], am: ["Amazonas", "no"],
    ba: ["Bahia", "na"], ce: ["Ceará", "no"], df: ["Distrito Federal", "no"], es: ["Espírito Santo", "no"],
    go: ["Goiás", "em"], ma: ["Maranhão", "no"], mt: ["Mato Grosso", "em"], ms: ["Mato Grosso do Sul", "em"],
    mg: ["Minas Gerais", "em"], pa: ["Pará", "no"], pb: ["Paraíba", "na"], pr: ["Paraná", "no"],
    pe: ["Pernambuco", "em"], pi: ["Piauí", "no"], rj: ["Rio de Janeiro", "no"], rn: ["Rio Grande do Norte", "no"],
    rs: ["Rio Grande do Sul", "no"], ro: ["Rondônia", "em"], rr: ["Roraima", "em"], sc: ["Santa Catarina", "em"],
    sp: ["São Paulo", "em"], se: ["Sergipe", "em"], to: ["Tocantins", "no"]
  };
  const stateName = (uf) => states[uf]?.[0] || uf?.toUpperCase() || "";
  const stateIn = (uf) => (states[uf] ? `${states[uf][1]} ${states[uf][0]}` : `em ${uf?.toUpperCase()}`);
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  // Na ordem do design: os dois links que as pessoas vieram buscar ficam primeiro.
  const linkLabels = {
    site: "Site oficial", tickets: "Ingressos", cfp: "Chamada de palestras",
    instagram: "Instagram", twitter: "X / Twitter", bluesky: "Bluesky", mastodon: "Mastodon",
    facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube", discord: "Discord",
    telegram: "Telegram", github: "GitHub"
  };
  const primaryLinks = new Set(["site", "tickets"]);

  const setText = (node, text) => { if (node.textContent !== String(text)) node.textContent = text; };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const countLabel = (count) => (count === 0 ? "nenhum evento" : `${count} ${count === 1 ? "evento" : "eventos"}`);
  const today = () => new Date().toLocaleDateString("en-CA");
  // Um evento continua "próximo" até o último dia; datas ISO comparam como texto.
  const isPast = (event) => (event.endDate || event.startDate || "9999-12-31") < today();
  // O design fixava 2026; aqui o ano é o do navegador, para a página não envelhecer.
  const year = today().slice(0, 4);
  const inYear = (event) => Boolean(event.startDate) && event.startDate.slice(0, 4) <= year && (event.endDate || event.startDate).slice(0, 4) >= year;

  const pad2 = (n) => String(n).padStart(2, "0");
  const dateParts = (iso) => iso.split("-").map(Number);
  const utc = (iso) => { const [y, m, d] = dateParts(iso); return Date.UTC(y, m - 1, d); };
  const daysUntil = (iso) => Math.round((utc(iso) - utc(today())) / 864e5);
  // "15–17 set 2026", "28 mar 2026", "30 set – 2 out 2026".
  const formatDates = ({ startDate, endDate }) => {
    if (!startDate) return "Data a confirmar";
    const [y, m, d] = dateParts(startDate);
    if (!endDate || endDate === startDate) return `${d} ${months[m - 1]} ${y}`;
    const [y2, m2, d2] = dateParts(endDate);
    if (y === y2 && m === m2) return `${d}–${d2} ${months[m - 1]} ${y}`;
    return `${d} ${months[m - 1]} – ${d2} ${months[m2 - 1]} ${y2}`;
  };
  const dayLabel = ({ startDate, endDate }) => {
    if (!startDate) return "—";
    const [, m, d] = dateParts(startDate);
    if (!endDate || endDate === startDate) return pad2(d);
    const [, m2, d2] = dateParts(endDate);
    return m === m2 ? `${pad2(d)}–${pad2(d2)}` : pad2(d);
  };
  const shortDate = (iso) => { const [, m, d] = dateParts(iso); return `${pad2(d)} ${months[m - 1].toUpperCase()}`; };

  const slugify = (text) => String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const eventSlug = (event) => event.id || slugify(event.name);
  // Tira o ano e as palavras de ligação, para "Latinoware 2026" virar LA e não L2.
  const skipWords = new Set(["de", "da", "do", "das", "dos", "the", "of", "and", "e", "em", "no", "na"]);
  const initials = (name) => {
    const words = String(name).split(/\s+/).filter((word) => /[A-Za-zÀ-ÿ]/.test(word) && !skipWords.has(word.toLowerCase()));
    if (!words.length) return "?";
    const picked = words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join("") : words[0].slice(0, 2);
    return picked.toUpperCase();
  };
  const logoInner = (event, size) => (event.logo
    ? `<img src="${escapeHtml(event.logo)}" alt="" width="${size}" height="${size}" loading="lazy">`
    : `<span aria-hidden="true">${escapeHtml(initials(event.name))}</span>`);
  const logoMarkup = (event, size) => `<div class="logo logo-${size}">${logoInner(event, size)}</div>`;
  const placeShort = (event) => [event.city, event.uf.toUpperCase()].filter(Boolean).join(" · ") || "Local a confirmar";
  const placeLong = (event) => {
    const state = stateName(event.uf);
    // Capitais com o nome do estado: "São Paulo · São Paulo" parece erro.
    const parts = event.city === state ? [event.city] : [event.city, state];
    return parts.filter(Boolean).join(" · ") || "Local a confirmar";
  };
  const typeAndDates = (event) => [typeLabels[event.type] || event.type, formatDates(event)].filter(Boolean).join(" · ");
  const venueIcon = `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 12.6s4.2-3.9 4.2-7.1A4.2 4.2 0 0 0 2.8 5.5c0 3.2 4.2 7.1 4.2 7.1z"></path><circle cx="7" cy="5.5" r="1.5"></circle></svg>`;

  // Todos os eventos do JSON, em ordem de data.
  let allEvents = [];
  // O que a página mostra: o que ainda vai rolar mais o que já rolou neste ano.
  let shown = [];
  let counts = {};
  const view = { sel: null, tab: "up", hoverState: null, hoverPin: null, hoverEvent: null };

  /* ---------- Hash ---------- */

  // replaceState, não location.hash: a URL continua compartilhável sem empilhar
  // histórico nem voltar pelo nosso próprio hashchange.
  // Dois formatos: "#pr" para o filtro, "#pr/e/bsides-curitiba-2026" (ou "#e/…")
  // para um evento aberto. Qualquer outro hash (#mapa, #calendario) fica como está.
  const parseHash = () => {
    const hash = location.hash.replace(/^#/, "").toLowerCase();
    if (!hash) return { state: null, event: null, known: true };
    const match = hash.match(/^(?:([a-z]{2})?(?:\/)?)?(?:e\/(.+))?$/);
    if (!match || (!match[1] && !match[2])) return { state: null, event: null, known: false };
    return { state: states[match[1]] ? match[1] : null, event: match[2] || null, known: true };
  };
  const syncHash = (state, event = null) => {
    const fragment = [state, event && `e/${event}`].filter(Boolean).join("/");
    if (!fragment && !parseHash().known) return;
    const target = fragment ? `#${fragment}` : location.pathname + location.search;
    if (fragment ? location.hash === `#${fragment}` : !location.hash) return;
    history.replaceState(null, "", target);
  };

  /* ---------- Mapa ---------- */

  let mapRoot = null;
  let zoomLayer = null;
  let selOutline = null;
  let hoverOutline = null;
  let hotLayer = null;
  let statePaths = {};
  let overlayItems = [];
  let ufItems = [];
  let pins = [];
  let pinLayer = null;
  let groups = new Map();
  let lastCam = null;
  const hotCopies = new Map();

  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };
  // Ajuste equiretangular de images/brazil.svg (viewBox 613x639) por mínimos
  // quadrados sobre os limites de lon/lat de 26 estados contra as caixas dos paths.
  // Validado nas 27 capitais: 17 caem dentro do estado, as outras 10 são litorâneas
  // e erram por 0.5-2.5px, o que o snapIntoState absorve. Recalibrar se o SVG mudar.
  const projX = (lon) => 15.906532 * lon + 1166.129578;
  const projY = (lat) => -16.262796 * lat + 76.942006;
  const projectCity = (lat, lon) => ({ x: projX(lon), y: projY(lat) });
  // O contorno é simplificado, então uma cidade do litoral pode cair no mar.
  // Anda para fora até o ponto ficar dentro do estado a que ele pertence.
  const snapIntoState = (path, x, y) => {
    if (!mapRoot?.createSVGPoint || typeof path.isPointInFill !== "function") return { x, y };
    const point = mapRoot.createSVGPoint();
    const inside = (px, py) => { point.x = px; point.y = py; return path.isPointInFill(point); };
    if (inside(x, y)) return { x, y };
    for (let radius = 0.5; radius <= 14; radius += 0.5) {
      for (let angle = 0; angle < 360; angle += 10) {
        const nx = x + radius * Math.cos(angle * Math.PI / 180);
        const ny = y + radius * Math.sin(angle * Math.PI / 180);
        if (inside(nx, ny)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  };

  // Câmera: centraliza o estado selecionado e amplia até ele encher o quadro.
  const camera = () => {
    const target = view.sel && statePaths[view.sel];
    if (!target) return { s: 1, tx: 0, ty: 0 };
    const box = target.getBBox();
    const s = Math.min(VB[2] / (box.width + zoomPadding * 2), VB[3] / (box.height + zoomPadding * 2), maxZoom);
    return {
      s,
      tx: VB[0] + VB[2] / 2 - (box.x + box.width / 2) * s,
      ty: VB[1] + VB[3] / 2 - (box.y + box.height / 2) * s
    };
  };

  const hoverOn = (key, value) => {
    if (view[key] === value) return;
    view[key] = value;
    renderHot();
  };
  const hoverOff = (key, value) => {
    if (view[key] !== value) return;
    view[key] = null;
    renderHot();
  };
  const onActivate = (node, action) => {
    node.addEventListener("click", action);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); action(event); }
    });
  };
  const onHover = (node, key, value) => {
    ["mouseenter", "focus"].forEach((type) => node.addEventListener(type, () => hoverOn(key, value)));
    ["mouseleave", "blur"].forEach((type) => node.addEventListener(type, () => hoverOff(key, value)));
  };

  const buildGraticule = (zoom, overlay) => {
    const lines = svg("g", { class: "map-grid" });
    gridLat.forEach(([lat]) => lines.append(svg("line", { x1: -400, y1: projY(lat).toFixed(1), x2: 1100, y2: projY(lat).toFixed(1) })));
    gridLon.forEach(([lon]) => lines.append(svg("line", { x1: projX(lon).toFixed(1), y1: -400, x2: projX(lon).toFixed(1), y2: 1100 })));
    lines.append(svg("line", { class: "map-tropic", x1: -400, y1: projY(tropicLat).toFixed(1), x2: 1100, y2: projY(tropicLat).toFixed(1) }));
    zoom.append(lines);

    const labels = svg("g", { "aria-hidden": "true" });
    const spots = [
      ...gridLat.map(([lat, text]) => [text, -26, projY(lat) - 4]),
      ...gridLon.map(([lon, text]) => [text, projX(lon) + 4, 652]),
      ["TRÓPICO DE CAPRICÓRNIO", -26, projY(tropicLat) - 4]
    ];
    spots.forEach(([text, x, y]) => {
      const el = svg("text", { class: "map-grid-label", x: 0, y: 0 });
      el.textContent = text;
      labels.append(el);
      overlayItems.push({ el, x, y });
    });
    overlay.append(labels);
  };

  const buildUfLabels = (overlay) => {
    const labels = svg("g", { "aria-hidden": "true" });
    Object.entries(ufLabels).forEach(([uf, [x, y]]) => {
      const el = svg("text", { class: `map-uf${counts[uf] ? " has-events" : ""}`, x: 0, y: 0 });
      el.textContent = uf.toUpperCase();
      labels.append(el);
      const item = { el, x, y, uf };
      overlayItems.push(item);
      ufItems.push(item);
    });
    overlay.append(labels);
  };

  // Um pino por cidade, só a bolinha. Cidade com um evento mostra o nome ao lado
  // no hover e abre o evento no clique; com vários, o hover abre a lista (mapPop).
  // O evento "principal" é o próximo que vai rolar ou, se todos já passaram, o
  // mais recente: é a prioridade da cidade nos grupos.
  const buildPins = (overlay) => {
    const layer = svg("g", { class: "map-pins" });
    const cities = new Map();
    shown.forEach((event) => {
      const path = statePaths[event.uf];
      if (!path) return;
      const key = `${event.uf}|${event.city}`;
      if (!cities.has(key)) cities.set(key, { key, uf: event.uf, city: event.city, evs: [] });
      cities.get(key).evs.push(event);
    });
    pins = [...cities.values()].map((city) => {
      const path = statePaths[city.uf];
      const box = path.getBBox();
      let at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const located = city.evs.find((event) => Number.isFinite(event.lat) && Number.isFinite(event.lon));
      // O DF é uma cidade desenhada com 15x9px: projetar Brasília joga o pino
      // perto da borda sem ganho nenhum. Ele fica sempre no meio.
      if (city.uf !== "df" && located) {
        const projected = projectCity(located.lat, located.lon);
        at = snapIntoState(path, projected.x, projected.y);
      }
      const upcoming = city.evs.filter((event) => !isPast(event));
      const primary = upcoming[0] || city.evs[city.evs.length - 1];
      const isUp = upcoming.length > 0;
      const multi = city.evs.length > 1;
      // À direita de x = 500 o rótulo vai para a esquerda, para não sair pelo litoral.
      const toLeft = at.x > 500;

      const el = svg("g", { class: `pin${isUp ? " is-up" : ""}` });
      if (isUp) el.append(svg("circle", { class: "pin-pulse", r: 5 }));
      if (multi) el.append(svg("circle", { class: "pin-multi", r: 7.2 }));
      el.append(svg("circle", { class: "pin-dot", r: isUp ? 4.6 : 3.4 }));
      el.append(svg("text", { class: "pin-label", x: toLeft ? -11 : 11, y: 3.6, "text-anchor": toLeft ? "end" : "start" }));
      const hit = svg("circle", { class: "pin-hit", r: 12, tabindex: 0, role: "button" });
      el.append(hit);
      const pin = {
        ...city, el, hit, primary, x: at.x, y: at.y, isUp, date: primary.startDate || "9999",
        events: popOrder(city.evs), cityKeys: [city.key], slugs: city.evs.map((event) => event.slug),
        title: `${city.city} · ${city.uf.toUpperCase()}`
      };
      hit.setAttribute("aria-label", multi ? `${city.city}: ${city.evs.length} eventos. Ver a lista` : `${primary.name}, ${formatDates(primary)}, ${city.city}`);
      if (multi) hit.setAttribute("aria-haspopup", "dialog");
      wireMarker(pin);
      return pin;
    }).sort((a, b) => a.isUp - b.isUp);
    pins.forEach((pin) => { layer.append(pin.el); overlayItems.push(pin); });
    pinLayer = layer;
    overlay.append(layer);
    // Os pinos "quentes" são redesenhados aqui, por cima de tudo, como no design.
    // Copiar em vez de mover o <g> original: mover tiraria o foco do teclado dele
    // e reiniciaria o pulso.
    hotLayer = svg("g", { class: "map-pins-hot", "aria-hidden": "true" });
    overlay.append(hotLayer);
  };

  const wireMap = (text) => {
    mapHost.innerHTML = text;
    mapRoot = mapHost.querySelector("svg");
    if (!mapRoot) throw new Error("map");
    mapRoot.setAttribute("viewBox", VB.join(" "));
    mapRoot.setAttribute("class", "map-svg");
    mapRoot.setAttribute("role", "group");
    mapRoot.setAttribute("aria-label", "Mapa do Brasil por estado. Selecione um estado para filtrar os eventos.");
    const paths = [...mapRoot.querySelectorAll("path")];
    overlayItems = [];
    ufItems = [];
    statePaths = {};
    groups = new Map();
    lastCam = null;

    zoomLayer = svg("g", { class: "map-zoom" });
    const overlay = svg("g", { class: "map-overlay" });
    if (SHOW_GRATICULE) buildGraticule(zoomLayer, overlay);
    const halo = svg("g", { class: "map-halo", "aria-hidden": "true" });
    const statesLayer = svg("g", { class: "map-states" });
    paths.forEach((path) => {
      halo.append(svg("path", { d: path.getAttribute("d") }));
      statePaths[path.id] = path;
      path.setAttribute("class", "map-state");
      path.setAttribute("tabindex", "0");
      path.setAttribute("role", "button");
      path.dataset.n = String(Math.min(counts[path.id] || 0, 2));
      statesLayer.append(path);
      onActivate(path, () => select(path.id));
      onHover(path, "hoverState", path.id);
    });
    // Cópias por cima: a borda do path original fica coberta pelos vizinhos.
    selOutline = svg("path", { class: "map-outline map-outline-sel", display: "none" });
    hoverOutline = svg("path", { class: "map-outline map-outline-hover", display: "none" });
    zoomLayer.append(halo, statesLayer, selOutline, hoverOutline);
    mapRoot.replaceChildren(zoomLayer, overlay);

    if (SHOW_UF_LABELS) buildUfLabels(overlay);
    buildPins(overlay);
    mapCard.dataset.map = "ready";
    renderMap();
    renderHot();
  };

  const setOutline = (outline, uf) => {
    const path = uf && statePaths[uf];
    if (path) outline.setAttribute("d", path.getAttribute("d"));
    outline.setAttribute("display", path ? "inline" : "none");
  };

  // Bolinhas que ficariam a menos de 16px uma da outra na tela (Grande São Paulo,
  // Santos e Guarujá) viram um marcador só, com o número de eventos. Refeito a
  // cada câmera: com zoom no estado, o grupo se desfaz no que já cabe separado.
  // Com um estado selecionado, só os pinos dele se agrupam.
  const byPriority = (a, b) => (b.isUp - a.isUp) || (a.isUp ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const translate = (x, y, cam) => `translate(${(x * cam.s + cam.tx).toFixed(2)}px, ${(y * cam.s + cam.ty).toFixed(2)}px)`;

  const buildGroup = (key, members, cam) => {
    // O grupo fica na cidade com mais eventos e leva o nome dela ("São Paulo e região").
    const anchor = [...members].sort((a, b) => b.evs.length - a.evs.length)[0];
    const events = popOrder(members.flatMap((pin) => pin.evs));
    const isUp = members.some((pin) => pin.isUp);
    const sameUf = members.every((pin) => pin.uf === anchor.uf);
    const title = sameUf ? `${anchor.city} e região · ${anchor.uf.toUpperCase()}` : `${members.length} cidades`;
    const el = svg("g", { class: `pin pin-group${isUp ? " is-up" : ""}` });
    if (isUp) el.append(svg("circle", { class: "pin-pulse", r: 7 }));
    el.append(svg("circle", { class: "group-ring", r: 13 }), svg("circle", { class: "group-dot", r: 9 }));
    const count = svg("text", { class: "group-count", y: 3.3, "text-anchor": "middle" });
    count.textContent = events.length;
    const hit = svg("circle", {
      class: "pin-hit", r: 14, tabindex: 0, role: "button", "aria-haspopup": "dialog", "aria-expanded": "false",
      "aria-label": `${title}: ${events.length} eventos em ${members.length} cidades. Ver a lista`
    });
    el.append(count, hit);
    // Entra onde a câmera estava, para acompanhar o zoom em vez de pular.
    el.style.transform = translate(anchor.x, anchor.y, lastCam || cam);
    pinLayer.append(el);
    const group = { key, el, hit, members, events, title, x: anchor.x, y: anchor.y, cityKeys: members.map((pin) => pin.key), slugs: events.map((event) => event.slug) };
    wireMarker(group);
    return group;
  };

  const regroup = (cam) => {
    const pxPerUnit = mapRoot.getScreenCTM()?.a || mapRoot.getBoundingClientRect().width / VB[2] || 1;
    const gap = 16 / pxPerUnit;
    const found = [];
    pins.filter((pin) => !view.sel || pin.uf === view.sel).sort(byPriority).forEach((pin) => {
      const px = pin.x * cam.s + cam.tx;
      const py = pin.y * cam.s + cam.ty;
      const near = found.find((group) => Math.hypot(group.px - px, group.py - py) < gap);
      if (near) near.members.push(pin);
      else found.push({ px, py, members: [pin] });
    });
    const next = new Map();
    found.filter((group) => group.members.length > 1).forEach((group) => {
      const key = `g:${group.members.map((pin) => pin.key).sort().join("+")}`;
      next.set(key, groups.get(key) || buildGroup(key, group.members, cam));
    });
    groups.forEach((group, key) => { if (!next.has(key)) group.el.remove(); });
    groups = next;
    const grouped = new Set([...groups.values()].flatMap((group) => group.members));
    pins.forEach((pin) => {
      const hidden = grouped.has(pin);
      pin.el.classList.toggle("is-grouped", hidden);
      pin.hit.setAttribute("tabindex", hidden ? "-1" : "0");
      pin.hit.setAttribute("aria-hidden", String(hidden));
    });
  };

  const renderMap = () => {
    const { sel } = view;
    closePop();
    mapHint.hidden = Boolean(sel);
    mapBack.hidden = !sel;
    mapStateLabel.hidden = !sel;
    mapStateLabel.textContent = sel ? `${stateName(sel)} · ${countLabel(counts[sel] || 0)} em ${year}` : "";
    if (!mapRoot) return;
    const { s, tx, ty } = camera();
    zoomLayer.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(4)})`;
    // A camada de cima não escala: cada item só acompanha a posição, então pinos
    // e siglas mantêm o tamanho durante o zoom.
    overlayItems.forEach((item) => {
      item.el.style.transform = `translate(${(item.x * s + tx).toFixed(2)}px, ${(item.y * s + ty).toFixed(2)}px)`;
    });
    mapRoot.classList.toggle("has-sel", Boolean(sel));
    Object.entries(statePaths).forEach(([uf, path]) => {
      path.classList.toggle("is-sel", uf === sel);
      path.setAttribute("aria-label", `${stateName(uf)}: ${countLabel(counts[uf] || 0)} em ${year}${uf === sel ? " (selecionado)" : ""}`);
    });
    setOutline(selOutline, sel);
    ufItems.forEach((item) => item.el.classList.toggle("is-sel", item.uf === sel));
    pins.forEach((pin) => pin.el.classList.toggle("is-dim", Boolean(sel) && pin.uf !== sel));
    const cam = { s, tx, ty };
    regroup(cam);
    // Os grupos novos nasceram na posição da câmera anterior: o reflow fixa essa
    // posição antes de mandar para a nova, e a transição faz o resto.
    mapRoot.getBoundingClientRect();
    groups.forEach((group) => { group.el.style.transform = translate(group.x, group.y, cam); });
    lastCam = cam;
    hotCopies.forEach((copy, key) => { copy.style.transform = pins.find((pin) => pin.key === key).el.style.transform; });
  };

  const hotCopy = (pin) => {
    const copy = pin.el.cloneNode(true);
    copy.querySelectorAll(".pin-pulse, .pin-hit").forEach((node) => node.remove());
    copy.classList.remove("is-dim", "is-grouped");
    copy.classList.add("is-hot");
    copy.prepend(svg("circle", { class: "pin-ring", r: 10.5 }));
    return copy;
  };
  const markerByKey = (key) => (key ? pins.find((pin) => pin.key === key) || groups.get(key) : null);

  // Hover cruzado: estado, pino, card, destaque e calendário se acendem juntos.
  const renderHot = () => {
    const { sel, hoverState, hoverPin, hoverEvent } = view;
    const hotCities = new Set(markerByKey(hoverPin)?.cityKeys || []);
    document.querySelectorAll("[data-hover]").forEach((node) => {
      node.classList.toggle("is-hot", node.dataset.hover === hoverEvent || hotCities.has(node.dataset.city));
    });
    if (!mapRoot) return;
    Object.entries(statePaths).forEach(([uf, path]) => path.classList.toggle("is-hover", uf === hoverState));
    setOutline(hoverOutline, hoverState !== sel ? hoverState : null);

    // Pino solto: redesenhado por cima, com anel. O nome aparece ao lado quando é
    // um evento só (no hover direto num pino com vários, quem mostra é a lista).
    pins.forEach((pin) => {
      const viaEvent = Boolean(hoverEvent) && pin.slugs.includes(hoverEvent);
      const hot = !pin.el.classList.contains("is-grouped") && (pin.key === hoverPin || viaEvent);
      let copy = hotCopies.get(pin.key);
      if (!hot) {
        copy?.remove();
        hotCopies.delete(pin.key);
        return;
      }
      if (!copy) {
        copy = hotCopy(pin);
        hotCopies.set(pin.key, copy);
        hotLayer.append(copy);
      }
      const named = viaEvent ? findEvent(hoverEvent) : (pin.evs.length === 1 ? pin.primary : null);
      copy.classList.toggle("show-label", Boolean(named));
      if (named) setText(copy.querySelector(".pin-label"), named.startDate ? `${named.label} · ${shortDate(named.startDate)}` : named.label);
    });
    groups.forEach((group) => group.el.classList.toggle("is-hot", group.key === hoverPin || (Boolean(hoverEvent) && group.slugs.includes(hoverEvent))));

    readout.hidden = !hoverState;
    setText(readoutCode, hoverState ? hoverState.toUpperCase() : "");
    setText(readoutText, hoverState ? `${stateName(hoverState)} · ${countLabel(counts[hoverState] || 0)} em ${year}` : "");
  };

  /* ---------- Lista do mapa (pino com vários eventos ou grupo) ---------- */

  // Próximos primeiro, do mais perto ao mais longe; depois os que já rolaram,
  // do mais recente para trás.
  function popOrder(events) {
    const upcoming = events.filter((event) => !isPast(event)).sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"));
    const past = events.filter(isPast).sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
    return [...upcoming, ...past];
  }

  const popState = { marker: null, pinned: false, timer: 0, quiet: false };
  // Devolver o foco à bolinha (Esc, modal fechado) não pode reabrir a lista.
  const focusQuietly = (node) => {
    popState.quiet = true;
    node?.focus();
    popState.quiet = false;
  };
  const popItem = (event, withCity) => `<li><button type="button" class="pop-ev${isPast(event) ? " is-past" : ""}" data-open="${escapeHtml(event.slug)}" data-hover="${escapeHtml(event.slug)}" data-city="${escapeHtml(event.cityKey)}">
      <span class="pop-dot" aria-hidden="true"></span><span class="pop-name">${escapeHtml(event.label)}</span><span class="pop-date">${event.startDate ? escapeHtml(shortDate(event.startDate)) : ""}</span>
      ${withCity ? `<span class="pop-city">${escapeHtml(event.city)}</span>` : ""}<span class="sr-only">, ${escapeHtml(formatDates(event))}</span>
    </button></li>`;

  const placePop = (marker) => {
    const ctm = mapRoot?.getScreenCTM();
    if (!ctm || !lastCam) return;
    const point = mapRoot.createSVGPoint();
    point.x = marker.x * lastCam.s + lastCam.tx;
    point.y = marker.y * lastCam.s + lastCam.ty;
    const at = point.matrixTransform(ctm);
    const card = mapCard.getBoundingClientRect();
    const x = at.x - card.left;
    const y = at.y - card.top;
    mapPop.style.maxHeight = "";
    const width = mapPop.offsetWidth;
    let height = mapPop.offsetHeight;
    // À direita da bolinha; sem espaço, à esquerda; no celular, onde nenhum lado
    // cabe, embaixo ou em cima. Nunca por cima da bolinha (o toque cairia na lista).
    let left;
    let top;
    if (card.width - x - 30 >= width || x - 30 >= width) {
      left = card.width - x - 30 >= width ? x + 20 : x - 20 - width;
      top = Math.max(10, Math.min(y - 28, card.height - height - 10));
    } else {
      const below = card.height - y >= y;
      const room = (below ? card.height - y : y) - 30;
      if (height > room) {
        mapPop.style.maxHeight = `${Math.max(120, room)}px`;
        height = mapPop.offsetHeight;
      }
      left = Math.max(10, Math.min(x - width / 2, card.width - width - 10));
      top = below ? y + 20 : Math.max(10, y - 20 - height);
    }
    mapPop.style.left = `${left}px`;
    mapPop.style.top = `${top}px`;
  };

  function openPop(marker, { pinned = false, focus = false } = {}) {
    clearTimeout(popState.timer);
    if (popState.marker !== marker || mapPop.hidden) {
      popState.marker?.hit.setAttribute("aria-expanded", "false");
      const cities = new Set(marker.events.map((event) => event.cityKey));
      const upcoming = marker.events.filter((event) => !isPast(event)).length;
      const items = marker.events.map((event, index) => {
        const divider = index === upcoming && upcoming > 0 ? '<li class="pop-sep" aria-hidden="true">Já rolou</li>' : "";
        return divider + popItem(event, cities.size > 1);
      }).join("");
      mapPop.innerHTML = `<div class="pop-head"><p class="pop-title" id="map-pop-title">${escapeHtml(marker.title)}</p>
        <p class="pop-sub">${escapeHtml(countLabel(marker.events.length))}${upcoming ? ` · ${upcoming} por vir` : ""}</p></div>
        <ul class="pop-list">${items}</ul>`;
      mapPop.hidden = false;
      mapPop.scrollTop = 0;
      placePop(marker);
      marker.hit.setAttribute("aria-expanded", "true");
      popState.marker = marker;
      popState.pinned = false;
    }
    if (pinned) popState.pinned = true;
    if (focus) mapPop.querySelector("button")?.focus();
  }

  function closePop({ restoreFocus = false } = {}) {
    clearTimeout(popState.timer);
    if (mapPop.hidden) return;
    const { marker } = popState;
    mapPop.hidden = true;
    mapPop.replaceChildren();
    popState.marker = null;
    popState.pinned = false;
    marker?.hit.setAttribute("aria-expanded", "false");
    if (view.hoverEvent) hoverOff("hoverEvent", view.hoverEvent);
    if (restoreFocus) focusQuietly(marker?.hit);
  }
  // Sai do pino ou da lista sem fixar: fecha depois de um respiro, para dar tempo
  // de levar o mouse da bolinha até a lista.
  const closePopSoon = () => {
    if (popState.pinned) return;
    clearTimeout(popState.timer);
    popState.timer = setTimeout(() => closePop(), 220);
  };

  // Pino ou grupo: hover/foco mostra o nome (um evento) ou a lista (vários);
  // clique abre o evento ou fixa a lista com o foco no primeiro item.
  function wireMarker(marker) {
    const many = marker.events.length > 1;
    onActivate(marker.hit, () => {
      if (!many) openEventModal(marker.events[0], marker.hit);
      else if (popState.marker === marker && popState.pinned && !mapPop.hidden) closePop({ restoreFocus: true });
      else openPop(marker, { pinned: true, focus: true });
    });
    const enter = () => {
      hoverOn("hoverPin", marker.key);
      if (many && !popState.quiet) openPop(marker);
    };
    const leave = () => {
      hoverOff("hoverPin", marker.key);
      if (many) closePopSoon();
    };
    marker.hit.addEventListener("mouseenter", enter);
    marker.hit.addEventListener("focus", enter);
    marker.hit.addEventListener("mouseleave", leave);
    marker.hit.addEventListener("blur", leave);
  }

  const setMapStatus = (state) => {
    mapCard.dataset.map = state;
    mapStatusText.textContent = state === "error" ? "Mapa indisponível." : "Carregando mapa…";
    mapRetry.hidden = state !== "error";
  };
  const fetchMap = () => fetch(mapAsset).then((response) => (response.ok ? response.text() : Promise.reject(new Error("map"))));
  const loadMap = async (request = fetchMap()) => {
    setMapStatus("loading");
    try {
      wireMap(await request);
    } catch {
      mapRoot = null;
      mapHost.replaceChildren();
      setMapStatus("error");
    }
  };

  /* ---------- Painel ---------- */

  // Aparece só quando o card tem .is-saved (CSS); o texto oculto vale para leitor de tela.
  const savedMark = `<span class="saved-mark" title="Na minha agenda"><span aria-hidden="true"> ★</span><span class="sr-only"> (na minha agenda)</span></span>`;
  const spotlightMarkup = (event) => {
    const days = event.startDate ? daysUntil(event.startDate) : null;
    const tickets = event.links?.tickets;
    const countdown = days === null ? "" : `<div class="spot-count">
        <span class="spot-num">${days > 0 ? days : "Hoje"}</span>
        <span class="spot-unit">${days > 1 ? "dias" : (days === 1 ? "dia" : "rolando")}</span>
      </div>`;
    return `<article class="spot${saved.has(event.slug) ? " is-saved" : ""}" data-hover="${escapeHtml(event.slug)}" data-city="${escapeHtml(event.cityKey)}">
      <div class="spot-top">
        <p class="spot-kicker"><span class="chip-dot" aria-hidden="true"></span>Próximo evento</p>
        ${countdown}
      </div>
      <div class="spot-main">
        ${logoMarkup(event, 56)}
        <div class="spot-text">
          <h3>${escapeHtml(event.name)}${savedMark}</h3>
          <p>${escapeHtml(formatDates(event))} · ${escapeHtml(placeShort(event))}</p>
        </div>
      </div>
      ${event.venue ? `<p class="venue spot-venue">${venueIcon}${escapeHtml(event.venue)}</p>` : ""}
      <div class="spot-actions">
        <button type="button" class="btn-primary" data-open="${escapeHtml(event.slug)}">Ver detalhes</button>
        ${tickets ? `<a class="btn-ghost" href="${escapeHtml(tickets)}" target="_blank" rel="noopener">Ingressos ↗</a>` : ""}
      </div>
    </article>`;
  };

  const cardMarkup = (event) => {
    const month = event.startDate ? months[dateParts(event.startDate)[1] - 1].toUpperCase() : "";
    return `<article class="card${isPast(event) ? " is-past" : ""}${saved.has(event.slug) ? " is-saved" : ""}" data-hover="${escapeHtml(event.slug)}" data-city="${escapeHtml(event.cityKey)}">
      <div class="card-date" aria-hidden="true"><span class="card-day">${escapeHtml(dayLabel(event))}</span><span class="card-mon">${month}</span></div>
      <div class="card-text">
        <h3><button type="button" class="card-open" data-open="${escapeHtml(event.slug)}">${escapeHtml(event.name)}</button>${savedMark}</h3>
        <p class="card-place">${escapeHtml(placeShort(event))}</p>
        <p class="card-meta">${escapeHtml(typeAndDates(event))}</p>
      </div>
      ${logoMarkup(event, 44)}
    </article>`;
  };

  // Os meses são <section aria-label> com uma linha decorativa, não títulos: os
  // cards já são h3 sob o h2 do painel e cada um diz as próprias datas.
  const groupedMarkup = (items) => items.reduce((groups, event) => {
    const key = event.startDate?.slice(0, 7) || "";
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(event);
    else groups.push({ key, items: [event] });
    return groups;
  }, []).map(({ key, items: group }) => {
    const [y, m] = key ? dateParts(key) : [];
    const label = key ? `${monthNames[m - 1]} ${y}` : "Data a confirmar";
    const aria = key ? `Eventos de ${monthNames[m - 1]} de ${y}` : "Eventos sem data confirmada";
    return `<section class="month" aria-label="${escapeHtml(aria)}"><p class="month-label" aria-hidden="true">${escapeHtml(label)}</p>${group.map(cardMarkup).join("")}</section>`;
  }).join("");

  const emptyMarkup = (onUp, state) => {
    const text = onUp
      ? (state ? `Nenhum evento futuro ${stateIn(state)}.` : "Nenhum evento futuro cadastrado.")
      : (state ? `Nenhum evento passado ${stateIn(state)} em ${year}.` : `Nenhum evento passado em ${year}.`);
    return `<div class="empty">${escapeHtml(text)} Conhece algum? <a href="${escapeHtml(SUGGEST_URL)}">Manda pra gente</a>.</div>`;
  };

  const renderPanel = () => {
    const { sel } = view;
    const pool = shown.filter((event) => !sel || event.uf === sel);
    const upcoming = pool.filter((event) => !isPast(event));
    const past = pool.filter(isPast).reverse();
    const onUp = view.tab === "up";
    // Só reescreve quando muda, para o aria-live não repetir a mesma leitura.
    setText(panelKicker, sel ? `Filtro · ${sel.toUpperCase()}` : `Agenda ${year}`);
    setText(panelTitle, sel ? stateName(sel) : "Todo o Brasil");
    panelClear.hidden = !sel;
    tabUp.setAttribute("aria-pressed", String(onUp));
    tabPast.setAttribute("aria-pressed", String(!onUp));
    $("#tab-up-count").textContent = upcoming.length;
    $("#tab-past-count").textContent = past.length;
    const spot = onUp ? upcoming[0] : null;
    const items = onUp ? upcoming.slice(1) : past;
    list.innerHTML = (spot ? spotlightMarkup(spot) : "")
      + groupedMarkup(items)
      + ((onUp ? upcoming : past).length ? "" : emptyMarkup(onUp, sel));
    list.scrollTop = 0;
  };

  /* ---------- Calendário (mês, no estilo Google Agenda) ---------- */

  // Minha agenda: os eventos que a pessoa marcou, guardados só no navegador dela.
  const savedKey = "cybermap:minha-agenda";
  const saved = (() => {
    try { return new Set(JSON.parse(localStorage.getItem(savedKey) || "[]")); } catch { return new Set(); }
  })();
  const storeSaved = () => {
    try { localStorage.setItem(savedKey, JSON.stringify([...saved])); } catch { /* modo privado: vale só nesta visita */ }
  };

  const isoOf = (time) => new Date(time).toISOString().slice(0, 10);
  const addDays = (iso, days) => isoOf(utc(iso) + days * 864e5);
  const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / 864e5);
  const lastDay = (event) => event.endDate || event.startDate;
  const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  // Feriados nacionais, mais Carnaval e Corpus Christi (pontos facultativos que
  // mexem em viagem). Os móveis saem da Páscoa (algoritmo de Meeus/Jones/Butcher).
  const easter = (y) => {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    return Date.UTC(y, month - 1, ((h + l - 7 * m + 114) % 31) + 1);
  };
  const holidayCache = {};
  const holidays = (y) => {
    if (holidayCache[y]) return holidayCache[y];
    const list = {
      [`${y}-01-01`]: "Ano Novo", [`${y}-04-21`]: "Tiradentes", [`${y}-05-01`]: "Dia do Trabalho",
      [`${y}-09-07`]: "Independência", [`${y}-10-12`]: "N. Sra. Aparecida", [`${y}-11-02`]: "Finados",
      [`${y}-11-15`]: "Proclamação da República", [`${y}-11-20`]: "Consciência Negra", [`${y}-12-25`]: "Natal"
    };
    const at = (offset) => isoOf(easter(y) + offset * 864e5);
    list[at(-48)] = "Carnaval";
    list[at(-47)] = "Carnaval";
    list[at(-2)] = "Sexta-feira Santa";
    list[at(60)] = "Corpus Christi";
    holidayCache[y] = list;
    return list;
  };
  const holidayOf = (iso) => holidays(Number(iso.slice(0, 4)))[iso];

  // O filtro de estado é o mesmo do mapa e da lista (view.sel).
  const cal = { month: today().slice(0, 7), mine: false };
  const calPool = () => allEvents.filter((event) => event.startDate && (!cal.mine || saved.has(event.slug)) && (!view.sel || event.uf === view.sel));

  // Menu de estados (no lugar do <select>, cuja lista aberta não aceita CSS):
  // os estados com evento no calendário, com a contagem, mais o selecionado no
  // mapa (que pode não ter nenhum). Só refaz os botões quando a lista muda.
  const stateOption = (uf, name, total) => `<button type="button" class="cal-state-opt" data-uf="${uf}">
      <span class="cal-state-name">${escapeHtml(name)}</span><span class="cal-state-count" aria-label="${escapeHtml(countLabel(total))}">${total}</span>
    </button>`;
  const syncStateSelect = () => {
    const dated = allEvents.filter((event) => event.startDate);
    const perUf = dated.reduce((acc, event) => ({ ...acc, [event.uf]: (acc[event.uf] || 0) + 1 }), {});
    const ufs = [...new Set([...dated.map((event) => event.uf), view.sel])]
      .filter((uf) => states[uf])
      .sort((a, b) => stateName(a).localeCompare(stateName(b), "pt-BR"));
    if (calStateMenu.dataset.ufs !== ufs.join()) {
      calStateMenu.dataset.ufs = ufs.join();
      calStateMenu.innerHTML = stateOption("", "Todos os estados", dated.length)
        + '<span class="cal-state-sep" aria-hidden="true"></span>'
        + ufs.map((uf) => stateOption(uf, stateName(uf), perUf[uf] || 0)).join("");
    }
    calStateMenu.querySelectorAll("[data-uf]").forEach((option) => {
      if (option.dataset.uf === (view.sel || "")) option.setAttribute("aria-current", "true");
      else option.removeAttribute("aria-current");
    });
    setText(calStateText, view.sel ? stateName(view.sel) : "Todos os estados");
    calState.classList.toggle("is-set", Boolean(view.sel));
  };
  const openStateMenu = () => {
    calStateMenu.hidden = false;
    calStateBtn.setAttribute("aria-expanded", "true");
    // No celular o botão fica no meio da linha: se o menu não couber à direita, abre para a esquerda.
    calStateMenu.classList.remove("is-right");
    if (calStateMenu.getBoundingClientRect().right > document.documentElement.clientWidth - 12) calStateMenu.classList.add("is-right");
    (calStateMenu.querySelector('[aria-current="true"]') || calStateMenu.querySelector("button"))?.focus();
  };
  const closeStateMenu = ({ restoreFocus = false } = {}) => {
    if (calStateMenu.hidden) return;
    calStateMenu.hidden = true;
    calStateBtn.setAttribute("aria-expanded", "false");
    if (restoreFocus) calStateBtn.focus();
  };

  const renderCalendar = () => {
    const [y, m] = dateParts(`${cal.month}-01`);
    const first = `${cal.month}-01`;
    const monthEnd = isoOf(Date.UTC(y, m, 0));
    const offset = new Date(utc(first)).getUTCDay();
    const weeks = Math.ceil((offset + Number(monthEnd.slice(8))) / 7);
    const gridStart = addDays(first, -offset);
    const now = today();
    const pool = calPool();

    setText(calTitle, `${capitalize(monthNames[m - 1])} de ${y}`);
    syncStateSelect();
    calAll.setAttribute("aria-pressed", String(!cal.mine));
    calMine.setAttribute("aria-pressed", String(cal.mine));
    $("#cal-mine-count").textContent = saved.size;
    const exportable = cal.mine ? pool : pool.filter((event) => !isPast(event));
    const where = view.sel ? ` ${stateIn(view.sel)}` : "";
    calExport.disabled = !exportable.length;
    calExport.title = `Baixa ${cal.mine ? "os eventos da sua agenda" : "os próximos eventos"}${where} num arquivo para o Google Agenda, Outlook ou Apple`;

    let html = "";
    for (let week = 0; week < weeks; week++) {
      const weekStart = addDays(gridStart, week * 7);
      const weekEnd = addDays(weekStart, 6);
      // Cada evento vira um pedaço por semana; pedaços ocupam faixas sem se sobrepor.
      const pieces = pool
        .filter((event) => event.startDate <= weekEnd && lastDay(event) >= weekStart)
        .map((event) => {
          const from = event.startDate < weekStart ? weekStart : event.startDate;
          const to = lastDay(event) > weekEnd ? weekEnd : lastDay(event);
          return { event, col: daysBetween(weekStart, from), span: daysBetween(from, to) + 1, cutStart: event.startDate < weekStart, cutEnd: lastDay(event) > weekEnd };
        })
        .sort((a, b) => a.col - b.col || b.span - a.span);
      const lanes = [];
      pieces.forEach((piece) => {
        let lane = lanes.findIndex((end) => end < piece.col);
        if (lane === -1) lane = lanes.length;
        lanes[lane] = piece.col + piece.span - 1;
        piece.lane = lane;
      });

      let cells = "";
      for (let index = 0; index < 7; index++) {
        const iso = addDays(weekStart, index);
        const holiday = holidayOf(iso);
        const [, dm, dd] = dateParts(iso);
        const classes = ["cal-day", iso.slice(0, 7) !== cal.month && "is-out", iso === now && "is-today", holiday && "is-holiday"].filter(Boolean).join(" ");
        const number = dd === 1 ? `${dd} ${months[dm - 1]}` : dd;
        cells += `<div class="${classes}" style="grid-column: ${index + 1}"><span class="cal-num"${iso === now ? ' aria-label="Hoje"' : ""}>${number}</span>${holiday ? `<span class="cal-holiday" title="${escapeHtml(holiday)}">${escapeHtml(holiday)}</span>` : ""}</div>`;
      }
      const bars = pieces.map(({ event, col, span, lane, cutStart, cutEnd }) => {
        const classes = ["cal-event", isPast(event) && "is-past", saved.has(event.slug) && "is-saved", cutStart && "cut-start", cutEnd && "cut-end"].filter(Boolean).join(" ");
        const detail = `${event.name}, ${formatDates(event)}, ${placeShort(event)}${saved.has(event.slug) ? ", na minha agenda" : ""}`;
        return `<button type="button" class="${classes}" style="grid-column: ${col + 1} / span ${span}; grid-row: ${lane + 2}" data-open="${escapeHtml(event.slug)}" data-hover="${escapeHtml(event.slug)}" data-city="${escapeHtml(event.cityKey)}"><span class="cal-ev-name">${escapeHtml(event.label)}</span><span class="cal-ev-uf" aria-hidden="true">${escapeHtml(event.uf.toUpperCase())}</span><span class="sr-only">: ${escapeHtml(detail)}</span></button>`;
      }).join("");
      html += `<div class="cal-week" style="--lanes: ${Math.max(lanes.length, 1)}">${cells}${bars}</div>`;
    }
    calWeeks.innerHTML = html;

    // Mês vazio: diz isso e oferece o pulo para o próximo mês com evento.
    const inMonth = pool.some((event) => event.startDate <= monthEnd && lastDay(event) >= first);
    let hint = "";
    if (cal.mine && !saved.size) {
      hint = "Sua agenda está vazia. Abra um evento e toque em “Salvar” para montar o seu roteiro.";
    } else if (!inMonth) {
      const next = pool.find((event) => event.startDate > monthEnd);
      const previous = [...pool].reverse().find((event) => lastDay(event) < first);
      const jump = next || previous;
      hint = `Nenhum evento${cal.mine ? " salvo" : ""}${escapeHtml(where)} em ${monthNames[m - 1]} de ${y}.`;
      if (jump) hint += ` <button type="button" class="link-btn" data-goto="${jump.startDate.slice(0, 7)}">${next ? "Próximo" : "Último"}: ${escapeHtml(jump.label)}, ${escapeHtml(formatDates(jump))} ${next ? "→" : "←"}</button>`;
      else if (!cal.mine) hint += ` Conhece algum? <a href="${escapeHtml(SUGGEST_URL)}">Manda pra gente</a>.`;
    }
    calHint.hidden = !hint;
    calHint.innerHTML = hint;
  };

  const goToMonth = (month) => {
    cal.month = month;
    renderCalendar();
    renderHot();
  };
  const shiftMonth = (delta) => {
    const [y, m] = cal.month.split("-").map(Number);
    goToMonth(isoOf(Date.UTC(y, m - 1 + delta, 1)).slice(0, 7));
  };

  // .ics para Google Agenda, Outlook e Apple. Eventos de dia inteiro: DTEND é
  // exclusivo, então vai um dia depois do último dia do evento.
  const compactDate = (iso) => iso.replaceAll("-", "");
  const placeLine = (event) => [event.venue, `${event.city} - ${event.uf.toUpperCase()}`].filter(Boolean).join(", ");
  const eventUrl = (event) => event.links?.site || event.links?.tickets || "";
  const icsText = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const encoder = new TextEncoder();
  // Linhas de no máximo 75 bytes (RFC 5545), dobradas sem cortar caractere no meio.
  const icsFold = (line) => {
    let out = "";
    let size = 0;
    for (const char of line) {
      const bytes = encoder.encode(char).length;
      if (size + bytes > 74) { out += "\r\n "; size = 1; }
      out += char;
      size += bytes;
    }
    return out;
  };
  const icsFor = (events) => {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cyber Map//Eventos de segurança no Brasil//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Cyber Map"];
    events.forEach((event) => {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${event.slug}@cybermap`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${compactDate(event.startDate)}`,
        `DTEND;VALUE=DATE:${compactDate(addDays(lastDay(event), 1))}`,
        `SUMMARY:${icsText(event.name)}`,
        `LOCATION:${icsText(placeLine(event))}`,
        `DESCRIPTION:${icsText([event.description, eventUrl(event)].filter(Boolean).join("\n\n"))}`
      );
      if (eventUrl(event)) lines.push(`URL:${eventUrl(event)}`);
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return `${lines.map(icsFold).join("\r\n")}\r\n`;
  };
  const download = (filename, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const googleCalendarUrl = (event) => `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates: `${compactDate(event.startDate)}/${compactDate(addDays(lastDay(event), 1))}`,
    details: [event.description, eventUrl(event), "Via Cyber Map"].filter(Boolean).join("\n\n"),
    location: placeLine(event)
  })}`;

  /* ---------- Seleção ---------- */

  const render = () => {
    renderMap();
    renderPanel();
    renderCalendar();
    renderHot();
  };

  // Clicar no estado selecionado limpa o filtro; keep = true seleciona sem alternar.
  // Estado só com eventos passados abre direto na aba "Já rolou".
  const select = (uf, { keep = false } = {}) => {
    if (!uf || (view.sel === uf && !keep)) {
      view.sel = null;
      view.tab = "up";
      view.hoverState = null;
    } else {
      const local = shown.filter((event) => event.uf === uf);
      view.sel = uf;
      view.tab = local.length && !local.some((event) => !isPast(event)) ? "past" : "up";
    }
    syncHash(view.sel);
    render();
  };

  /* ---------- Modal ---------- */

  let modalOpener = null;
  let modalEvent = null;
  const findEvent = (slug) => allEvents.find((event) => event.slug === slug);

  const fillModal = (event) => {
    $("#modal-logo").innerHTML = logoInner(event, 64);
    $("#modal-meta").textContent = typeAndDates(event);
    $("#modal-title").textContent = event.name;
    $("#modal-place").textContent = placeLong(event);
    $("#modal-venue").hidden = !event.venue;
    $("#modal-venue-text").textContent = event.venue || "";
    const past = isPast(event);
    $("#modal-past").hidden = !past;
    const when = $("#modal-when");
    when.hidden = past || !event.startDate;
    if (!when.hidden) {
      const days = daysUntil(event.startDate);
      when.textContent = days > 1 ? `Começa em ${days} dias` : (days === 1 ? "Começa amanhã" : "Acontecendo agora");
    }
    $("#modal-desc").hidden = !event.description;
    $("#modal-desc").textContent = event.description || "";
    const links = Object.keys(linkLabels).filter((key) => event.links?.[key]);
    $("#modal-links").hidden = !links.length;
    $("#modal-links").innerHTML = links.map((key) => `<li><a class="${primaryLinks.has(key) ? "btn-primary" : "btn-ghost"}" href="${escapeHtml(event.links[key])}" target="_blank" rel="noopener">${escapeHtml(linkLabels[key])} ↗</a></li>`).join("");
    $("#modal-nolinks").hidden = links.length > 0;
    $("#modal-gcal").href = googleCalendarUrl(event);
    syncSaveButton(event);
  };
  const syncSaveButton = (event) => {
    const on = saved.has(event.slug);
    $("#modal-save").setAttribute("aria-pressed", String(on));
    $("#modal-save-text").textContent = on ? "Salvo" : "Salvar";
    $("#modal-save").title = on ? "Tirar da minha agenda" : "Salvar na minha agenda";
  };

  const openEventModal = (event, opener = null) => {
    if (!event) return;
    closePop();
    modalOpener = opener;
    modalEvent = event;
    fillModal(event);
    if (!modal.open) modal.showModal();
    modal.querySelector(".modal-card").scrollTop = 0;
    syncHash(view.sel, event.slug);
  };
  const closeEventModal = () => {
    if (modal.open) modal.close();
  };

  /* ---------- Ligações ---------- */

  // mouseenter/leave e focus/blur por elemento, delegados no contêiner (o
  // conteúdo é regerado a cada filtro).
  const delegateHover = (container, open = (trigger) => openEventModal(findEvent(trigger.dataset.open), trigger)) => {
    const handle = (type) => (event) => {
      const node = event.target.closest("[data-hover]");
      if (!node || node.contains(event.relatedTarget)) return;
      if (type === "on") hoverOn("hoverEvent", node.dataset.hover);
      else hoverOff("hoverEvent", node.dataset.hover);
    };
    container.addEventListener("mouseover", handle("on"));
    container.addEventListener("focusin", handle("on"));
    container.addEventListener("mouseout", handle("off"));
    container.addEventListener("focusout", handle("off"));
    container.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-open]");
      if (trigger) open(trigger);
    });
  };
  delegateHover(list);
  delegateHover(calWeeks);
  // Da lista do mapa, o foco volta para a bolinha quando o modal fecha (a lista
  // fecha antes de abrir o modal).
  delegateHover(mapPop, (trigger) => {
    const opener = popState.marker?.hit || null;
    closePop();
    openEventModal(findEvent(trigger.dataset.open), opener);
  });
  mapPop.addEventListener("mouseenter", () => clearTimeout(popState.timer));
  mapPop.addEventListener("mouseleave", closePopSoon);
  mapPop.addEventListener("focusin", () => clearTimeout(popState.timer));
  mapPop.addEventListener("focusout", (event) => {
    if (!mapPop.contains(event.relatedTarget) && event.relatedTarget !== popState.marker?.hit) closePop();
  });
  // Setas andam pela lista; Esc fecha e devolve o foco à bolinha.
  mapPop.addEventListener("keydown", (event) => {
    const items = [...mapPop.querySelectorAll("button")];
    const index = items.indexOf(document.activeElement);
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step && index !== -1) {
      event.preventDefault();
      items[(index + step + items.length) % items.length].focus();
    } else if (event.key === "Escape") {
      event.stopPropagation();
      closePop({ restoreFocus: true });
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!mapPop.hidden && !mapPop.contains(event.target) && event.target !== popState.marker?.hit) closePop();
  });
  // O agrupamento depende do tamanho do mapa na tela.
  let resizeFrame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (mapRoot) renderMap(); });
  }).observe(mapCard);

  // Ao limpar pelo teclado, o foco não pode sumir junto com o botão escondido.
  const clearFrom = (button, fallback) => {
    const viaKeyboard = button.matches(":focus-visible");
    const previous = view.sel;
    select(null);
    if (viaKeyboard) (fallback(previous) || tabUp).focus();
  };
  mapBack.addEventListener("click", () => clearFrom(mapBack, (uf) => statePaths[uf]));
  panelClear.addEventListener("click", () => clearFrom(panelClear, () => tabUp));
  tabUp.addEventListener("click", () => { view.tab = "up"; renderPanel(); renderHot(); });
  tabPast.addEventListener("click", () => { view.tab = "past"; renderPanel(); renderHot(); });
  mapRetry.addEventListener("click", () => loadMap());

  $("#modal-close").addEventListener("click", closeEventModal);
  $("#modal-save").addEventListener("click", () => {
    const { slug } = modalEvent;
    if (saved.has(slug)) saved.delete(slug);
    else saved.add(slug);
    storeSaved();
    syncSaveButton(modalEvent);
    // Marca nos cards sem regerar a lista (não perde a rolagem do painel).
    list.querySelectorAll("[data-hover]").forEach((node) => { if (node.dataset.hover === slug) node.classList.toggle("is-saved", saved.has(slug)); });
    renderCalendar();
    renderHot();
  });
  $("#modal-ics").addEventListener("click", () => download(`${modalEvent.slug}.ics`, icsFor([modalEvent])));

  calStateBtn.addEventListener("click", () => (calStateMenu.hidden ? openStateMenu() : closeStateMenu()));
  calStateBtn.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); openStateMenu(); }
  });
  calStateMenu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-uf]");
    if (!option) return;
    closeStateMenu({ restoreFocus: true });
    select(option.dataset.uf || null, { keep: true });
  });
  // Setas, Home/End e a primeira letra do estado andam pelo menu; Esc fecha.
  calStateMenu.addEventListener("keydown", (event) => {
    const options = [...calStateMenu.querySelectorAll("[data-uf]")];
    const index = options.indexOf(document.activeElement);
    let target = null;
    if (event.key === "ArrowDown") target = options[Math.min(index + 1, options.length - 1)];
    else if (event.key === "ArrowUp") target = options[Math.max(index - 1, 0)];
    else if (event.key === "Home") target = options[0];
    else if (event.key === "End") target = options[options.length - 1];
    else if (event.key === "Escape") {
      event.stopPropagation();
      closeStateMenu({ restoreFocus: true });
      return;
    } else if (/^\p{L}$/u.test(event.key)) {
      const letter = slugify(event.key);
      const starts = (option) => slugify(option.textContent.trim()).startsWith(letter);
      target = options.slice(index + 1).find(starts) || options.find(starts);
    }
    if (target) { event.preventDefault(); target.focus(); }
  });
  calState.addEventListener("focusout", (event) => { if (!calState.contains(event.relatedTarget)) closeStateMenu(); });
  document.addEventListener("pointerdown", (event) => { if (!calState.contains(event.target)) closeStateMenu(); });
  calAll.addEventListener("click", () => { cal.mine = false; renderCalendar(); renderHot(); });
  calMine.addEventListener("click", () => { cal.mine = true; renderCalendar(); renderHot(); });
  $("#cal-prev").addEventListener("click", () => shiftMonth(-1));
  $("#cal-next").addEventListener("click", () => shiftMonth(1));
  $("#cal-today").addEventListener("click", () => goToMonth(today().slice(0, 7)));
  calHint.addEventListener("click", (event) => {
    const target = event.target.closest("[data-goto]");
    if (target) goToMonth(target.dataset.goto);
  });
  calExport.addEventListener("click", () => {
    const events = cal.mine ? calPool() : calPool().filter((event) => !isPast(event));
    const name = `cyber-map-${cal.mine ? "minha-agenda" : "proximos-eventos"}${view.sel ? `-${view.sel}` : ""}.ics`;
    if (events.length) download(name, icsFor(events));
  });
  // Fecha também pelo Escape nativo e pelo backdrop, não só pelo botão.
  modal.addEventListener("close", () => {
    modalEvent = null;
    syncHash(view.sel);
    focusQuietly(modalOpener);
    modalOpener = null;
  });
  // O <dialog> não tem padding: o clique só cai nele mesmo quando é no backdrop.
  modal.addEventListener("click", (event) => { if (event.target === modal) closeEventModal(); });
  $("#modal-map").addEventListener("click", () => {
    const { uf } = modalEvent;
    modalOpener = null;
    closeEventModal();
    select(uf, { keep: true });
    const target = statePaths[uf];
    if (target) target.focus();
    else panelTitle.focus();
  });

  // Escape desfaz uma camada por vez: o modal (nativo), a lista do mapa, depois o filtro.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || modal.open) return;
    if (!mapPop.hidden) closePop({ restoreFocus: mapPop.contains(document.activeElement) });
    else if (view.sel) select(null);
  });

  // Só dispara quando alguém edita a URL ou abre um link compartilhado, nunca pelo syncHash.
  window.addEventListener("hashchange", () => {
    const { state, event, known } = parseHash();
    if (!known) return;
    if (!event) closeEventModal();
    select(state, { keep: true });
    if (event) openEventModal(findEvent(event));
  });

  document.querySelectorAll("[data-year]").forEach((node) => { node.textContent = year; });
  document.querySelectorAll("[data-suggest]").forEach((link) => {
    link.href = SUGGEST_URL;
    if (/^https?:/.test(SUGGEST_URL)) { link.target = "_blank"; link.rel = "noopener"; }
  });

  // Eventos e mapa carregam cada um por conta própria: sem o mapa, a lista continua.
  async function boot() {
    const mapRequest = fetchMap();
    mapRequest.catch(() => {});
    const data = await fetch("data/events.json").then((response) => (response.ok ? response.json() : { events: [] })).catch(() => ({ events: [] }));
    allEvents = (data.events || []).map((event) => {
      const uf = event.state?.toLowerCase() || "";
      return { ...event, uf, slug: eventSlug(event), label: event.calendarLabel || event.name, cityKey: `${uf}|${event.city}` };
    }).sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"));
    shown = allEvents.filter((event) => !isPast(event) || inYear(event));
    counts = shown.filter(inYear).reduce((acc, event) => {
      if (event.uf) acc[event.uf] = (acc[event.uf] || 0) + 1;
      return acc;
    }, {});
    $("#stat-total").textContent = shown.filter(inYear).length;
    $("#stat-ufs").textContent = Object.keys(counts).length;
    $("#stat-upcoming").textContent = shown.filter((event) => !isPast(event)).length;

    const { state, event } = parseHash();
    select(state, { keep: true });
    if (event) openEventModal(findEvent(event));
    await loadMap(mapRequest);
  }
  boot();
})();
