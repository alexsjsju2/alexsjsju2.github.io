export default function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }

  if (req.method === 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const { step, value } = req.body;

    if (step === 'username') {
      if (value === process.env.nn_scc) {
        res.status(200).json({ valid: true });
      } else {
        res.status(200).json({ valid: false });
      }
    } else if (step === 'password') {
      if (value === process.env.KEY_O) {
        const onion = JSON.parse(process.env.rr_scc || '[]');
        const watching = JSON.parse(process.env.wr_scc || '[]');
        res.status(200).json({ valid: true, data: { onion, watching } });
      } else {
        res.status(200).json({ valid: false });
      }
    } else {
      res.status(400).json({ error: 'Invalid step' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
