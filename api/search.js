export default async function handler(req, res) {
  // Libera o acesso para o seu painel visual ler os dados
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fly_from, fly_to, date_from, date_to } = req.query;

  // 1. Validação estrita de parâmetros
  if (!fly_from || !fly_to || !date_from || !date_to) {
    return res.status(400).json({ error: "Parâmetros de rota ou data ausentes." });
  }

  // 2. Verificação do Cofre de Segurança na Vercel
  const API_KEY = process.env.KIWI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ 
      error: "Servidor sem acesso à Kiwi.", 
      detalhe: "A variável KIWI_API_KEY está vazia ou não foi configurada nas propriedades da Vercel." 
    });
  }

  // 3. Montagem dos parâmetros reais da API Tequila Kiwi
  const params = new URLSearchParams({
    fly_from: fly_from.toUpperCase(),
    fly_to: fly_to.toUpperCase(),
    date_from: date_from, // Formato DD/MM/AAAA (enviado pelo novo index.html)
    date_to: date_to,
    curr: 'BRL',          // Força o retorno da moeda em Reais
    max_stopovers: '1',   // Filtra para voos diretos ou com no máximo 1 escala
    limit: '3'            // Traz apenas os resultados mais baratos
  });
  
  const kiwiUrl = `https://api.tequila.kiwi.com/v2/search?${params.toString()}`;

  try {
    // 4. Chamada de rede REAL para os servidores da Kiwi
    const response = await fetch(kiwiUrl, {
      method: 'GET',
      headers: { 'apikey': API_KEY }
    });

    if (!response.ok) {
      const textoErro = await response.text();
      return res.status(response.status).json({ error: "A Kiwi recusou a chamada", detalhe: textoErro });
    }
    
    const data = await response.json();
    const voos Reais = data.data || [];

    if (voosReais.length === 0) {
      return res.status(200).json([]); // Retorna vazio se não houver assentos
    }

    // 5. Captura o voo mais barato real e mapeia os dados para o painel
    const melhorVoo = voosReais[0];
    
    return res.status(200).json([
      {
        data: melhorVoo.local_departure?.split('T')[0] ?? date_from,
        preco: melhorVoo.price,                        // PREÇO REAL EM REAIS
        cia: melhorVoo.airlines?.[0] ?? 'Múltiplas',    // COMPANHIA REAL DO VOO
        link: melhorVoo.deep_link                       // LINK REAL DE COMPRA
      }
    ]);
    
  } catch (error) {
    return res.status(500).json({ error: "Falha na conexão de rede com a API da Kiwi." });
  }
}
