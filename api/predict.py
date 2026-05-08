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

AVAILABLE_MODELS = {
    "gemini-2.5-flash": "models/gemini-2.5-flash",
    "gemini-3-flash": "models/gemini-3-flash",
    "gemma-3-27b": "models/gemma-3-27b"
}

def get_model_instance(model_name):
    try:
        model_path = AVAILABLE_MODELS.get(model_name, "models/gemini-2.5-flash")
        return genai.GenerativeModel(model_path)
    except:
        return genai.GenerativeModel("models/gemini-2.5-flash")

current_model = get_model_instance("gemini-2.5-flash")

@app.route("/api/predict", methods=["POST"])
def predict():
    global current_model

    data = request.json or {}
    history = data.get("history", [])
    comments = data.get("comments", [])
    selected = data.get("selected", "")
    requested_model = data.get("model") 

    if requested_model and requested_model in AVAILABLE_MODELS:
        current_model = get_model_instance(requested_model)

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

3. Altrimenti genera fino a 8-10 futuri realistici (non limitarti a 3) usando logica quantistica (molti mondi / rami possibili) e rispondi SOLO con:
{{
  "results": [
    {{"title": "...", "description": "...", "probability": 0}},
    ...
  ]
}}

Titoli max 4 parole. Descrizioni 2-4 frasi realistiche. Puoi generare da 2 a 10 rami in base alla complessità."""

    try:
        response = current_model.generate_content(prompt)
        parsed = extract_json(response.text)
        
        logging.info(f"Modello usato: {requested_model or 'default'} | Risultati generati: {len(parsed.get('results', [])) if parsed else 0}")
        
        return jsonify(parsed if parsed else {"results": []})
        
    except Exception as e:
        logging.exception("Errore Gemini")
        return jsonify({"results": []}), 500


def extract_json(text):
    if not text: return None
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.S).strip()
    try:
        return json.loads(t)
    except:
        return None


@app.route("/")
def home():
    return jsonify({
        "status": "ok", 
        "current_model": str(current_model.model_name),
        "available_models": list(AVAILABLE_MODELS.keys())
    })


if __name__ == "__main__":
    app.run(port=8080, debug=True)
