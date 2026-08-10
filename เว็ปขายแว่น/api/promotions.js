// api/promotions.js
// GET    /api/promotions                    -> รายการโปรโมชั่นทั้งหมด
// POST   /api/promotions                    -> สร้างโค้ดใหม่ { code, maxUses, type, discountAmount }
// PATCH  /api/promotions  { id, active }    -> เปิด/ปิดใช้งานโค้ด
// PATCH  /api/promotions  { code, action }  -> action: 'apply' | 'redeem' ตรวจ/นับการใช้โค้ด
// DELETE /api/promotions?id=xxx             -> ลบโค้ด

import { getSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  const supabase = getSupabase();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('promotions').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      res.status(200).json(data);
      return;
    }

    if (req.method === 'POST') {
      const { code, maxUses, type, discountAmount } = req.body || {};
      const promoType = type === 'amount' ? 'amount' : 'freeship';
      const { data, error } = await supabase
        .from('promotions')
        .insert({
          code: String(code).trim(),
          max_uses: Math.max(1, parseInt(maxUses, 10) || 1),
          type: promoType,
          discount_amount: promoType === 'amount' ? Math.max(1, Math.round(Number(discountAmount) || 0)) : 0,
        })
        .select()
        .single();
      if (error) throw error;
      res.status(200).json(data);
      return;
    }

    if (req.method === 'PATCH') {
      const { id, active, code, action } = req.body || {};

      if (code && action) {
        const { data: promo, error: fErr } = await supabase.from('promotions').select('*').ilike('code', String(code).trim()).single();
        if (fErr || !promo) { res.status(200).json({ ok: false, reason: 'notfound' }); return; }

        if (action === 'apply') {
          if (!promo.active) { res.status(200).json({ ok: false, reason: 'inactive' }); return; }
          if (promo.times_redeemed >= promo.max_uses) { res.status(200).json({ ok: false, reason: 'exhausted' }); return; }
          const { data, error } = await supabase.from('promotions').update({ times_applied: promo.times_applied + 1 }).eq('id', promo.id).select().single();
          if (error) throw error;
          res.status(200).json({ ok: true, promotion: data });
          return;
        }
        if (action === 'redeem') {
          const { data, error } = await supabase.from('promotions').update({ times_redeemed: promo.times_redeemed + 1 }).eq('id', promo.id).select().single();
          if (error) throw error;
          res.status(200).json({ ok: true, promotion: data });
          return;
        }
        res.status(400).json({ error: 'invalid action' });
        return;
      }

      if (id != null && active != null) {
        const { error } = await supabase.from('promotions').update({ active: !!active }).eq('id', id);
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'invalid patch body' });
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id || (req.body && req.body.id);
      if (!id) { res.status(400).json({ error: 'id is required' }); return; }
      const { error } = await supabase.from('promotions').delete().eq('id', id);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
