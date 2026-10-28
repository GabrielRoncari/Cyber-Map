# Cyber Map

Mapa dos eventos presenciais de segurança da informação e cultura hacker no Brasil:
mapa por estado, agenda e um calendário mensal para organizar o ano (salvar eventos,
levar para o Google Agenda ou baixar `.ics`).

**Site:** https://gabrielroncari.github.io/Cyber-Map/

## Como está montado

- Site estático, sem build: `index.html`, `css/cyber-map.css` e `js/cyber-map.js`.
- Os eventos ficam em `data/events.json`; os logos, em `images/events/`.
- `events.html` só redireciona para o `index.html`, mantendo o `#estado` ou `#e/evento` da URL.

Para ver local, sirva a pasta (o `fetch` não funciona abrindo o arquivo direto):

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Coletor de eventos

Todo dia o GitHub Actions procura eventos novos com busca na web (Tavily) e IA (Gemini, plano
grátis) e abre um PR com o que achou, para revisão. Detalhes, chaves e ajustes em
[`scraper/README.md`](scraper/README.md).
