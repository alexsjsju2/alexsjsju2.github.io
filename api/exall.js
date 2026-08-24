import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  const allowedOrigins = [
    "https://www.alextools.online",
    "https://alextools.online"
  ];

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY non configurata sul server"
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3, 
        maxOutputTokens: 4096
      }
    });

    const {
      type,
      query,
      chain,
      targetTitle
    } = req.body || {};

    let prompt = "";

    if (type === "initial") {
      prompt = `Restituisci UN UNICO OGGETTO JSON valido. Non aggiungere testo descrittivo, preamboli o markdown oltre al JSON richiesto.

Argomento cercato: "${query}"

Genera esattamente 20 titoli condensati e rilevanti correlati al tema. Per ogni titolo, includi facoltativamente una lista di sottotitoli correlati.

Usa rigorosamente questa struttura JSON:
{
  "titles": [
    {
      "title": "Titolo 1",
      "subtitles": ["Sotto 1", "Sotto 2"]
    }
  ]
}`;
    }

    else if (type === "expand") {
      prompt = `Restituisci UN UNICO OGGETTO JSON valido. Nessun testo extra.

Percorso contestuale:
${JSON.stringify(chain)}

Genera tra 3 e 7 nuovi titoli correlati ed espansi per approfondire l'ultimo elemento della catena.

Usa rigorosamente questa struttura JSON:
{
  "titles": [
    "Nuovo Titolo 1",
    "Nuovo Titolo 2"
  ]
}`;
    }

    else if (type === "describe") {
      prompt = `Restituisci UN UNICO OGGETTO JSON valido. Nessun testo extra.

Percorso contestuale:
${JSON.stringify(chain)}

Fornisci una descrizione sintetica e dettagliata per il titolo: "${targetTitle}"

Usa rigorosamente questa struttura JSON:
{
  "description": "Spiegazione chiara ed esplicativa..."
}`;
    }

    else {
      return res.status(400).json({
        error: "Tipo di richiesta non valido"
      });
    }

    const result = await model.generateContent(prompt);
    let text = result.response.text();

    text = text.replace(/^```(json)?|```$/gi, '').trim();

    let json;

    try {
      json = JSON.parse(text);
    } catch (parseError) {
      console.error("Risposta Gemini non valida:", text);

      return res.status(502).json({
        error: "Gemini ha restituito una risposta JSON non valida",
        details: text
      });
    }

    return res.status(200).json(json);

  } catch (error) {
    console.error("API error:", error);

    return res.status(500).json({
      error: error.message || "Errore interno del server"
    });
  }
}
