// api/config.js
// GET  /api/config  -> ดึงค่าตั้งค่าร้าน (ไม่ส่ง adminPassword กลับ)
// POST /api/config  -> อัปเดตค่าตั้งค่า { promptpayId?, lowStockThreshold?, adminPassword? }

import { getSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  const supabase = getSupabase();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('store_config').select('*').eq('id', 1).single();
      if (error) throw error;
      const { admin_password, ...safe } = data;
      res.status(200).json(safe);
      return;
    }

    if (req.method === 'POST') {
      const { promptpayId, lowStockThreshold, adminPassword } = req.body || {};
      const patch = {};
      if (promptpayId != null) patch.promptpay_id = promptpayId;
      if (lowStockThreshold != null) patch.low_stock_threshold = lowStockThreshold;
      if (adminPassword != null) patch.admin_password = adminPassword;

      const { error } = await supabase.from('store_config').update(patch).eq('id', 1);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
