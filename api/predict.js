import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

async function getModel(){
const models=[
'Gemini 2.5 Flash',
'Gemini 3 Flash',
'Gemini 2.5 Flash Lite',
'Gemma 3 27B',
'Gemma 3 12B',
'Gemma 3 4B',
'Gemma 3 2B',
'Gemma 3 1B'
]
for(const m of models){
try{
return genAI.getGenerativeModel({model:m})
}catch{}
}
return genAI.getGenerativeModel({model:"gemini-2.5-flash"})
}

export default async function handler(req, res) {

res.setHeader("Access-Control-Allow-Origin", "*")
res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
res.setHeader("Access-Control-Allow-Headers", "Content-Type")

if (req.method === "OPTIONS") {
return res.status(200).end()
}

if (req.method !== "POST") {
return res.status(405).json({ error: "Method not allowed" })
}

try {
const { history = [] } = req.body

const response = await fetch(
`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
{
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({
contents: [{
parts: [{
text: `
Percorso: ${history.join(" -> ")}

Genera 15-20 possibili prossime scelte.

REGOLE:
- brevi (1-3 parole)
- diverse tra loro
- utili per decisioni, studio, vita, esplorazione

Formato:
{"options":["..."]}
`
}]
}]
})
}
)

const data = await response.json()
let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ""

try {
const parsed = JSON.parse(text)
return res.status(200).json(parsed)
} catch {
return res.status(200).json({
options: ["Fallback","Nuova idea","Alternativa","Esplora","Altro"]
})
}

} catch (e) {
return res.status(500).json({
options: ["Errore","Riprova","Fallback","Nuovo","Altro"]
})
}
}
