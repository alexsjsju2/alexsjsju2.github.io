export const config = { api: { bodyParser: { sizeLimit: '100kb' } } };

const cache = new Map();
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "https://alextools.online");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(200).end();
  }

  if (req.headers.origin && req.headers.origin !== "https://alextools.online") { 
    return res.status(403).json({ error: "Forbidden origin" });
  }

  res.setHeader("Access-Control-Allow-Origin", "https://alextools.online");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const ip = req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0";
  const now = Date.now();
  const ipData = cache.get(ip) || { count: 0, ts: now };

  if (now - ipData.ts > 60000) {
    ipData.count = 1;
    ipData.ts = now;
  } else {
    ipData.count++;
    if (ipData.count > 20) {
      return res.status(429).json({ error: "Too Many Requests" });
    }
  }
  cache.set(ip, ipData);

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const key = auth.split(" ")[1];
  if (key.length < 30 || !/^[A-Za-z0-9_-]+$/.test(key)) {
    return res.status(400).json({ error: "Invalid Key Format" });
  }

  const { contents } = req.body;
  if (!contents || !Array.isArray(contents) || contents.length === 0 || contents.length > 10) {
    return res.status(400).json({ error: "Invalid payload format" });
  }

  try {
    const payloadStr = JSON.stringify({ contents });
    if (payloadStr.length > 15000) {
      return res.status(413).json({ error: "Payload too large" });
    }

    const geminiReq = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payloadStr
    });

    const data = await geminiReq.json();
    return res.status(geminiReq.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
