export default async function handler(req, res) {
  const key = process.env.HYPERBEAM_PRODUCTION_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Chiave non trovata' });
  }

  try {
    const sessionResponse = await fetch('https://engine.hyperbeam.com/v0/vm', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        start_url: 'https://www.google.com', 
        timeout: {
          offline: null, 
          inactive: 600, 
          absolute: 3600 
        },
        width: 1280,
        height: 720,
        fps: 30,
        region: 'EU' 
      })
    });

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      throw new Error(`Failed to create Hyperbeam session: ${sessionResponse.status} - ${errorText}`);
    }

    const { embed_url, admin_token, session_id } = await sessionResponse.json();
    res.status(200).json({ embed_url, admin_token, session_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
