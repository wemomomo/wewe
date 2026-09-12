export default function handler(req, res) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180">
    <rect width="180" height="180" fill="#88abda"/>
    <text x="50%" y="54%" font-size="82" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif">♡</text>
  </svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.status(200).send(svg);
}
