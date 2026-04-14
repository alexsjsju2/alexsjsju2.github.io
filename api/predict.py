import os, json, logging, re, random
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

def get_available_model():
    fallback = [
    "Gemini 2.5 Flash",
    "Gemini 3 Flash",
    "Gemini 2.5 Flash Lite",
    "Gemma 3 27B",
    "Gemma 3 12B",
    "Gemma 3 4B",
    "Gemma 3 2B",
    "Gemma 3 1B"
    ]
    try:
        models = genai.list_models()
        available = [m.name for m in models if "generateContent" in m.supported_generation_methods]
        return available[0] if available else fallback[0]
    except:
        return fallback[0]

MODEL_NAME = get_available_model()
model = genai.GenerativeModel(MODEL_NAME)

def extract_json(text):
    if not text:
        return None
    text = re.sub(r"```json|```", "", text).strip()
    match = re.search(r"\{.*\}", text, re.S)
    if match:
        try:
            return json.loads(match.group(0))
        except:
            return None
    return None

@app.route("/api/predict", methods=["POST"])
def predict():
    data = request.json or {}
    history = data.get("history", [])
    selected = data.get("selected", "")

    prompt = f"""
Genera 3 possibili futuri.

Contesto: {" -> ".join(history)}
Scelta: {selected}

Regole:
- 3 risposte: positiva, neutra, negativa
- Ogni risposta:
    titolo (max 3 parole)
    descrizione
    probabilità (0-100)
    fattori: tempo, risorse, rischio, variabili_esterne

Formato JSON:
{{
 "results":[
   {{
    "title":"",
    "description":"",
    "probability":0,
    "factors":{{"tempo":0,"risorse":0,"rischio":0,"variabili":0}}
   }}
 ]
}}
"""

    try:
        res = model.generate_content(prompt)
        parsed = extract_json(res.text)

        if not parsed:
            raise Exception("Parsing fallito")

        return jsonify(parsed)

    except Exception as e:
        logging.error(e)

        return jsonify({
            "results": [
                {"title":"Successo","description":"Esito positivo","probability":random.randint(60,90),
                 "factors":{"tempo":70,"risorse":60,"rischio":20,"variabili":40}},
                {"title":"Stabile","description":"Risultato neutro","probability":random.randint(40,70),
                 "factors":{"tempo":50,"risorse":50,"rischio":40,"variabili":50}},
                {"title":"Fallimento","description":"Esito negativo","probability":random.randint(10,40),
                 "factors":{"tempo":30,"risorse":20,"rischio":80,"variabili":70}}
            ]
        })

if __name__ == "__main__":
    app.run(port=8080)
