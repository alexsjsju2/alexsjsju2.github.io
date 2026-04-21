import os, json, logging, re
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
    fallback_models = ["Gemini 3 Flash Live","Gemini 2.5 Flash","Gemini 3 Flash","Gemini 2.5 Flash Lite","Gemma 3 27B","Gemma 3 12B","Gemma 3 4B","Gemma 3 2B","Gemma 3 1B"]
    try:
        models = genai.list_models()
        available = [m.name for m in models if "generateContent" in m.supported_generation_methods]
        return available[0] if available else fallback_models[0]
    except:
        return fallback_models[0]

MODEL_NAME = get_available_model()
model = genai.GenerativeModel(MODEL_NAME)

def extract_json(text):
    if not text: return None
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.S).strip()
    try:
        return json.loads(t)
    except:
        return None

@app.route("/api/predict", methods=["POST"])
def predict():
    data = request.json or {}
    history = data.get("history", [])
    comments = data.get("comments", [])
    selected = data.get("selected", "")

    context = " → ".join(history)
    comments_text = " | ".join(comments)

    prompt = f"""Sei un sistema di previsione del futuro estremamente preciso.

INPUT:
{context}

SCELTA ATTUALE:
{selected}

COMMENTI AGGIUNTIVI:
{comments_text}

ISTRUZIONI:
1. Valuta se hai abbastanza dettagli (chi, cosa, quando, dove, contesto, rischi).
2. Se i dati sono troppo vaghi → restituisci SOLO JSON con domande:
{{
  "questions": ["Domanda specifica 1?", "Domanda specifica 2?"],
  "message": "Per una previsione più accurata rispondi a queste domande"
}}

3. Altrimenti genera 3 futuri realistici (positivo / bilanciato / negativo) e rispondi SOLO con:
{{
  "results": [
    {{"title": "...", "description": "...", "probability": 0}},
    ...
  ]
}}

Titoli max 3 parole. Descrizioni 2-3 frasi realistiche. Probabilità basate su logica (somma ≈100)."""

    try:
        response = model.generate_content(prompt)
        parsed = extract_json(response.text)
        return jsonify(parsed if parsed else {"results": []})
    except Exception as e:
        logging.exception("Errore Gemini")
        return jsonify({"results": []}), 500

@app.route("/")
def home():
    return jsonify({"status": "ok", "model": MODEL_NAME})

if __name__ == "__main__":
    app.run(port=8080, debug=True)
