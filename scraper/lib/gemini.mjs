// Cliente mínimo da Gemini API (generateContent com saída em JSON Schema).
// Tenta os modelos em ordem: cota esgotada ou modelo indisponível passa para o próximo.

const endpoint = "https://generativelanguage.googleapis.com/v1beta/models";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class QuotaError extends Error {}

export const usage = { calls: 0, tokens: 0, byModel: {}, unavailable: {} };

// "17s" → 17. A API manda o tempo de espera em RetryInfo.retryDelay.
const retryDelay = (body) => {
  const info = (body?.error?.details || []).find((item) => String(item["@type"]).endsWith("RetryInfo"));
  const seconds = parseFloat(String(info?.retryDelay || "").replace(/s$/, ""));
  return Number.isFinite(seconds) ? seconds : null;
};

export async function generateJson({ apiKey, models, system, prompt, schema }) {
  for (const model of models) {
    if (usage.unavailable[model]) continue;
    for (let attempt = 0; attempt < 3; attempt++) {
      let response;
      try {
        response = await fetch(`${endpoint}/${model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: schema }
          }),
          signal: AbortSignal.timeout(180000)
        });
      } catch (error) {
        if (attempt < 2) { await sleep(3000 * (attempt + 1)); continue; }
        throw error;
      }
      usage.calls++;
      const body = await response.json().catch(() => ({}));

      if (response.status === 429) {
        // Cota por minuto: espera o que a API pedir. Cota do dia: troca de modelo.
        const wait = retryDelay(body);
        const daily = JSON.stringify(body).includes("PerDay");
        if (!daily && wait !== null && wait <= 70 && attempt < 2) { await sleep((wait + 1) * 1000); continue; }
        usage.unavailable[model] = daily ? "cota do dia esgotada" : "limite de requisições";
        break;
      }
      if (response.status === 404 || response.status === 403) {
        usage.unavailable[model] = `indisponível (HTTP ${response.status}: ${body.error?.message || ""})`.trim();
        break;
      }
      if (response.status >= 500) { await sleep(3000 * (attempt + 1)); continue; }
      if (!response.ok) throw new Error(`Gemini ${model}: HTTP ${response.status} ${body.error?.message || ""}`);

      const tokens = body.usageMetadata?.totalTokenCount || 0;
      usage.tokens += tokens;
      usage.byModel[model] = (usage.byModel[model] || 0) + 1;
      const text = (body.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("");
      if (!text) throw new Error(`Gemini ${model}: resposta vazia (${body.candidates?.[0]?.finishReason || body.promptFeedback?.blockReason || "sem motivo"})`);
      return { model, value: JSON.parse(text) };
    }
  }
  throw new QuotaError(`nenhum modelo disponível: ${JSON.stringify(usage.unavailable)}`);
}
