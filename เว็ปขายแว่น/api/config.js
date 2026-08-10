// api/config.js
// GET  /api/config  -> ดึงค่าตั้งค่าร้าน (ไม่ส่ง adminPassword กลับ)
// POST /api/config  -> { verifyPassword } ตรวจรหัสผ่านแอดมิน (คืนแค่ ok: true/false ไม่ส่งรหัสจริงกลับ)
//                    -> หรือ { promptpayId?, lowStockThreshold?, adminPassword?, shopPhone?, shopAddress? } อัปเดตค่าตั้งค่า

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
      const { verifyPassword, promptpayId, lowStockThreshold, adminPassword, shopPhone, shopAddress } = req.body || {};

      if (verifyPassword !== undefined) {
        const { data, error } = await supabase.from('store_config').select('admin_password').eq('id', 1).single();
        if (error) throw error;
        res.status(200).json({ ok: verifyPassword === data.admin_password });
        return;
      }

      const patch = {};
      if (promptpayId != null) patch.promptpay_id = promptpayId;
      if (lowStockThreshold != null) patch.low_stock_threshold = lowStockThreshold;
      if (adminPassword != null) patch.admin_password = adminPassword;
      if (shopPhone != null) patch.shop_phone = shopPhone;
      if (shopAddress != null) patch.shop_address = shopAddress;

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
