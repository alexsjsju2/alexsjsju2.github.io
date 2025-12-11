export default function handler(req, res) {
  const key = process.env.HYPERBEAM_PRODUCTION_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Chiave non trovata' });
  }
  res.status(200).json({ key });
}
