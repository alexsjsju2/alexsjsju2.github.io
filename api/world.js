export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.alextools.online');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt, system } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API Key mancante' });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Errore API Gemini');
    }

    const reply = data.candidates[0].content.parts[0].text;
    
    res.status(200).send(reply);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
