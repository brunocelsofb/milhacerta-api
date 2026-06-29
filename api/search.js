export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fly_from, fly_to, date_from } = req.query;

  if (!fly_from || !fly_to || !date_from) {
    return res.status(400).json({ error: "Parâmetros incompletos." });
  }

  const RAPID_KEY = process.env.RAPIDAPI_KEY;
  if (!RAPID_KEY) {
    return res.status(500).json({ error: "Configure a variável RAPIDAPI_KEY na Vercel." });
  }

  const dataIda = date_from.includes('/') ? date_from.split('/').reverse().join('-') : date_from;

  try {
    const headers = {
      'x-rapidapi-key': RAPID_KEY,
      'x-rapidapi-host': 'sky-scrapper.p.rapidapi.com'
    };

    // 1. Handshake de Origem
    const urlOrigem = `https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchAirport?query=${fly_from.toUpperCase()}`;
    const resOrigem = await fetch(urlOrigem, { headers });
    const jsonOrigem = await resOrigem.json();
    const dadosOrigem = jsonOrigem.data?.[0];

    if (!dadosOrigem) return res.status(200).json({ status: "vazio", motivo: "Origem não localizada" });
    const originSkyId = dadosOrigem.skyId;
    const originEntityId = dadosOrigem.entityId;

    // 2. Handshake de Destino
    const urlDestino = `https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchAirport?query=${fly_to.toUpperCase()}`;
    const resDestino = await fetch(urlDestino, { headers });
    const jsonDestino = await resDestino.json();
    const dadosDestino = jsonDestino.data?.[0];

    if (!dadosDestino) return res.status(200).json({ status: "vazio", motivo: "Destino não localizado" });
    const destSkyId = dadosDestino.skyId;
    const destEntityId = dadosDestino.entityId;

    // 3. Busca Limpa de Ida (Foco na rota estável v2)
    const urlBusca = `https://sky-scrapper.p.rapidapi.com/api/v2/flights/searchFlights?originSkyId=${originSkyId}&destinationSkyId=${destSkyId}&originEntityId=${originEntityId}&destinationEntityId=${destEntityId}&date=${dataIda}&cabinClass=economy&adults=1&currency=BRL`;
    
    const response = await fetch(urlBusca, { headers });
    if (!response.ok) throw new Error("A RapidAPI recusou o processamento.");
    
    const result = await response.json();
    const itineraries = result.data?.itineraries || [];

    if (itineraries.length === 0) {
      return res.status(200).json({ status: "vazio", motivo: "Voo indisponível nesta data" });
    }

    const melhorVoo = itineraries[0];
    const precoReal = Math.round(melhorVoo.price?.raw || 1200);
    const nomeCia = melhorVoo.legs?.[0]?.carriers?.marketing?.[0]?.name || "Múltiplas Cias";

    return res.status(200).json([
      {
        data: dataIda,
        preco: precoReal,
        cia: nomeCia,
        link: `https://www.google.com/travel/flights?q=Flights%20to%20${destSkyId}%20from%20${originSkyId}%20on%20${dataIda}%20one%20way`
      }
    ]);

  } catch (error) {
    return res.status(500).json({ error: "Erro de comunicação.", detalhe: error.message });
  }
}
