export default async function handler(req, res) {
  const key = process.env.HYPERBEAM_PRODUCTION_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Chiave non trovata' });
  }

  const { session_id } = req.query;
  if (!session_id) {
    return res.status(400).json({ error: 'session_id required' });
  }

  try {
    const response = await fetch(`https://engine.hyperbeam.com/v0/vm/${session_id}`, {
      headers: {
        'Authorization': `Bearer ${key}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch session status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
