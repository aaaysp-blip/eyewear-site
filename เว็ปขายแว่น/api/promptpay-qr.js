// api/promptpay-qr.js
// GET /api/promptpay-qr?amount=1290.00
// คืนค่าเป็นรูป PNG ของ QR PromptPay พร้อมยอดเงิน (คิวอาร์แบบระบุยอดตายตัว)
// ใช้เบอร์/เลขบัตร PromptPay ที่ตั้งไว้ใน store_config (admin ตั้งค่าได้จากหน้า admin)
//
// ต้องติดตั้ง 2 แพ็กเกจนี้ก่อนใช้งาน:
//   npm install promptpay-qr qrcode

import generatePayload from 'promptpay-qr';
import QRCode from 'qrcode';
import { getSupabase } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const amount = parseFloat(req.query?.amount);
  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'amount is required and must be > 0' });
    return;
  }

  try {
    const supabase = getSupabase();
    const { data: config, error } = await supabase
      .from('store_config')
      .select('promptpay_id')
      .eq('id', 1)
      .single();
    if (error) throw error;

    const promptpayId = config.promptpay_id;
    if (!promptpayId || promptpayId === '0000000000') {
      res.status(400).json({ error: 'ยังไม่ได้ตั้งค่าเบอร์/เลขบัตร PromptPay ในหน้า admin' });
      return;
    }

    // promptpay-qr รองรับทั้งเบอร์โทร (10 หลัก) และเลขบัตรประชาชน (13 หลัก)
    const payload = generatePayload(promptpayId, { amount });

    const pngBuffer = await QRCode.toBuffer(payload, {
      type: 'png',
      width: 400,
      margin: 2,
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store'); // ยอดเงินเปลี่ยนทุกออเดอร์ ห้าม cache
    res.status(200).send(pngBuffer);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
