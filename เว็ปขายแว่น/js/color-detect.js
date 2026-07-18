/*
 * color-detect.js — "AI" เดาชื่อสีจากรูปที่แอดมินอัปโหลด (MVP, ทำงาน 100% ในเบราว์เซอร์ ไม่ต้องมี API key)
 * หลักการ: วาดรูปลง canvas -> สุ่มตัวอย่างพิกเซล -> ตัดพิกเซลพื้นหลังโทนขาว/เทาอ่อนออก
 *          -> หาโทนสีที่พบบ่อยที่สุด -> จับคู่กับชื่อสีภาษาไทยที่ใกล้เคียงที่สุด
 * หมายเหตุ: เป็นการเดาเบื้องต้นเท่านั้น แอดมินต้องยืนยัน/แก้ไขชื่อสีก่อนบันทึกเสมอ (ตามสเปก)
 */
(function (global) {
  const NAMED_COLORS = [
    { name: 'ดำ', rgb: [30, 30, 30] },
    { name: 'ดำด้าน', rgb: [45, 45, 48] },
    { name: 'ขาว', rgb: [242, 240, 234] },
    { name: 'เทา', rgb: [139, 139, 133] },
    { name: 'น้ำตาล', rgb: [138, 90, 52] },
    { name: 'น้ำตาลเข้ม', rgb: [90, 58, 32] },
    { name: 'เบจ', rgb: [205, 191, 164] },
    { name: 'กระ', rgb: [160, 120, 80] },
    { name: 'ทอง', rgb: [201, 162, 75] },
    { name: 'เงิน', rgb: [185, 191, 196] },
    { name: 'กุหลาบทอง', rgb: [202, 165, 147] },
    { name: 'ใส', rgb: [223, 230, 230] },
    { name: 'แดง', rgb: [165, 66, 60] },
    { name: 'ส้ม', rgb: [201, 123, 61] },
    { name: 'เหลือง', rgb: [214, 188, 74] },
    { name: 'เขียว', rgb: [63, 122, 86] },
    { name: 'เขียวมะกอก', rgb: [111, 122, 74] },
    { name: 'ฟ้า', rgb: [91, 135, 171] },
    { name: 'น้ำเงิน', rgb: [51, 80, 122] },
    { name: 'ม่วง', rgb: [122, 90, 145] },
    { name: 'ชมพู', rgb: [214, 143, 160] },
  ];

  function nearestColorName(rgb) {
    let best = null, bestDist = Infinity;
    NAMED_COLORS.forEach(c => {
      const d = (c.rgb[0] - rgb[0]) ** 2 + (c.rgb[1] - rgb[1]) ** 2 + (c.rgb[2] - rgb[2]) ** 2;
      if (d < bestDist) { bestDist = d; best = c; }
    });
    return best ? best.name : 'ไม่ทราบ';
  }

  function isBackgroundish(r, g, b) {
    // พื้นหลังขาว/เทาอ่อนมาก หรือโปร่งใส มักไม่ใช่สีตัวสินค้า
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
    return lightness > 235 && sat < 0.12;
  }

  function rgbToHex([r, g, b]) {
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }

  function erodeMask(mask, w, h, iterations) {
    let current = mask;
    for (let it = 0; it < iterations; it++) {
      const next = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!current[i]) { next[i] = 0; continue; }
          const up = y > 0 ? current[i - w] : 0;
          const down = y < h - 1 ? current[i + w] : 0;
          const left = x > 0 ? current[i - 1] : 0;
          const right = x < w - 1 ? current[i + 1] : 0;
          next[i] = (up && down && left && right) ? 1 : 0;
        }
      }
      current = next;
    }
    return current;
  }

  /**
   * @param {HTMLImageElement} imgEl - รูปที่โหลดเสร็จแล้ว (complete === true)
   * @returns {{name:string, hex:string, rgb:number[]}}
   */
  function detectDominantColor(imgEl) {
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, size, size);
    let data;
    try {
      data = ctx.getImageData(0, 0, size, size).data;
    } catch (e) {
      return { name: 'ไม่ทราบ', hex: '#cccccc', rgb: [200, 200, 200] };
    }

    // มาสก์ "พื้นหน้า" (ไม่ใช่พื้นหลัง) ของทั้งชิ้น
    const mask = new Uint8Array(size * size);
    for (let p = 0, i = 0; p < data.length; p += 4, i++) {
      const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
      mask[i] = (a >= 100 && !isBackgroundish(r, g, b)) ? 1 : 0;
    }

    // กร่อนมาสก์เข้าไปด้านใน เพื่อแยก "ขอบรอบนอก" (มักเป็นกรอบแว่น) ออกจาก "พื้นที่ด้านใน" (มักเป็นเลนส์)
    // แว่นตาส่วนใหญ่: กรอบ = ขอบบาง ๆ รอบเลนส์, เลนส์ = พื้นที่ทึบตรงกลางที่มักมีสีเทา/น้ำตาลใกล้เคียงกันในหลายรุ่น
    // จึงให้น้ำหนักกับพิกเซลแถบขอบมากกว่า เพื่อจับสีกรอบแทนสีเลนส์
    const erosionDepth = Math.max(2, Math.round(size * 0.06));
    const eroded = erodeMask(mask, size, size, erosionDepth);
    const rimMask = new Uint8Array(size * size);
    let rimCount = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] && !eroded[i]) { rimMask[i] = 1; rimCount++; }
    }
    // ถ้าแถบขอบเล็กเกินไป (เช่น เป็นชิ้นอุปกรณ์ทึบไม่มีเลนส์กลวง) ให้ใช้พื้นหน้าทั้งหมดแทน
    const useMask = rimCount >= (size * size * 0.008) ? rimMask : mask;

    // Quantize เป็น bucket ละ 24 หน่วยต่อช่องสี แล้วนับความถี่ (ง่ายและเร็วกว่า k-means เต็มรูปแบบ)
    const buckets = new Map();
    for (let p = 0, i = 0; p < data.length; p += 4, i++) {
      if (!useMask[i]) continue;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const key = [Math.round(r / 24), Math.round(g / 24), Math.round(b / 24)].join(',');
      const entry = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      entry.count++; entry.r += r; entry.g += g; entry.b += b;
      buckets.set(key, entry);
    }

    let bestEntry = null;
    buckets.forEach(entry => { if (!bestEntry || entry.count > bestEntry.count) bestEntry = entry; });

    let rgb;
    if (bestEntry) {
      rgb = [bestEntry.r / bestEntry.count, bestEntry.g / bestEntry.count, bestEntry.b / bestEntry.count];
    } else {
      // ทั้งภาพเป็นพื้นหลังสว่างหมด -> คำนวณค่าเฉลี่ยรวมแทน
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
      rgb = n ? [r / n, g / n, b / n] : [200, 200, 200];
    }

    return { name: nearestColorName(rgb), hex: rgbToHex(rgb), rgb };
  }

  /**
   * ตรวจจับ "ชิ้น" ที่แยกกันในรูปเดียว โดยดูว่าพิกเซลไหนไม่ใช่พื้นหลัง (isBackgroundish)
   * แล้วจัดกลุ่มพิกเซลที่ติดกัน (connected-component labeling) เป็นชิ้น ๆ — ใช้ได้ดีเมื่อสินค้าแต่ละสี
   * วางแยกกันบนพื้นหลังเรียบ (ภาพสินค้าทั่วไป) ถ้าตรวจพบแค่ 0-1 ชิ้น จะถือว่าทั้งรูปคือ 1 สี (ไม่ครอป)
   */
  function buildForegroundMask(ctx, w, h) {
    const data = ctx.getImageData(0, 0, w, h).data;
    const mask = new Uint8Array(w * h);
    for (let p = 0, i = 0; p < data.length; p += 4, i++) {
      const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
      mask[i] = (a >= 100 && !isBackgroundish(r, g, b)) ? 1 : 0;
    }
    return mask;
  }

  function connectedComponents(mask, w, h) {
    const labels = new Int32Array(w * h).fill(-1);
    const components = [];
    const stack = [];
    for (let start = 0; start < w * h; start++) {
      if (!mask[start] || labels[start] !== -1) continue;
      const label = components.length;
      let minX = w, maxX = -1, minY = h, maxY = -1, count = 0;
      stack.length = 0;
      stack.push(start);
      labels[start] = label;
      while (stack.length) {
        const idx = stack.pop();
        const x = idx % w, y = (idx / w) | 0;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x > 0) { const n = idx - 1; if (mask[n] && labels[n] === -1) { labels[n] = label; stack.push(n); } }
        if (x < w - 1) { const n = idx + 1; if (mask[n] && labels[n] === -1) { labels[n] = label; stack.push(n); } }
        if (y > 0) { const n = idx - w; if (mask[n] && labels[n] === -1) { labels[n] = label; stack.push(n); } }
        if (y < h - 1) { const n = idx + w; if (mask[n] && labels[n] === -1) { labels[n] = label; stack.push(n); } }
      }
      components.push({ minX, maxX, minY, maxY, count });
    }
    return components;
  }

  /**
   * @param {HTMLImageElement} imgEl - รูปที่โหลดเสร็จแล้ว
   * @param {string} originalDataUrl - data URL ของไฟล์ต้นฉบับ (ใช้ตอนไม่ต้องครอป เพื่อคงคุณภาพ/ไฟล์เดิมไว้)
   * @returns {{dataUrl:string, name:string, hex:string}[]} รายการสีที่ตรวจพบ (อย่างน้อย 1 รายการเสมอ)
   */
  function splitVariantsFromImage(imgEl, originalDataUrl) {
    const naturalW = imgEl.naturalWidth || imgEl.width;
    const naturalH = imgEl.naturalHeight || imgEl.height;
    const wholeImageResult = () => {
      const guess = detectDominantColor(imgEl);
      return [{ dataUrl: originalDataUrl, name: guess.name, hex: guess.hex }];
    };
    if (!naturalW || !naturalH) return wholeImageResult();

    const maxDim = 800;
    const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
    const w = Math.max(1, Math.round(naturalW * scale));
    const h = Math.max(1, Math.round(naturalH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, w, h);

    let comps;
    try {
      const mask = buildForegroundMask(ctx, w, h);
      const minArea = w * h * 0.015;
      comps = connectedComponents(mask, w, h).filter(c => c.count >= minArea).sort((a, b) => a.minX - b.minX);
    } catch (e) {
      return wholeImageResult();
    }

    if (comps.length <= 1) return wholeImageResult();

    return comps.map(c => {
      const bw = c.maxX - c.minX, bh = c.maxY - c.minY;
      const pad = Math.round(Math.max(bw, bh) * 0.06) + 4;
      const sx = Math.max(0, c.minX - pad);
      const sy = Math.max(0, c.minY - pad);
      const sw = Math.min(w, c.maxX + pad + 1) - sx;
      const sh = Math.min(h, c.maxY + pad + 1) - sy;
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = sw; cropCanvas.height = sh;
      cropCanvas.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      const guess = detectDominantColor(cropCanvas);
      return { dataUrl: cropCanvas.toDataURL('image/png'), name: guess.name, hex: guess.hex };
    });
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve({ img, dataUrl: reader.result });
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  global.ColorDetect = { detectDominantColor, nearestColorName, loadImageFromFile, splitVariantsFromImage, NAMED_COLORS };
})(window);
