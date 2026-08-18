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
      const {
        items = [], total, customer,
        subtotal, shippingFee, smallOrderFee, codFee, discountAmount,
        paymentMethod, promoCode, paymentSlip, isPreorder, shippingMethod,
      } = req.body || {};
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
          subtotal: subtotal != null ? subtotal : total,
          shipping_fee: shippingFee || 0,
          small_order_fee: smallOrderFee || 0,
          cod_fee: codFee || 0,
          discount_amount: discountAmount || 0,
          payment_method: paymentMethod || 'promptpay',
          promo_code: promoCode || null,
          payment_slip: paymentSlip || null,
          is_preorder: !!isPreorder,
          shipping_method: shippingMethod || 'standard',
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

      // ลดสต็อกทันทีที่สั่งซื้อ — ข้ามขั้นตอนนี้ถ้าเป็นออเดอร์ pre-order (สั่งเกินสต็อกที่มีได้ตั้งใจ ไม่ตัดสต็อกจริง)
      if (!isPreorder) {
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
      }

      res.status(200).json({ ...order, items });
      return;
    }

    if (req.method === 'PATCH') {
      const { id, status, trackingNo, courier, codDeliveryStatus, cancel } = req.body || {};
      if (!id) {
        res.status(400).json({ error: 'id is required' });
        return;
      }

      if (cancel) {
        const { data: order, error: oErr } = await supabase.from('orders').select('status, is_preorder').eq('id', id).single();
        if (oErr) throw oErr;
        if (order.status !== 0) {
          // คืนสต็อกให้ทุกรายการในออเดอร์ (ข้ามถ้าเป็น pre-order เพราะไม่เคยตัดสต็อกจริงตั้งแต่แรก)
          if (!order.is_preorder) {
            const { data: items, error: iErr } = await supabase.from('order_items').select('variant_id, qty').eq('order_id', id);
            if (iErr) throw iErr;
            for (const it of items) {
              if (!it.variant_id) continue;
              const { data: variant } = await supabase.from('product_variants').select('stock').eq('id', it.variant_id).single();
              if (variant) {
                await supabase.from('product_variants').update({ stock: variant.stock + it.qty }).eq('id', it.variant_id);
              }
            }
          }
          const { error: cancelErr } = await supabase.from('orders').update({ status: 0, updated_at: new Date().toISOString() }).eq('id', id);
          if (cancelErr) throw cancelErr;
        }
        res.status(200).json({ ok: true });
        return;
      }

      const patch = { updated_at: new Date().toISOString() };
      if (status != null) patch.status = status;
      if (trackingNo != null) patch.tracking_no = trackingNo;
      if (courier != null) patch.courier = courier;
      if (codDeliveryStatus != null) patch.cod_delivery_status = codDeliveryStatus;

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
