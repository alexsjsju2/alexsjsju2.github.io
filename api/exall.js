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
      model: "gemma-4-31b-it",
      generationConfig: {
        responseMimeType: "application/json"
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
      prompt = `L'utente cerca: "${query}".

Genera esattamente 20 titoli condensati e rilevanti correlati al tema.

Per ogni titolo, includi facoltativamente una lista di sottotitoli correlati.

Restituisci ESCLUSIVAMENTE un JSON con questo formato:

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
      prompt = `Dato il seguente percorso contestuale:

${JSON.stringify(chain)}

Genera tra 3 e 7 nuovi titoli correlati ed espansi per approfondire l'ultimo elemento della catena.

Restituisci ESCLUSIVAMENTE un JSON con questo formato:

{
  "titles": [
    "Nuovo Titolo 1",
    "Nuovo Titolo 2"
  ]
}`;
    }

    else if (type === "describe") {
      prompt = `Dato il seguente percorso contestuale:

${JSON.stringify(chain)}

Fornisci una descrizione sintetica e dettagliata per il titolo:

"${targetTitle}"

Restituisci ESCLUSIVAMENTE un JSON con questo formato:

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

    const text = result.response.text();

    let json;

    try {
      json = JSON.parse(text);
    } catch (parseError) {
      console.error("Risposta Gemini non valida:", text);

      return res.status(502).json({
        error: "Gemini ha restituito una risposta JSON non valida"
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
