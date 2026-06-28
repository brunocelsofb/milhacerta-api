export default async function handler(req, res) {
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; 
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fly_from, fly_to, date_from, date_to } = req.query;

  // Validação de entrada
  if (!fly_from || !fly_to || !date_from || !date_to) {
    return res.status(400).json({ error: "Faltam parâmetros obrigatórios." });
  }
  
  const dateRe = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!dateRe.test(date_from) || !dateRe.test(date_to)) {
    return res.status(400).json({ error: "Formatos de data inválidos. Use DD/MM/AAAA." });
  }

  const API_KEY = process.env.KIWI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "Chave de API (KIWI_API_KEY) ausente no servidor." });
  }

  const params = new URLSearchParams({ 
    fly_from, 
    fly_to, 
    date_from, 
    date_to, 
    curr: 'BRL', 
    max_stopovers: '1', 
    limit: '5' 
  });
  
  const kiwiUrl = `https://api.tequila.kiwi.com/v2/search?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8 segundos de timeout
    
    const response = await fetch(kiwiUrl, { 
      method: 'GET', 
      headers: { apikey: API_KEY }, 
      signal: controller.signal 
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const detalhe = await response.text().catch(() => '');
      return res.status(response.status).json({ error: "Erro na resposta da Kiwi", detalhe });
    }
    
    const data = await response.json();
    const voos = Array.isArray(data.data) ? data.data : [];

    return res.status(200).json(voos.map(voo => ({
      data: voo.local_departure?.split('T')[0] ?? null,
      preco: voo.price,
      cia: voo.airlines?.[0] ?? '—',
      link: voo.deep_link
    })));
    
  } catch (error) {
    const msg = error.name === 'AbortError' ? "A Kiwi demorou demais para responder." : "Falha interna no proxy.";
    return res.status(500).json({ error: msg });
  }
}
