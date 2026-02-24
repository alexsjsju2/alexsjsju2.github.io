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


def get_available_model(preferred_version='2.5-pro-exp'):
    fallback_models = [
        'gemini-2.5-pro-exp',
        'gemini-1.5-pro-latest',
        'gemini-1.5-flash',
        'gemini-pro'
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


def extract_code_blocks(text):
    """Estrae html/css/js se l'AI non manda JSON."""
    result = {
        "index": "",
        "html": "",
        "css": "",
        "js": ""
    }

    try:
        json_match = re.search(r'\{.*\}', text, re.S)
        if json_match:
            parsed = json.loads(json_match.group())
            result.update(parsed)
            return result
    except:
        pass

    blocks = re.findall(r"```(\w+)?\n(.*?)```", text, re.S)

    for lang, code in blocks:
        lang = (lang or "").lower()

        if "html" in lang:
            result["html"] = code
        elif "css" in lang:
            result["css"] = code
        elif "js" in lang or "javascript" in lang:
            result["js"] = code

    if "<html" in text.lower():
        result["index"] = text

    return result


@app.route("/api/generate", methods=["POST"])
def generate():

    data = request.json or {}
    user_prompt = data.get("prompt", "")

    if not user_prompt:
        return jsonify({"error": "Prompt mancante"}), 400

    logging.info("Nuova richiesta generazione")

    system_prompt = f"""
Sei un AI senior web developer.

Genera UN SOLO FILE index.html completo (HTML+CSS+JS inline).

REQUISITI:
- codice lungo e completo
- design moderno
- mobile responsive
- niente spiegazioni
- output JSON:

{{
 "index": "...",
 "html": "...",
 "css": "...",
 "js": "..."
}}

Richiesta utente:
{user_prompt}
"""

    try:
        response = model.generate_content(
            system_prompt,
            generation_config={
                "temperature": 0.7,
                "max_output_tokens": 8192
            }
        )

        text = response.text

        parsed = extract_code_blocks(text)

        if not parsed["index"]:
            parsed["index"] = text

        return jsonify(parsed)

    except Exception as e:
        logging.exception("Errore generazione")
        return jsonify({"error": str(e)}), 500


@app.route("/")
def health():
    return {"status": "ok", "model": MODEL_NAME}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
