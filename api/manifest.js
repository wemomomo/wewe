export default function handler(req, res) {
  const iconChoice = req.query.icon || 'heart';
  let iconUrl = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%2388abda'/><text x='50%' y='55%' font-size='45' text-anchor='middle' dominant-baseline='middle' fill='white'>♡</text></svg>";
  let iconType = "image/svg+xml";

  if (iconChoice === 'icon1') {
    iconUrl = "/97A2A7C7-37EE-4B08-A7AC-FA77A29FA6ED.jpeg";
    iconType = "image/jpeg";
  } else if (iconChoice === 'icon2') {
    iconUrl = "/E87530F1-A12E-4235-A9E6-2E279F85656F.jpeg";
    iconType = "image/jpeg";
  }

  const manifest = {
    name: "Niveous",
    short_name: "Niveous",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    orientation: "portrait",
    icons: [
      {
        src: iconUrl,
        sizes: "192x192 512x512",
        type: iconType,
        purpose: "any maskable"
      }
    ]
  };

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).json(manifest);
}
