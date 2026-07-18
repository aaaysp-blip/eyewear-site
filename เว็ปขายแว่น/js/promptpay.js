/*
 * promptpay.js — สร้าง payload สำหรับ PromptPay QR ตามมาตรฐาน EMV QR Code (Bank of Thailand)
 * ใช้ร่วมกับ js/vendor/qrcode.min.js เพื่อ render เป็นรูป QR (ฟรี ไม่ต้องเรียก API ภายนอก)
 */
(function (global) {
  function formatTarget(id) {
    let v = String(id || '').replace(/[^0-9]/g, '');
    if (v.length === 13) {
      // เลขประจำตัวผู้เสียภาษี / เลขบัตรประชาชน
      return { type: '02', value: v };
    }
    // เบอร์โทรศัพท์ -> ตัดเลข 0 นำหน้า แล้วเติม 66 และ pad ให้ครบ 13 หลัก
    if (v.length === 10 && v.startsWith('0')) v = v.slice(1);
    v = '66' + v;
    v = v.padStart(13, '0');
    return { type: '01', value: v };
  }

  function tlv(id, value) {
    const len = String(value.length).padStart(2, '0');
    return id + len + value;
  }

  function crc16(str) {
    let crc = 0xffff;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function generatePayload(target, amount) {
    const { type, value } = formatTarget(target);
    const merchantInfo = tlv('00', 'A000000677010111') + tlv(type, value);
    let payload =
      tlv('00', '01') +
      tlv('01', amount ? '12' : '11') +
      tlv('29', merchantInfo) +
      tlv('53', '764');
    if (amount) payload += tlv('54', Number(amount).toFixed(2));
    payload += tlv('58', 'TH');
    payload += '6304';
    return payload + crc16(payload);
  }

  global.PromptPay = { generatePayload };
})(window);
