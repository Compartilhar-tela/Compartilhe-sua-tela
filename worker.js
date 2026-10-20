// Cloudflare Worker: entrega credenciais TURN temporárias para o site Telaja/Compartilha.
// Variáveis necessárias (Settings > Variables and Secrets):
//   TURN_KEY_ID     (texto)   -> "Key ID" da sua TURN key
//   TURN_API_TOKEN  (secret)  -> "API Token" da sua TURN key
//   ALLOWED_ORIGIN  (texto, opcional) -> padrão: https://compartilhar-tela.github.io

// Cloudflare Worker: credenciais TURN e pré-visualização dinâmica com código da sala
export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || "https://compartilhar-tela.github.io";
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    const cors = {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    // Se o pedido for para gerar a imagem de preview com o código (ex: /preview.png?code=ABC)
    if (url.pathname.endsWith("/preview.png") && url.searchParams.has("code")) {
      const roomCode = url.searchParams.get("code").toUpperCase();
      
      // SVG dinâmico elegante imitando a sua preview com o código da sala em destaque
      const svgImage = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0b0d1f"/>
            <stop offset="100%" stop-color="#1a1f3d"/>
          </linearGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#bg)" rx="24"/>
        <!-- Moldura externa -->
        <rect x="30" y="30" width="1140" height="570" rx="16" fill="none" stroke="#272c52" stroke-width="4"/>
        
        <!-- Texto descritivo -->
        <text x="90" y="210" font-family="system-ui, sans-serif" font-weight="800" font-size="72px" fill="#ffffff">Compartilhe</text>
        <text x="90" y="295" font-family="system-ui, sans-serif" font-weight="800" font-size="72px" fill="#8a7dff">sua tela</text>
        <text x="90" y="390" font-family="system-ui, sans-serif" font-weight="400" font-size="28px" fill="#9aa0c7">Mostre sua tela ao vivo, sem cadastro e sem instalar nada.</text>
        
        <!-- Caixa do Código em Destaque -->
        <g transform="translate(720, 180)">
          <rect width="360" height="270" rx="20" fill="#12162b" stroke="#8a7dff" stroke-width="3"/>
          <text x="40" y="65" font-family="system-ui, sans-serif" font-weight="700" font-size="20px" fill="#9aa0c7" letter-spacing="2">CÓDIGO DA SALA</text>
          <text x="40" y="175" font-family="system-ui, sans-serif" font-weight="800" font-size="75px" fill="#ffffff" letter-spacing="8">${roomCode}</text>
          <circle cx="310" cy="55" r="8" fill="#2ecc8f"/>
          <text x="230" y="62" font-family="system-ui, sans-serif" font-weight="700" font-size="16px" fill="#2ecc8f">AO VIVO</text>
        </g>
      </svg>`;

      return new Response(svgImage, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=60",
          ...cors
        }
      });
    }

    // Validação de origem para pedidos de credenciais TURN
    if (origin && origin !== allowed && !origin.includes("github.io")) {
      return new Response(JSON.stringify({ error: "origem não permitida" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) {
      return new Response(JSON.stringify({ error: "Worker sem credenciais configuradas" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const r = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TURN_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 86400 }),
      }
    );
    if (!r.ok) return new Response(JSON.stringify({ error: "Erro na Cloudflare", status: r.status }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });

    const data = await r.json();
    let ice = data.iceServers;
    if (!Array.isArray(ice)) ice = ice ? [ice] : [];
    return new Response(JSON.stringify({ iceServers: ice }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  },
};