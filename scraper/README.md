# Coletor de eventos

Acha eventos presenciais de segurança no Brasil e propõe as entradas novas do
`data/events.json` num PR. Roda todo dia no GitHub Actions (`.github/workflows/coletor-eventos.yml`).

## Como funciona

1. **Pistas.** Até 10 buscas por dia no Tavily, em rodízio (`sources.json`), mais as listagens e
   páginas fixas de lá. Os sites e ingressos dos eventos futuros que já estão no mapa são relidos
   para pegar mudança de data.
2. **Triagem.** O Gemini olha título e resumo de cada pista e separa o que parece página de evento.
3. **Extração.** O coletor baixa as páginas e o Gemini devolve os campos do `events.json` num JSON
   fixo, sempre com a frase da página que mostra a data.
4. **Regras sem IA:**
   - a cidade precisa existir na UF (tabela do IBGE em `data/municipios.json`), e é dela que vêm lat/lon;
   - só ficam links que estão na própria página;
   - a frase da data precisa aparecer na página e mostrar o dia do evento, sem ser prazo de
     ingresso (✅/⚠️ no PR); se o modelo trocar a página do evento, vale a página onde a frase está;
   - o evento tem que ser deste ano em diante (os que já passaram no ano vão para "Já rolou"),
     não pode ser evento comercial de um fornecedor só e não pode estar no mapa nem no `ignore.json`.
5. **PR.** Um PR só, na branch `bot/eventos`, refeito a cada execução. Mudanças de data em eventos
   que já estão no mapa aparecem no texto do PR, sem alterar o arquivo.

As páginas já lidas ficam em cache (`.cache/`, guardado pelo Actions): uma página com evento é
relida em 14 dias, uma sem evento em 30. O uso normal fica em ~10 buscas e algumas chamadas ao
Gemini por dia.

## Configuração (uma vez)

1. Chave do Gemini (grátis): https://aistudio.google.com/apikey
2. Chave do Tavily (grátis, 1.000 buscas/mês, sem cartão): https://app.tavily.com. É opcional:
   sem ela o coletor só relê as páginas fixas.
3. No GitHub, em **Settings → Secrets and variables → Actions**, crie `GEMINI_API_KEY` e `TAVILY_API_KEY`.
4. Em **Settings → Actions → General → Workflow permissions**, marque
   **Allow GitHub Actions to create and approve pull requests**.
5. Para testar já: **Actions → Coletor de eventos → Run workflow**.

## Rodar local

```sh
# .env na raiz do projeto (fica fora do git)
GEMINI_API_KEY=...
TAVILY_API_KEY=...

node scraper/run.mjs --dry-run      # mostra o que acharia, sem gravar
node scraper/run.mjs                # grava em data/events.json
node scraper/run.mjs --completo     # carga completa (ver abaixo)
```

## Carga completa

Para encher o mapa de uma vez (no começo, ou num ano novo): `--completo` roda todas as buscas, mais
uma por capital (`completo` em `sources.json`), lê até 200 páginas e relê o que o diário já tinha
descartado. Gasta ~50 créditos do Tavily e algumas dezenas de chamadas do Gemini. Se a cota do Gemini
acabar no meio, rodar de novo continua de onde parou. No GitHub: **Actions → Coletor de eventos →
Run workflow**, marcando "Carga completa". Depois disso o diário segue sozinho.

## Ajustes

- **Recusar um evento:** ponha o nome em `ignore.json` na branch principal.
- **Mais fontes:** `searches` (buscas), `pages` (sites relidos sempre), `listings` (listagens com
  JSON-LD) em `sources.json`.
- **Modelos:** `GEMINI_MODELS` (padrão `gemini-3.5-flash-lite,gemini-3.8-flash`). Se a cota de um
  acabar, o coletor passa para o próximo; se acabarem todos, o resto fica para o dia seguinte.
  Os modelos 2.5 só atendem contas que já os usavam (changelog do Gemini, 18/09/2026).
- **Logos:** continuam manuais.
