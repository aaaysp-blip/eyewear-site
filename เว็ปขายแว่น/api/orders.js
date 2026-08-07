// api/orders.js
// GET   /api/orders               -> รายการออเดอร์ทั้งหมด (พร้อม items)
// POST  /api/orders               -> สร้างออเดอร์ใหม่ (ลดสต็อกอัตโนมัติ + upsert ลูกค้า)
// PATCH /api/orders               -> อัปเดตสถานะ / เลขพัสดุ  { id, status?, trackingNo?, courier? }

import { getSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  const supabase = getSupabase();

  try {
    if (req.method === 'GET') {
      const { data: orders, error: oErr } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (oErr) throw oErr;

      const { data: items, error: iErr } = await supabase.from('order_items').select('*');
      if (iErr) throw iErr;

      const merged = orders.map((o) => ({
        ...o,
        items: items.filter((it) => it.order_id === o.id),
      }));

      res.status(200).json(merged);
      return;
    }

    if (req.method === 'POST') {
      const { items = [], total, customer } = req.body || {};
      if (!items.length || !customer?.phone) {
        res.status(400).json({ error: 'items and customer.phone are required' });
        return;
      }

      // upsert ลูกค้า
      await supabase.from('customers').upsert({
        phone: customer.phone,
        name: customer.name,
        line_id: customer.lineId,
        address: customer.address,
        subdistrict: customer.subdistrict,
        district: customer.district,
        province: customer.province,
        zipcode: customer.zipcode,
      });

      const orderNo = 'OD' + Date.now().toString().slice(-8);

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          order_no: orderNo,
          total,
          customer_phone: customer.phone,
          status: 1,
        })
        .select()
        .single();
      if (orderErr) throw orderErr;

      const itemRows = items.map((it) => ({
        order_id: order.id,
        product_id: it.productId,
        variant_id: it.variantId,
        code: it.code,
        name: it.name,
        color: it.color,
        qty: it.qty,
        price: it.price,
        image: it.image,
      }));
      const { error: itemsErr } = await supabase.from('order_items').insert(itemRows);
      if (itemsErr) throw itemsErr;

      // ลดสต็อกทันทีที่สั่งซื้อ
      for (const it of items) {
        const { data: variant } = await supabase
          .from('product_variants')
          .select('stock')
          .eq('id', it.variantId)
          .single();
        if (variant) {
          const newStock = Math.max(0, variant.stock - it.qty);
          await supabase.from('product_variants').update({ stock: newStock }).eq('id', it.variantId);
        }
      }

      res.status(200).json({ ...order, items });
      return;
    }

    if (req.method === 'PATCH') {
      const { id, status, trackingNo, courier } = req.body || {};
      if (!id) {
        res.status(400).json({ error: 'id is required' });
        return;
      }
      const patch = { updated_at: new Date().toISOString() };
      if (status != null) patch.status = status;
      if (trackingNo != null) patch.tracking_no = trackingNo;
      if (courier != null) patch.courier = courier;

      const { error } = await supabase.from('orders').update(patch).eq('id', id);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
