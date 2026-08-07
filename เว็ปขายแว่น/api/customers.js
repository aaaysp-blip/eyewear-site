// api/customers.js
// GET /api/customers            -> ลูกค้าทั้งหมด
// GET /api/customers?phone=xxx  -> ลูกค้ารายเดียว + ประวัติออเดอร์

import { getSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  const supabase = getSupabase();

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const phone = req.query?.phone;

    if (phone) {
      const { data: customer, error: cErr } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .single();
      if (cErr) throw cErr;

      const { data: orders, error: oErr } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_phone', phone)
        .order('created_at', { ascending: false });
      if (oErr) throw oErr;

      const totalSpent = orders.reduce((s, o) => s + Number(o.total), 0);
      res.status(200).json({ ...customer, orders, totalSpent, orderCount: orders.length });
      return;
    }

    const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
