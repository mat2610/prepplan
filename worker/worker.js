/* PrepPlan — Gemini proxy (Cloudflare Worker)
   Keeps the Gemini API key on the server so the public app never exposes it.
   Secrets / variables (Cloudflare dashboard → Settings → Variables and Secrets):
     GEMINI_KEY       (secret)   Google AI Studio API key
     ALLOWED_ORIGINS  (optional) comma-separated, e.g. "https://USER.github.io,null"  ("*" = any)
     MODEL            (optional) default "gemini-3.8-flash"                                   */

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || 'null';
    const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
    const ok = allowed.includes('*') || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': ok ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const reply = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
    if (!ok) return reply({ error: 'origin not allowed' }, 403);
    if (!env.GEMINI_KEY) return reply({ error: 'server is missing GEMINI_KEY' }, 500);

    let body;
    try { body = await req.json(); } catch { return reply({ error: 'invalid JSON body' }, 400); }
    const prompt = String(body.prompt || '');
    if (!prompt || prompt.length > 15000) return reply({ error: 'prompt missing or too long' }, 400);

    // try the main model, then fallbacks; retry briefly on overload (429/500/503)
    const models = [...(env.MODEL || 'gemini-3.8-flash').split(','), 'gemini-flash-latest', 'gemini-flash-lite-latest']
      .map(s => s.trim()).filter((m, i, a) => m && a.indexOf(m) === i);
    const payload = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: body.json ? { responseMimeType: 'application/json', temperature: 0.4 } : { temperature: 0.6 },
    });
    let data = {}, lastError = 'unknown error', usedModel = '';
    outer: for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY }, body: payload,
        });
        data = await r.json().catch(() => ({}));
        if (r.ok) { usedModel = model; break outer; }
        lastError = data.error?.message || ('Gemini HTTP ' + r.status);
        if (![429, 500, 503].includes(r.status)) break;          // not an overload: try next model directly
        await new Promise(res => setTimeout(res, 1200 * (attempt + 1)));
      }
    }
    if (!usedModel) return reply({ error: lastError }, 502);
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    return reply({ text, model: usedModel });
  },
};
