// Cloudflare Worker: entrega credenciais TURN temporárias para o site Telaja/Compartilha.
// Variáveis necessárias (Settings > Variables and Secrets):
//   TURN_KEY_ID     (texto)   -> "Key ID" da sua TURN key
//   TURN_API_TOKEN  (secret)  -> "API Token" da sua TURN key
//   ALLOWED_ORIGIN  (texto, opcional) -> padrão: https://compartilhar-tela.github.io

export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || "https://compartilhar-tela.github.io";
    const origin = request.headers.get("Origin") || "";

    const cors = {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    // Só o seu site pode pedir credenciais.
    if (origin !== allowed) return json({ error: "origem não permitida" }, 403);

    if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) {
      return json({ error: "Worker sem TURN_KEY_ID ou TURN_API_TOKEN" }, 500);
    }

    const r = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TURN_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 86400 }), // credenciais valem 24 h
      }
    );
    if (!r.ok) return json({ error: "a Cloudflare recusou o pedido", status: r.status }, 502);

    const data = await r.json();
    let ice = data.iceServers;
    if (!Array.isArray(ice)) ice = ice ? [ice] : [];
    return json({ iceServers: ice });
  },
};
