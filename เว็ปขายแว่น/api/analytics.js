// api/analytics.js
// GET /api/analytics -> สรุปสถิติวันนี้ (ตามเวลาไทย) สำหรับหน้าแดชบอร์ดแอดมิน
// นับ "คน" แบบไม่ซ้ำ (distinct visitor_id) ไม่ใช่จำนวนครั้ง

import { getSupabase } from './_lib/supabase.js';

function startOfTodayThailandUtcIso() {
  const thaiDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()); // YYYY-MM-DD
  return new Date(`${thaiDateStr}T00:00:00+07:00`).toISOString();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabase();
    const sinceIso = startOfTodayThailandUtcIso();

    const { data: rows, error } = await supabase
      .from('analytics_events')
      .select('event_type, visitor_id')
      .gte('created_at', sinceIso);
    if (error) throw error;

    const pageviewVisitors = new Set(rows.filter((r) => r.event_type === 'pageview').map((r) => r.visitor_id));
    const addToCartVisitors = new Set(rows.filter((r) => r.event_type === 'add_to_cart').map((r) => r.visitor_id));

    res.status(200).json({
      pageviewVisitorsToday: pageviewVisitors.size,
      addToCartVisitorsToday: addToCartVisitors.size,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
