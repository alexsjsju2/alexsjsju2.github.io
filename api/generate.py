import os
import json
import logging
import re

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
        'gemini-2.5-flash-lite',
        'gemini-2-flash-lite',
        'gemini-2.5-flash'
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

        for m in available:
            if 'pro' in m.lower():
                return m

        return available[0]

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

Genera un UNICO FILE index.html completo, pronto per essere salvato e aperto nel browser. 
Tutto deve essere inline: HTML, CSS, JS. Nessun file esterno (tranne font da Google Fonts o immagini esterne se necessario).

REQUISITI:
- codice pronto da copiare/incollare
- design moderno, responsive, mobile-friendly
- dark/light mode
- animazioni e sfere/effetti sullo sfondo
- non restituire JSON, non usare markdown, no backticks, no commenti inutili
- tutto il CSS deve essere nel <style> interno
- tutto il JS deve essere in <script> interno
- il file deve funzionare standalone, apribile con doppio click o GitHub Pages/Vercel

Richiesta utente:
{user_prompt}
"""

    try:
        response = model.generate_content(
            system_prompt,
            generation_config={
                "temperature": 0.7,
                "max_output_tokens": 4096,
                "response_mime_type": "application/json"
            }
        )

        try:
            parsed = json.loads(response.text)
        except Exception:
            logging.warning("JSON non valido, uso fallback raw")
            parsed = {
                "index": response.text,
                "html": "",
                "css": "",
                "js": ""
            }

        if not parsed["index"]:
            parsed["index"] = response.text

        return jsonify(parsed)

    except Exception as e:
        logging.exception("Errore generazione")
        return jsonify({"error": str(e)}), 500


@app.route("/")
def health():
    return {"status": "ok", "model": MODEL_NAME}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
