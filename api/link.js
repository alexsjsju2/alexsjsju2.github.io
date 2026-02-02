import universal from 'https://apisecurity-iota.vercel.app/universal.js';

export default async function handler(req, res) {
  const key = 'link';
  try {
    if (req.method === 'GET') {
      const data = await universal.read(process.env.FIREBASE_SERVICE_ACCOUNT, key);
      res.status(200).json({ value: data.value || '' });
    } else if (req.method === 'POST') {
      const { value } = req.body;
      if (!value) return res.status(400).json({ error: 'Link mancante' });
      await universal.write(process.env.FIREBASE_SERVICE_ACCOUNT, key, value);
      res.status(200).json({ success: true });
    } else {
      res.status(405).json({ error: 'Metodo non consentito' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
