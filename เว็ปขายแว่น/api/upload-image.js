// api/upload-image.js
// POST { imageBase64, contentType } -> อัปโหลดรูปขึ้น Supabase Storage bucket "product-images"
// คืน { url } เป็น public URL ให้เอาไปเก็บแทน base64 ในคอลัมน์ images/images_original
// ทำให้ /api/products ไม่ต้องฝังรูปเป็น base64 อีกต่อไป (คือสาเหตุหลักที่ payload หนักและ cache ใช้ไม่ได้)

import { randomUUID } from 'crypto';
import { getSupabase } from './_lib/supabase.js';

const MAX_BYTES = 4 * 1024 * 1024; // 4MB — รูปที่ครอปแล้วฝั่ง client ปกติเล็กกว่านี้มาก กันไว้เผื่อ edge case

const MAGIC_BYTES = [
  { ext: 'jpg', mime: 'image/jpeg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { imageBase64 } = req.body || {};
  if (!imageBase64) {
    res.status(400).json({ error: 'imageBase64 is required' });
    return;
  }

  let buffer;
  try {
    buffer = Buffer.from(imageBase64, 'base64');
  } catch {
    res.status(400).json({ error: 'imageBase64 is not valid base64' });
    return;
  }

  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    res.status(400).json({ error: `Image size must be between 1 byte and ${MAX_BYTES} bytes` });
    return;
  }

  // เช็ค magic bytes จริง ไม่เชื่อ contentType ที่ client ส่งมาเฉยๆ
  const matched = MAGIC_BYTES.find((m) => m.check(buffer));
  if (!matched) {
    res.status(400).json({ error: 'File is not a recognized JPEG or PNG image' });
    return;
  }

  try {
    const supabase = getSupabase();
    const path = `products/${randomUUID()}.${matched.ext}`;
    const { error: upErr } = await supabase.storage
      .from('product-images')
      .upload(path, buffer, { contentType: matched.mime, upsert: false });
    if (upErr) throw upErr;

    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    res.status(200).json({ url: data.publicUrl });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
