import os
import json
import re
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai

app = Flask(__name__)
CORS(app)

MODELS_TO_TRY = [
    "Gemini 2.5 Flash",
    "Gemini 3 Flash",
    "Gemini 2.5 Flash Lite",
    "Gemma 3 27B",
    "Gemma 3 12B",
    "Gemma 3 4B",
    "Gemma 3 2B",
    "Gemma 3 1B"
]

api_key = os.environ.get("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

def extract_json(text):
    if not text:
        return None
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.I | re.S).strip()
    m = re.search(r"(\[.*\]|\{.*\})", t, re.S)
    if m:
        t = m.group(0)
    try:
        return json.loads(t)
    except:
        return None

@app.route("/api/predict", methods=["POST", "OPTIONS"])
def predict():
    if request.method == "OPTIONS":
        return jsonify({}), 200

    data = request.json or {}
    history = [str(x).strip() for x in data.get("history", []) if str(x).strip()]
    selected = str(data.get("selected", "")).strip()
    depth = int(data.get("depth", len(history) + 1))

    percorso = " → ".join(history) if history else "Scenario iniziale"

    prompt = f"""
Sei un esperto di previsione del futuro altamente realistico.
Devi generare **esattamente 3 previsioni** bilanciate per il seguente scenario:

PERCORSO: {percorso}
SCELTA ATTUALE: {selected}
LIVELLO: {depth}

Regole obbligatorie:
- Esattamente 3 previsioni:
  1. Ottimista / positiva (probabilità alta)
  2. Realistica / bilanciata (probabilità media)
  3. Pessimista / negativa (probabilità bassa)
- Ogni previsione deve avere:
  • "title": massimo 3 parole (titolo breve e incisivo)
  • "description": descrizione dettagliata (2-4 frasi)
  • "probability": numero intero tra 12 e 92
- Risposte in italiano, concrete, realistiche e diverse tra loro.
- NON ripetere concetti già presenti nel percorso.

Restituisci **SOLO** un JSON valido:

[
  {{"title": "...", "description": "...", "probability": 78}},
  {{"title": "...", "description": "...", "probability": 51}},
  {{"title": "...", "description": "...", "probability": 29}}
]
"""

    for model_name in MODELS_TO_TRY:
        try:
            model = genai.GenerativeModel(model_name)
            
            response = model.generate_content(
                prompt,
                generation_config={
                    "response_mime_type": "application/json",
                    "temperature": 0.85,
                    "top_p": 0.95,
                    "max_output_tokens": 1800
                }
            )

            parsed = extract_json(response.text)

            if isinstance(parsed, list) and len(parsed) >= 3:
                clean_predictions = []
                seen = set()

                for p in parsed[:3]:
                    if not isinstance(p, dict):
                        continue
                    title = str(p.get("title", "")).strip()
                    if not title or title.lower() in seen:
                        continue
                    seen.add(title.lower())

                    clean_predictions.append({
                        "title": title,
                        "description": str(p.get("description", "Previsione basata sul percorso scelto.")).strip(),
                        "probability": int(p.get("probability", 50))
                    })

                while len(clean_predictions) < 3:
                    clean_predictions.append({
                        "title": f"Previsione {len(clean_predictions)+1}",
                        "description": "Scenario futuro plausibile.",
                        "probability": 45
                    })

                return jsonify({"predictions": clean_predictions[:3]})

        except Exception:
            continue

    fallback = [
        {"title": "Crescita forte", "description": "Il percorso scelto porta a risultati molto positivi grazie a fattori favorevoli.", "probability": 74},
        {"title": "Sviluppo stabile", "description": "Evoluzione lineare con qualche ostacolo gestibile.", "probability": 52},
        {"title": "Rallentamento", "description": "Imprevisti esterni limitano fortemente i risultati attesi.", "probability": 28}
    ]
    return jsonify({"predictions": fallback}), 200


@app.route("/")
def health():
    return jsonify({
        "status": "ok",
        "models": MODELS_TO_TRY,
        "version": "2.1 - Previsioni Futuro (Multi-Model Fallback)"
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
