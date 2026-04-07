import os
import json
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai

app = Flask(__name__)
CORS(app)

api_key = os.environ.get("GEMINI_API_KEY")
logging.basicConfig(level=logging.INFO)

if api_key:
    genai.configure(api_key=api_key)
else:
    logging.warning("GEMINI_API_KEY non trovata.")

def get_available_model(preferred_version='2.5-flash'):
    fallback_models = [
        'Gemini 2.5 Flash',
        'Gemini 3 Flash',
        'Gemini 2.5 Flash Lite',
        'Gemma 3 27B',
        'Gemma 3 12B',
        'Gemma 3 4B',
        'Gemma 3 2B',
        'Gemma 3 1B'
    ]
    try:
        models = genai.list_models()
        available = [
            m.name for m in models
            if 'generateContent' in m.supported_generation_methods
        ]

        for m in available:
            if preferred_version in m:
                return m

        return available[0] if available else fallback_models[0]

    except Exception as e:
        logging.error(f"Errore list_models: {e}")
        return fallback_models[0]

MODEL_NAME = get_available_model()
logging.info(f"Uso modello: {MODEL_NAME}")
model = genai.GenerativeModel(MODEL_NAME)

@app.route("/api/predict", methods=["POST", "OPTIONS"])
def predict():
    if request.method == "OPTIONS":
        return jsonify({}), 200

    data = request.json or {}
    history = data.get("history", [])

    logging.info(f"Nuova richiesta predict - Percorso: {history}")

    percorso = " -> ".join(history) if history else ""

    prompt = f"""
Percorso: {percorso}

Genera 15-20 scelte brevi.
Formato JSON:
{{"options":["..."]}}
"""

    try:
        response = model.generate_content(
            prompt,
            generation_config={
                "response_mime_type": "text/plain"
            }
        )

        text = response.text or ""

        try:
            parsed = json.loads(text)
            if isinstance(parsed.get("options"), list):
                return jsonify(parsed)
            else:
                raise ValueError("JSON non valido")
        except:
            return jsonify({
                "options": ["Fallback", "Idea", "Alternativa", "Nuovo", "Altro"]
            })

    except Exception as e:
        logging.exception("Errore generazione")
        return jsonify({
            "options": ["Errore", "Riprova", "Fallback", "Nuovo", "Altro"]
        }), 500


@app.route("/")
def health():
    return jsonify({
        "status": "ok",
        "model": MODEL_NAME
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
