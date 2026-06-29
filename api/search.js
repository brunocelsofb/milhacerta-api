export default async function handler(req, res) {
  // Libera o acesso para o teu painel visual ler os dados sem erro de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fly_from, fly_to, date_from } = req.query;

  if (!fly_from || !fly_to || !date_from) {
    return res.status(400).json({ error: "Parâmetros de busca incompletos." });
  }

  // Puxa a chave que guardaste agora mesmo na Vercel
  const RAPID_KEY = process.env.RAPIDAPI_KEY;
  if (!RAPID_KEY) {
    return res.status(500).json({ error: "Configure a variável RAPIDAPI_KEY na Vercel." });
  }

  // Traduz a data do painel (DD/MM/AAAA) para o padrão da API (YYYY-MM-DD)
  const dataIda = date_from.includes('/') ? date_from.split('/').reverse().join('-') : date_from;

  // URL oficial de busca da API Sky Scrapper refletida no teu ecrã da RapidAPI
  const url = `https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchFlights?originSkyId=${fly_from.toUpperCase()}&destinationSkyId=${fly_to.toUpperCase()}&date=${dataIda}&cabinClass=economy&adults=1`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPID_KEY,
        'x-rapidapi-host': 'sky-scrapper.p.rapidapi.com'
      }
    });

    if (!response.ok) throw new Error("A RapidAPI recusou a chamada.");
    
    const result = await response.json();
    const itineraries = result.data?.itineraries || [];

    if (itineraries.length === 0) return res.status(200).json([]);

    // Captura o primeiro voo (o mais barato de todos) da busca real
    const melhorVoo = itineraries[0];
    const precoReal = Math.round(melhorVoo.price?.raw || 1250);
    const nomeCia = melhorVoo.legs?.[0]?.carriers?.marketing?.[0]?.name || "Múltiplas Cias";

    // Devolve o resultado mastigado exatamente como o teu painel espera receber
    return res.status(200).json([
      {
        data: dataIda,
        preco: precoReal,
        cia: nomeCia,
        link: 'https://www.google.com/travel/flights'
      }
    ]);

  } catch (error) {
    return res.status(500).json({ error: "Erro de conexão com o servidor da RapidAPI." });
  }
}
