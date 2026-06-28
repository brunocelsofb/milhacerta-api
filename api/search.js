export default async function handler(req, res) {
  // Libera o CORS para o seu painel rodar de qualquer lugar
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fly_from, fly_to, date_from, date_to } = req.query;

  if (!fly_from || !fly_to || !date_from || !date_to) {
    return res.status(400).json({ error: "Faltam parâmetros no seu painel." });
  }

  try {
    // Chamada REAL para uma API de economia aberta (prova que o servidor acessa a internet)
    const exchangeResponse = await fetch('https://open.er-api.com/v6/latest/USD');
    const exchangeData = await exchangeResponse.json();
    const cotacaoDolar = exchangeData.rates?.BRL || 5.50;

    // Define um preço base em dólares dependendo do destino digitado
    let precoBaseUsd = fly_to.toUpperCase() === 'IAH' ? 780 : 260; 
    
    // Adiciona uma oscilação aleatória a cada clique para você ver o painel reagir ao vivo
    const oscilacaoMercado = Math.floor(Math.random() * 60) - 30; 
    const precoFinalBrl = Math.round((precoBaseUsd * cotacaoDolar) + oscilacaoMercado);

    // Devolve o JSON exatamente no formato que o seu painel espera
    return res.status(200).json([
      {
        data: date_from.split('/').reverse().join('-'),
        preco: precoFinalBrl,
        cia: fly_to.toUpperCase() === 'IAH' ? 'United Airlines' : 'LATAM Brasil',
        link: 'https://www.kiwi.com'
      }
    ]);

  } catch (error) {
    return res.status(500).json({ error: "Falha na simulação dinâmica do servidor." });
  }
}
