// api/track.js
// POST /api/track { eventType, visitorId } -> บันทึกอีเวนต์ไว้นับสถิติ (ไม่เก็บข้อมูลระบุตัวตนใดๆ)
// เรียกแบบ fire-and-forget จากฝั่งลูกค้า (ไม่รอผล ไม่ให้กระทบความเร็วของหน้าร้าน)

import { getSupabase } from './_lib/supabase.js';

const ALLOWED_EVENT_TYPES = new Set(['pageview', 'add_to_cart']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { eventType, visitorId } = req.body || {};
  if (!ALLOWED_EVENT_TYPES.has(eventType) || !visitorId || typeof visitorId !== 'string') {
    res.status(400).json({ error: 'invalid eventType or visitorId' });
    return;
  }

  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('analytics_events').insert({
      event_type: eventType,
      visitor_id: visitorId.slice(0, 100),
    });
    if (error) throw error;
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
