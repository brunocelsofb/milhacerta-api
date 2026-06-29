export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fly_from, fly_to, date_from } = req.query;

  if (!fly_from || !fly_to || !date_from) {
    return res.status(400).json({ error: "Parâmetros incompletos. Use fly_from, fly_to e date_from." });
  }

  const RAPID_KEY = process.env.RAPIDAPI_KEY;
  if (!RAPID_KEY) {
    return res.status(500).json({ error: "Configure a variável RAPIDAPI_KEY na Vercel." });
  }

  const dataIda = date_from.includes('/') ? date_from.split('/').reverse().join('-') : date_from;
  const headers = {
    'x-rapidapi-key': RAPID_KEY,
    'x-rapidapi-host': 'sky-scrapper.p.rapidapi.com'
  };

  // fetch com timeout — evita a function ficar pendurada se a RapidAPI travar
  async function fetchComTimeout(url, ms = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const r = await fetch(url, { headers, signal: controller.signal });
      return r;
    } finally {
      clearTimeout(timer);
    }
  }

  // Procura, entre os resultados do searchAirport, o item cujo código bate de verdade com o
  // que foi digitado — em vez de confiar que o primeiro da lista é o aeroporto certo
  // (problema real pra cidades com mais de um aeroporto, como São Paulo: GRU/CGH/VCP).
  function encontrarAeroportoCorreto(lista, codigoBuscado) {
    if (!Array.isArray(lista) || lista.length === 0) return null;
    const alvo = codigoBuscado.toUpperCase();
    const candidatosCodigo = item =>
      [item.skyId, item.iata, item.navigation?.relevantFlightParams?.skyId, item.presentation?.suggestionTitle]
        .filter(Boolean)
        .map(v => String(v).toUpperCase());

    const exato = lista.find(item => candidatosCodigo(item).includes(alvo));
    if (exato) return { item: exato, confianca: 'exato' };

    // Nenhum bateu exatamente — usa o primeiro como fallback, mas avisa que não é garantido.
    return { item: lista[0], confianca: 'fallback_nao_confirmado' };
  }

  function extrairSkyEntity(item) {
    return {
      skyId: item.skyId || item.navigation?.relevantFlightParams?.skyId || null,
      entityId: item.entityId || item.navigation?.relevantFlightParams?.entityId || null
    };
  }

  try {
    // 1. Resolução de aeroportos
    const [resOrigem, resDestino] = await Promise.all([
      fetchComTimeout(`https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchAirport?query=${encodeURIComponent(fly_from)}`),
      fetchComTimeout(`https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchAirport?query=${encodeURIComponent(fly_to)}`)
    ]);

    if (!resOrigem.ok || !resDestino.ok) {
      return res.status(502).json({
        error: "A busca de aeroportos falhou na RapidAPI.",
        detalhe: { status_origem: resOrigem.status, status_destino: resDestino.status }
      });
    }

    const jsonOrigem = await resOrigem.json();
    const jsonDestino = await resDestino.json();

    const matchOrigem = encontrarAeroportoCorreto(jsonOrigem.data, fly_from);
    const matchDestino = encontrarAeroportoCorreto(jsonDestino.data, fly_to);

    if (!matchOrigem) return res.status(200).json({ status: "vazio", motivo: "Origem não localizada", bruto_origem: jsonOrigem });
    if (!matchDestino) return res.status(200).json({ status: "vazio", motivo: "Destino não localizado", bruto_destino: jsonDestino });

    const origemIds = extrairSkyEntity(matchOrigem.item);
    const destinoIds = extrairSkyEntity(matchDestino.item);

    if (!origemIds.skyId || !destinoIds.skyId) {
      return res.status(200).json({
        status: "vazio",
        motivo: "Aeroporto encontrado, mas sem skyId/entityId utilizável.",
        bruto_origem: matchOrigem.item, bruto_destino: matchDestino.item
      });
    }

    // 2. Busca de voos
    const params = new URLSearchParams({
      originSkyId: origemIds.skyId,
      destinationSkyId: destinoIds.skyId,
      originEntityId: origemIds.entityId ?? '',
      destinationEntityId: destinoIds.entityId ?? '',
      date: dataIda,
      cabinClass: 'economy',
      adults: '1',
      currency: 'BRL'
    });
    const urlBusca = `https://sky-scrapper.p.rapidapi.com/api/v2/flights/searchFlights?${params.toString()}`;
    const response = await fetchComTimeout(urlBusca);

    if (!response.ok) {
      const corpoErro = await response.text().catch(() => '');
      return res.status(502).json({ error: "A RapidAPI recusou a busca de voos.", status: response.status, corpo: corpoErro });
    }

    const result = await response.json();
    const itineraries = result.data?.itineraries || [];

    if (itineraries.length === 0) {
      // Em vez de só dizer "vazio", devolve a resposta crua — assim a próxima falha tem evidência real,
      // não mais uma suposição. Inclui também o nível de confiança da resolução de aeroporto.
      return res.status(200).json({
        status: "vazio",
        motivo: "Voo indisponível nesta data (ou parâmetro faltando — ver bruto_resultado).",
        confianca_origem: matchOrigem.confianca,
        confianca_destino: matchDestino.confianca,
        params_usados: Object.fromEntries(params),
        bruto_resultado: result
      });
    }

    const melhorVoo = itineraries.reduce((min, v) => ((v.price?.raw ?? Infinity) < (min.price?.raw ?? Infinity) ? v : min), itineraries[0]);
    const precoReal = melhorVoo.price?.raw;
    const nomeCia = melhorVoo.legs?.[0]?.carriers?.marketing?.[0]?.name || "Múltiplas Cias";

    if (precoReal == null) {
      return res.status(200).json({ status: "vazio", motivo: "Itinerário veio sem preço (price.raw ausente).", bruto_voo: melhorVoo });
    }

    return res.status(200).json([
      {
        data: dataIda,
        preco: Math.round(precoReal),
        cia: nomeCia,
        link: `https://www.google.com/travel/flights?q=Flights%20to%20${destinoIds.skyId}%20from%20${origemIds.skyId}%20on%20${dataIda}%20one%20way`
      }
    ]);

  } catch (error) {
    const msg = error.name === 'AbortError' ? "A RapidAPI demorou demais para responder." : "Erro de comunicação.";
    return res.status(500).json({ error: msg, detalhe: error.message });
  }
}
