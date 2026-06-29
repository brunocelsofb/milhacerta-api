export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fly_from, fly_to, date_from } = req.query;
  if (!fly_from || !fly_to || !date_from) {
    return res.status(400).json({ error: "Parâmetros incompletos. Use fly_from, fly_to e date_from." });
  }

  const DUFFEL_TOKEN = process.env.DUFFEL_TOKEN;
  if (!DUFFEL_TOKEN) {
    return res.status(500).json({ error: "Configure a variável DUFFEL_TOKEN na Vercel (token que começa com duffel_test_ por enquanto)." });
  }

  // Duffel espera AAAA-MM-DD
  const dataPartida = date_from.includes('/') ? date_from.split('/').reverse().join('-') : date_from;

  const headers = {
    'Authorization': `Bearer ${DUFFEL_TOKEN}`,
    'Duffel-Version': 'v2',
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  async function fetchComTimeout(url, options, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  const supplierTimeoutMs = 15000; // tempo que a Duffel espera resposta das companhias aéreas
  const clientTimeoutMs = 20000;   // nosso timeout precisa ser maior que o supplier_timeout

  const body = {
    data: {
      slices: [{ origin: fly_from.toUpperCase(), destination: fly_to.toUpperCase(), departure_date: dataPartida }],
      passengers: [{ type: 'adult' }],
      cabin_class: 'economy'
    }
  };

  try {
    const url = `https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=${supplierTimeoutMs}`;
    const response = await fetchComTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) }, clientTimeoutMs);
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      // Erros de validação da Duffel já dizem exatamente qual campo está errado — repassa isso direto.
      return res.status(response.status).json({
        error: "A Duffel recusou a busca.",
        detalhe: result?.errors || result
      });
    }

    const offers = result?.data?.offers || [];
    if (offers.length === 0) {
      return res.status(200).json({
        status: "vazio",
        motivo: "Nenhuma oferta pra essa rota/data. Lembrete: em modo de teste, normalmente só a Duffel Airways responde, e principalmente pra LHR-JFK — GRU-MCO pode legitimamente vir vazio até trocarmos pro token live.",
        modo_live: result?.data?.live_mode ?? null
      });
    }

    const melhor = offers.reduce((min, o) => (Number(o.total_amount) < Number(min.total_amount) ? o : min), offers[0]);
    const cia = melhor.slices?.[0]?.segments?.[0]?.marketing_carrier?.name || melhor.owner?.name || "Companhia não identificada";

    return res.status(200).json([
      {
        data: dataPartida,
        preco: Math.round(Number(melhor.total_amount)),
        moeda: melhor.total_currency, // AVISO: pode não vir em BRL — ver nota abaixo
        cia,
        link: null // Duffel não usa link externo de checkout — a emissão seria via Order API, dentro do nosso próprio app
      }
    ]);
  } catch (error) {
    const msg = error.name === 'AbortError' ? "A Duffel demorou demais para responder." : "Erro de comunicação com a Duffel.";
    return res.status(500).json({ error: msg, detalhe: error.message });
  }
}
