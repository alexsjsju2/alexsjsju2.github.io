export function handleCors(req, res) {
  const allowedOrigin = "https://alexsjsju2.github.io";

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  if (req.headers.origin !== allowedOrigin) {
    res.status(403).json({ error: "Forbidden origin" });
    return true;
  }

  return false;
}
