const admin=require('firebase-admin')
let db
try{
const serviceAccount=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
if(!admin.apps.length){
admin.initializeApp({credential:admin.credential.cert(serviceAccount)})
}
db=admin.firestore()
}catch(error){
console.error('Errore Firebase:',error)
}
export default async function handler(req,res){
res.setHeader('Access-Control-Allow-Origin','https://www.alexsjsju.eu')
res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS')
res.setHeader('Access-Control-Allow-Headers','Content-Type')
if(req.method==='OPTIONS')return res.status(200).end()
if(!db)return res.status(500).json({error:'Errore configurazione'})
const collection=db.collection('clients')
if(req.method==='GET'){
try{
const snapshot=await collection.get()
let clients=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}))
clients.sort((a,b)=>new Date(b.modified||0)-new Date(a.modified||0))
res.status(200).json(clients)
}catch(error){
res.status(500).json({error:'Errore recupero'})
}
}else if(req.method==='POST'){
try{
const clientData=req.body
if(!clientData.id)return res.status(400).json({error:'ID mancante'})
const docRef=collection.doc(clientData.id)
await docRef.set(clientData)
res.status(200).json({success:true,id:clientData.id})
}catch(error){
res.status(500).json({error:'Errore salvataggio'})
}
}else if(req.method==='DELETE'){
try{
const id=req.query.id
if(!id)return res.status(400).json({error:'ID mancante'})
await collection.doc(id).delete()
res.status(200).json({success:true})
}catch(error){
res.status(500).json({error:'Errore eliminazione'})
}
}else{
res.setHeader('Allow',['GET','POST','DELETE','OPTIONS'])
res.status(405).end(`Metodo ${req.method} non consentito`)
}
}
