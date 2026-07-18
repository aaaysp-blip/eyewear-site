// Vercel Serverless Function
// Path on disk: /api/analyze-image.js
// Deployed URL: https://<your-site>.vercel.app/api/analyze-image
//
// This is the piece that makes the "✨ ให้ AI อ่านข้อมูลจากภาพ" button in
// admin.html work once the site is deployed for real. The website never
// sees or holds the Anthropic API key — only this server-side function
// does, via an environment variable.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { imageBase64, mediaType, prompt } = req.body || {};

  if (!imageBase64 || !prompt) {
    res.status(400).json({ error: 'imageBase64 and prompt are required' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });
    return;
  }

  try {
    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      res.status(anthropicResp.status).json({ error: `Anthropic API error: ${errText}` });
      return;
    }

    const data = await anthropicResp.json();
    const text = (data.content || []).map((c) => c.text || '').join('');

    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
