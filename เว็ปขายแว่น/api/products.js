// api/products.js
// GET    /api/products             -> รายการสินค้าทั้งหมด (พร้อม variants) — ไม่ส่ง images_original กลับ (หนักและไม่มีใครใช้ตอนแสดงรายการ)
// GET    /api/products?id=xxx      -> รายละเอียดเต็มของสินค้าชิ้นเดียว รวม images_original (ใช้ตอนแอดมินเปิดแก้ไขเพื่อ re-crop จากต้นฉบับ)
// POST   /api/products             -> เพิ่ม/แก้ไขสินค้า (ส่ง id มาด้วย = แก้ไข, ไม่ส่ง = เพิ่มใหม่)
// PATCH  /api/products             -> แก้สต็อกของตัวเลือกสีเดียวแบบเร็ว { variantId, stock }
//                                   -> หรือเปลี่ยนชื่อแบรนด์ทุกสินค้าที่ใช้อยู่ { renameBrand: { from, to } }
// DELETE /api/products?id=xxx      -> ลบสินค้า

import { getSupabase } from './_lib/supabase.js';

function nextCode(existingCodes) {
  let max = 0;
  existingCodes.forEach((code) => {
    const m = /^C(\d+)$/i.exec(code || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'C' + (max + 1);
}

export default async function handler(req, res) {
  const supabase = getSupabase();

  try {
    if (req.method === 'GET') {
      const productId = req.query?.id;

      if (productId) {
        // สินค้าชิ้นเดียวแบบเต็ม รวม images_original — เรียกตอนแอดมินเปิดแก้ไขเท่านั้น
        const { data: product, error: pErr } = await supabase.from('products').select('*').eq('id', productId).single();
        if (pErr) throw pErr;
        const { data: variants, error: vErr } = await supabase.from('product_variants').select('*').eq('product_id', productId);
        if (vErr) throw vErr;
        res.status(200).json({ ...product, variants: variants || [] });
        return;
      }

      const { data: products, error: pErr } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      if (pErr) throw pErr;

      const { data: variants, error: vErr } = await supabase
        .from('product_variants')
        .select('*');
      if (vErr) throw vErr;

      const merged = products.map((p) => {
        const { images_original, ...rest } = p; // ตัดออกจากรายการ — หนักและใช้แค่ตอนแก้ไขสินค้าเดี่ยวๆ
        return { ...rest, variants: variants.filter((v) => v.product_id === p.id) };
      });

      res.status(200).json(merged);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { id, variants = [], ...productFields } = body;

      let productId = id;

      if (id) {
        // แก้ไขสินค้าเดิม
        const { error } = await supabase.from('products').update(productFields).eq('id', id);
        if (error) throw error;
      } else {
        // สินค้าใหม่ — ถ้าไม่ได้ส่ง code มา ให้ gen ให้
        if (!productFields.code) {
          const { data: existing } = await supabase.from('products').select('code');
          productFields.code = nextCode((existing || []).map((r) => r.code));
        }
        const { data, error } = await supabase.from('products').insert(productFields).select().single();
        if (error) throw error;
        productId = data.id;
      }

      // sync variants: ลบของเดิมที่ไม่มีในชุดใหม่ + upsert ที่เหลือ
      const { data: existingVariants } = await supabase
        .from('product_variants')
        .select('id')
        .eq('product_id', productId);

      const incomingIds = variants.filter((v) => v.id).map((v) => v.id);
      const toDelete = (existingVariants || [])
        .map((v) => v.id)
        .filter((vid) => !incomingIds.includes(vid));

      if (toDelete.length) {
        await supabase.from('product_variants').delete().in('id', toDelete);
      }

      for (const v of variants) {
        const variantRow = {
          product_id: productId,
          color: v.color,
          stock: v.stock || 0,
          images: v.images || [],
        };
        if (v.id) {
          await supabase.from('product_variants').update(variantRow).eq('id', v.id);
        } else {
          await supabase.from('product_variants').insert(variantRow);
        }
      }

      res.status(200).json({ id: productId });
      return;
    }

    if (req.method === 'PATCH') {
      const { variantId, stock, renameBrand } = req.body || {};

      if (renameBrand) {
        const { from, to } = renameBrand;
        if (!from || !to) {
          res.status(400).json({ error: 'renameBrand.from and renameBrand.to are required' });
          return;
        }
        const { error } = await supabase.from('products').update({ brand: to }).eq('brand', from);
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }

      if (!variantId || stock == null) {
        res.status(400).json({ error: 'variantId and stock are required' });
        return;
      }
      const { error } = await supabase
        .from('product_variants')
        .update({ stock: Math.max(0, parseInt(stock, 10) || 0) })
        .eq('id', variantId);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id || (req.body && req.body.id);
      if (!id) {
        res.status(400).json({ error: 'id is required' });
        return;
      }
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
