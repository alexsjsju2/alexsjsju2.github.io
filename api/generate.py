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

def get_available_model(preferred_version='2.5-pro'):
    fallback_models = [
        'gemini-2.5-pro',
        'gemini-2.5-flash',
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

@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.json or {}
    user_prompt = data.get("prompt", "")
    if not user_prompt:
        return jsonify({"error": "Prompt mancante"}), 400

    logging.info("Nuova richiesta generazione")

    system_prompt = f"""
Sei un AI senior web developer.

REQUISITI:

- design moderno, responsive, mobile-friendly
- dark/light mode
- non restituire JSON, non inserire commenti inutili
- il css, js, html deve stare in un unico index, Nessun file esterno.

Richiesta utente:
{user_prompt}
"""

    try:
        response = model.generate_content(
            system_prompt,
            generation_config={
                "temperature": 0.7,
                "max_output_tokens": 8192,
                "response_mime_type": "text/plain"
            }
        )

        html_code = response.text or ""
        return jsonify({"index": html_code})

    except Exception as e:
        logging.exception("Errore generazione")
        return jsonify({"error": str(e)}), 500

@app.route("/")
def health():
    return {"status": "ok", "model": MODEL_NAME}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
