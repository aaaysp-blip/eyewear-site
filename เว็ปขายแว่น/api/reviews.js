// api/reviews.js
// GET    /api/reviews             -> รีวิวทั้งหมด
// POST   /api/reviews             -> สร้างรีวิวใหม่ { orderId, phone, customerName, rating, comment }
// PATCH  /api/reviews             -> { id, rating?, comment? } แก้ไขรีวิว
// DELETE /api/reviews?id=xxx      -> ลบรีวิว

import { getSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  const supabase = getSupabase();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      res.status(200).json(data);
      return;
    }

    if (req.method === 'POST') {
      const { orderId, phone, customerName, rating, comment } = req.body || {};
      const { data, error } = await supabase
        .from('reviews')
        .insert({
          order_id: orderId,
          phone,
          customer_name: customerName || 'ลูกค้า',
          rating: Math.max(1, Math.min(5, Math.round(Number(rating) || 5))),
          comment: (comment || '').trim(),
        })
        .select()
        .single();
      if (error) throw error;
      res.status(200).json(data);
      return;
    }

    if (req.method === 'PATCH') {
      const { id, rating, comment } = req.body || {};
      if (!id) { res.status(400).json({ error: 'id is required' }); return; }
      const patch = { updated_at: new Date().toISOString() };
      if (rating != null) patch.rating = Math.max(1, Math.min(5, Math.round(Number(rating))));
      if (comment != null) patch.comment = String(comment).trim();
      const { data, error } = await supabase.from('reviews').update(patch).eq('id', id).select().single();
      if (error) throw error;
      res.status(200).json(data);
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id || (req.body && req.body.id);
      if (!id) { res.status(400).json({ error: 'id is required' }); return; }
      const { error } = await supabase.from('reviews').delete().eq('id', id);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
