export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'application/json');

  const cap_sec = process.env.CAP_SEC;

  if (!cap_sec) {
    return res.status(500).json({ error: 'Variabile CAP_SEC non configurata' });
  }

  res.status(200).json({ text: cap_sec });
}
