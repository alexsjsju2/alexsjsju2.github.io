export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'application/json');

  const ca_f = process.env.CA_F;

  if (!ca_f) {
    return res.status(500).json({ error: 'Variabile CA_F non configurata' });
  }

  const parts = ca_f.split(' - ').map(part => part.trim());
  
  const sequence = parts.map(part => {
    const num = parseInt(part, 10);
    return isNaN(num) ? null : num;
  });

  if (sequence.includes(null) || sequence.length !== 4) {
    return res.status(400).json({ error: 'Formato CA_F non valido (atteso: "nnnn - nnnn - nnnn - nnnn")' });
  }

  res.status(200).json({ sequence });
}
