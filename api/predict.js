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
return genAI.getGenerativeModel({model:"gemini-1.5-flash"})
}

export default async function handler(req,res){
if(req.method!=="POST")return res.status(405).end()

const {history=[]}=req.body

const model=await getModel()

const prompt=`
Percorso attuale:
${history.join(" -> ")}

Genera tra 12 e 18 possibili prossime scelte.

REGOLE:
- brevi (1-3 parole)
- copertura ampia (idee diverse)
- utili per esplorazione, decisione, apprendimento, futuro
- niente duplicati

Formato JSON:
{"options":["..."]}
`

try{
const result=await model.generateContent(prompt)
const text=result.response.text()

let parsed
try{
parsed=JSON.parse(text)
}catch{
parsed={options:["Errore","Riprova","Nuova strada","Alternativa","Altro"]}
}

res.status(200).json(parsed)

}catch(e){
res.status(500).json({options:["Errore AI","Fallback","Ripeti","Nuovo","Altro"]})
}
}
