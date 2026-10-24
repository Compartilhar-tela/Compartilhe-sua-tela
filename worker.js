// Cloudflare Worker: credenciais TURN temporárias e pré-visualização por sala.
// Variáveis (Settings > Variables and Secrets):
//   TURN_KEY_ID     (texto)   -> Key ID da TURN key da Cloudflare
//   TURN_API_TOKEN  (secret)  -> API Token da TURN key
//   EXP_USER, EXP_PASS (secrets, opcionais) -> usuário e senha do ExpressTURN
//   MET_USER, MET_PASS (secrets, opcionais) -> usuário e senha do Metered
//   ALLOWED_ORIGIN  (texto, opcional) -> padrão: https://compartilhar-tela.github.io

const SITE = "https://compartilhar-tela.github.io/Compartilhar.tela/";
const SELF = "https://patient-math-9da9.brunosamuel1524.workers.dev";
const SEC = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...SEC, ...extra },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = env.ALLOWED_ORIGIN || "https://compartilhar-tela.github.io";
    const cors = {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "Método não permitido" }, 405, {});

    const raw = url.searchParams.get("code");
    const code = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

    // 1. Imagem dinâmica com o código da sala (o código é sempre limpo: só letras e números)
    if (url.pathname.endsWith("/preview.png")) {
      const roomCode = code || "LIVE";
      const svgImage = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0b0d1f"/>
            <stop offset="100%" stop-color="#1a1f3d"/>
          </linearGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#bg)" rx="24"/>
        <rect x="30" y="30" width="1140" height="570" rx="16" fill="none" stroke="#272c52" stroke-width="4"/>
        <text x="90" y="210" font-family="system-ui, sans-serif" font-weight="800" font-size="72px" fill="#ffffff">Compartilhe</text>
        <text x="90" y="295" font-family="system-ui, sans-serif" font-weight="800" font-size="72px" fill="#8a7dff">sua tela</text>
        <text x="90" y="390" font-family="system-ui, sans-serif" font-weight="400" font-size="28px" fill="#9aa0c7">Mostre sua tela ao vivo, sem cadastro e sem instalar nada.</text>
        <g transform="translate(720, 180)">
          <rect width="360" height="270" rx="20" fill="#12162b" stroke="#8a7dff" stroke-width="3"/>
          <text x="40" y="65" font-family="system-ui, sans-serif" font-weight="700" font-size="20px" fill="#9aa0c7" letter-spacing="2">CÓDIGO DA SALA</text>
          <text x="40" y="175" font-family="system-ui, sans-serif" font-weight="800" font-size="62px" fill="#ffffff" letter-spacing="6">${roomCode}</text>
          <circle cx="310" cy="55" r="8" fill="#2ecc8f"/>
          <text x="230" y="62" font-family="system-ui, sans-serif" font-weight="700" font-size="16px" fill="#2ecc8f">AO VIVO</text>
        </g>
      </svg>`;
      return new Response(svgImage, {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=60", ...SEC },
      });
    }

    // 2. Página de prévia do link (Discord/WhatsApp) que redireciona para a sala
    if (raw !== null) {
      const title = code ? `Compartilhe sua tela - Sala ${code}` : "Compartilhe sua tela";
      const desc = code
        ? `Clique para entrar na sala ${code} e assistir à transmissão ao vivo sem instalar nada.`
        : "Mostre sua tela ao vivo, sem cadastro e sem instalar nada.";
      const img = `${SELF}/preview.png?code=${code}`;
      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${img}">
<meta property="og:image:type" content="image/svg+xml">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0;url=${SITE}${code ? "#" + code : ""}">
</head>
<body>Redirecionando...</body>
</html>`;
      return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8", ...SEC } });
    }

    // 3. Credenciais ICE/TURN: só para o site autorizado
    if (request.headers.get("Origin") !== allowed) {
      return json({ error: "Origem não permitida" }, 403, {});
    }

    let iceServers = [];
    if (env.TURN_KEY_ID && env.TURN_API_TOKEN) {
      try {
        const r = await fetch(
          `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${env.TURN_API_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ttl: 86400 }),
          }
        );
        if (r.ok) {
          const data = await r.json();
          iceServers = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
        }
      } catch (e) {}
    }

    const body = { iceServers };
    if (env.EXP_USER && env.EXP_PASS) body.express = { username: env.EXP_USER, credential: env.EXP_PASS };
    if (env.MET_USER && env.MET_PASS) body.metered = { username: env.MET_USER, credential: env.MET_PASS };
    return json(body, 200, cors);
  },
};
