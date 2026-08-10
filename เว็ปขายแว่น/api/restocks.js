// api/restocks.js
// GET   /api/restocks  -> รายการใบสั่งซื้อเข้าสต็อกทั้งหมด (พร้อม items)
// POST  /api/restocks  -> สร้างใบสั่งซื้อใหม่ { items, note }
// PATCH /api/restocks  -> { id, itemId, qtyReceived } แก้จำนวนรับจริงของรายการเดียว
//                       -> { id, confirmReceive: true } ยืนยันตรวจรับ (status=2, received_at=now)

import { getSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  const supabase = getSupabase();

  try {
    if (req.method === 'GET') {
      const { data: restocks, error: rErr } = await supabase
        .from('restocks')
        .select('*')
        .order('created_at', { ascending: false });
      if (rErr) throw rErr;

      const { data: items, error: iErr } = await supabase.from('restock_items').select('*');
      if (iErr) throw iErr;

      const merged = restocks.map((r) => ({
        ...r,
        items: items.filter((it) => it.restock_id === r.id),
      }));

      res.status(200).json(merged);
      return;
    }

    if (req.method === 'POST') {
      const { items = [], note } = req.body || {};
      if (!items.length) {
        res.status(400).json({ error: 'items is required' });
        return;
      }

      const poNo = 'PO' + Date.now().toString().slice(-8);

      const { data: restock, error: rErr } = await supabase
        .from('restocks')
        .insert({ po_no: poNo, note: note || '', status: 1 })
        .select()
        .single();
      if (rErr) throw rErr;

      const itemRows = items.map((it) => ({
        restock_id: restock.id,
        product_id: it.productId,
        variant_id: it.variantId,
        code: it.code,
        name: it.name,
        color: it.color,
        qty_ordered: it.qtyOrdered,
        current_stock: it.currentStock,
        qty_received: it.qtyOrdered,
      }));
      const { data: insertedItems, error: iErr } = await supabase.from('restock_items').insert(itemRows).select();
      if (iErr) throw iErr;

      res.status(200).json({ ...restock, items: insertedItems });
      return;
    }

    if (req.method === 'PATCH') {
      const { id, itemId, qtyReceived, confirmReceive } = req.body || {};
      if (!id) {
        res.status(400).json({ error: 'id is required' });
        return;
      }

      if (itemId != null) {
        const { error } = await supabase
          .from('restock_items')
          .update({ qty_received: Math.max(0, parseInt(qtyReceived, 10) || 0) })
          .eq('id', itemId);
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }

      if (confirmReceive) {
        const { error } = await supabase
          .from('restocks')
          .update({ status: 2, received_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'itemId or confirmReceive is required' });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
