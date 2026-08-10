/* admin.js — หลังบ้าน: dashboard, ลงสินค้า+AI แยกสี, จัดการสต็อก, ออเดอร์, CRM, ตั้งค่า */
(function () {
  let restockDraft = []; // { productId, variantId, code, name, color, qtyOrdered, currentStock } — ประกาศไว้บนสุดเพราะ renderDashboard อาจถูกเรียกทันทีตอนโหลดหน้า (ล็อกอินค้างจาก session ก่อน)
  let appInited = false; // ประกาศไว้บนสุดด้วยเหตุผลเดียวกัน (initApp ถูกเรียกทันทีถ้ายังล็อกอินค้างจาก session ก่อนหน้า เช่นตอนรีเฟรชหน้า)

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById(el.dataset.closeModal).classList.remove('show');
    });
  });

  // ================= Login =================
  const SESSION_KEY = 'ew_admin_session';
  function isLoggedIn() { return sessionStorage.getItem(SESSION_KEY) === '1'; }

  function showApp() {
    document.getElementById('loginShell').classList.add('hidden');
    document.getElementById('adminShell').classList.remove('hidden');
    initApp();
  }
  function showLogin() {
    document.getElementById('loginShell').classList.remove('hidden');
    document.getElementById('adminShell').classList.add('hidden');
  }

  document.getElementById('btnLogin').addEventListener('click', doLogin);
  document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  async function doLogin() {
    const pw = document.getElementById('loginPassword').value;
    try {
      const ok = await DB.verifyAdminPassword(pw);
      if (ok) {
        sessionStorage.setItem(SESSION_KEY, '1');
        document.getElementById('loginError').textContent = '';
        showApp();
      } else {
        document.getElementById('loginError').textContent = 'รหัสผ่านไม่ถูกต้อง';
      }
    } catch (err) {
      document.getElementById('loginError').textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ: ' + (err.message || err);
    }
  }
  document.getElementById('btnLogout').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
  });

  if (isLoggedIn()) showApp(); else showLogin();

  // ================= App init (nav) =================
  async function initApp() {
    document.querySelectorAll('.nav-link[data-view]').forEach(link => {
      link.addEventListener('click', () => switchView(link.dataset.view));
    });
    if (!appInited) {
      try {
        await DB.init();
      } catch (err) {
        console.error('DB.init failed', err);
        alert('โหลดข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ: ' + (err.message || err));
        return;
      }
      appInited = true;
      setupNewProductForm();
      setupSettings();
      setupRestockActions();
      setupPromotions();
    }
    switchView('dashboard');
  }

  function switchView(view) {
    document.querySelectorAll('.nav-link[data-view]').forEach(l => l.classList.toggle('active', l.dataset.view === view));
    document.querySelectorAll('.admin-view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    if (view === 'dashboard') renderDashboard();
    if (view === 'stock') renderStock();
    if (view === 'restock') renderRestockView();
    if (view === 'orders') renderOrders();
    if (view === 'crm') renderCrm();
    if (view === 'reviews') renderReviews();
    if (view === 'promotions') renderPromotions();
    if (view === 'newProduct') {
      document.getElementById('npCode').placeholder = DB.generateNextCode();
      renderMainImagesPreview();
      renderVariantList();
    }
    if (view === 'settings') loadSettings();
  }

  // ================= Dashboard =================
  function renderDashboard() {
    const cfg = DB.getConfig();
    const low = DB.lowStockVariants(cfg.lowStockThreshold);
    const box = document.getElementById('lowStockBox');
    if (low.length) {
      box.innerHTML = `
        <div class="alert-box">
          ⚠️ มีสินค้าใกล้หมด/หมดสต็อก ${low.length} รายการ (เกณฑ์ ≤ ${cfg.lowStockThreshold} ชิ้น)
          <ul>${low.slice(0, 8).map(x => `<li>${x.product.code} ${escapeHtml(x.product.name)} — ${escapeHtml(x.variant.color)}: เหลือ ${x.variant.stock} ชิ้น</li>`).join('')}</ul>
          <button class="btn btn-primary btn-sm" id="btnCreatePoFromLowStock" style="margin-top:10px">สร้างใบสั่งซื้อจากรายการนี้</button>
        </div>`;
      document.getElementById('btnCreatePoFromLowStock').addEventListener('click', () => {
        lowStockDefaultQty = 10;
        switchView('restock');
        showToast('เติมจำนวนที่จะสั่งให้แล้ว (10 ชิ้น/รายการ) ตรวจสอบ/แก้ไขจำนวนก่อนกด "ตรวจสอบรายการก่อนสร้างใบสั่งซื้อ"');
      });
    } else {
      box.innerHTML = `<div class="alert-box empty">✅ สต็อกสินค้าทุกรายการอยู่ในระดับปกติ</div>`;
    }

    document.getElementById('statGrid').innerHTML = `
      <div class="stat-card"><div class="lbl">ยอดขายเดือนนี้</div><div class="val">฿${DB.monthSales().toLocaleString()}</div></div>
      <div class="stat-card"><div class="lbl">ออเดอร์ที่รอดำเนินการ</div><div class="val">${DB.pendingOrderCount()}</div></div>
      <div class="stat-card"><div class="lbl">ใบสั่งซื้อที่รอตรวจรับ</div><div class="val">${DB.pendingRestockCount()}</div></div>
    `;

    const best = DB.bestSellers(8);
    document.getElementById('bestSellerBody').innerHTML = best.length
      ? best.map(b => `<tr><td>${b.code}</td><td>${escapeHtml(b.name)}</td><td>${b.qty}</td></tr>`).join('')
      : `<tr><td colspan="3" class="tag-muted">ยังไม่มีข้อมูลการขาย</td></tr>`;
  }

  // ================= New product form =================
  let pendingVariants = []; // { tempId, color, stock, images:[dataUrl] }
  let pendingMainImages = []; // [{ original: dataUrl, cropped: dataUrl }] — ภาพหน้าปกของสินค้าที่ครอปแล้ว
  let editingProductId = null; // ถ้าไม่ใช่ null แปลว่ากำลังแก้ไขสินค้าเดิม ไม่ใช่ลงใหม่
  let editingCreatedAt = null;

  function sizeFieldsHTML(cat) {
    if (cat === 'accessories') {
      return `
        <div class="field"><label>กว้าง (มม.)</label><input type="number" id="npAccWidth" min="0"></div>
        <div class="field"><label>ยาว (มม.)</label><input type="number" id="npAccLength" min="0"></div>
        <div class="field"><label>ประเภทวัสดุ</label><input type="text" id="npMaterial" placeholder="เช่น ไมโครไฟเบอร์, หนัง PU, อะคริลิก"></div>
      `;
    }
    return `
      <div class="field"><label>หน้าแว่นกว้าง (มม.)</label><input type="number" id="npFrameWidth" min="0"></div>
      <div class="field"><label>เลนส์กว้าง (มม.)</label><input type="number" id="npLensWidth" min="0"></div>
      <div class="field"><label>เลนส์สูง (มม.)</label><input type="number" id="npLensHeight" min="0"></div>
      <div class="field"><label>สะพานแว่น (มม.)</label><input type="number" id="npBridgeWidth" min="0"></div>
      <div class="field"><label>ความยาวขาแว่น (มม.)</label><input type="number" id="npTempleLength" min="0"></div>
    `;
  }

  function renderSizeFields(cat) {
    const wrap = document.getElementById('sizeFieldsWrap');
    wrap.innerHTML = sizeFieldsHTML(cat);
    wrap.dataset.kind = cat === 'accessories' ? 'accessories' : 'eyewear';
  }

  function setupNewProductForm() {
    const drop = document.getElementById('uploadDrop');
    const input = document.getElementById('uploadInput');
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault(); drop.classList.remove('drag');
      handleFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', () => { handleFiles(input.files); input.value = ''; });

    document.getElementById('npCategory').addEventListener('change', e => {
      const newCat = e.target.value;
      const newKind = newCat === 'accessories' ? 'accessories' : 'eyewear';
      const wrap = document.getElementById('sizeFieldsWrap');
      if (wrap.dataset.kind !== newKind) {
        renderSizeFields(newCat);
      }
    });

    document.getElementById('btnSaveProduct').addEventListener('click', saveNewProduct);
    document.getElementById('btnCancelEdit').addEventListener('click', resetProductForm);
    document.getElementById('btnAiReadImage').addEventListener('click', runAiReadFromImage);

    document.getElementById('btnCropCancel').addEventListener('click', () => {
      document.getElementById('mainImageCropModal').classList.remove('show');
      cropCtx = null;
      currentAiCropCtx = null;
      processNextCropInQueue();
      processNextAiCropInQueue();
    });
    document.getElementById('btnCropConfirm').addEventListener('click', confirmCrop);
    document.getElementById('cropRotateMinus').addEventListener('click', () => adjustAiCropRotation(-5));
    document.getElementById('cropRotatePlus').addEventListener('click', () => adjustAiCropRotation(5));
    document.getElementById('cropRotateInput').addEventListener('change', e => setAiCropRotation(e.target.value));
  }

  const MAX_MAIN_IMAGES = 5;

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    let remaining = MAX_MAIN_IMAGES - pendingMainImages.length - mainImageCropQueue.length;
    if (remaining <= 0) {
      showToast(`เพิ่มภาพหลักได้สูงสุด ${MAX_MAIN_IMAGES} รูป`);
      return;
    }
    if (files.length > remaining) {
      showToast(`เพิ่มได้อีกแค่ ${remaining} รูป (สูงสุด ${MAX_MAIN_IMAGES} รูป) — เกินมาจะไม่ถูกเพิ่ม`);
    }
    for (const file of files) {
      if (remaining <= 0) break;
      try {
        const { dataUrl } = await ColorDetect.loadImageFromFile(file);
        mainImageCropQueue.push(dataUrl);
        remaining--;
      } catch (e) {
        console.error(e);
      }
    }
    processNextCropInQueue();
  }

  // ---- Crop + confirm modal for the product's main/cover image(s) ----
  let mainImageCropQueue = [];
  let aiCropQueue = []; // [{ img, originalDataUrl, box:{x,y,width,height,rotationDegrees} (percent), tempId }]
  let cropCtx = null; // { img, dispW, dispH, scale, box:{x,y,w,h}, editIndex, originalDataUrl }
  let currentAiCropCtx = null; // { fullImg, naturalW, naturalH, itemPct, tempId, angle } — only set while adjusting an AI-suggested crop

  function processNextCropInQueue() {
    if (!mainImageCropQueue.length) return;
    currentAiCropCtx = null;
    const dataUrl = mainImageCropQueue.shift();
    const img = new Image();
    img.onload = () => openCropModalForImage(img, dataUrl, null);
    img.src = dataUrl;
  }

  function processNextAiCropInQueue() {
    if (!aiCropQueue.length) { currentAiCropCtx = null; updateRotationControlUI(); return; }
    const item = aiCropQueue.shift();
    currentAiCropCtx = {
      fullImg: item.img,
      naturalW: item.img.naturalWidth,
      naturalH: item.img.naturalHeight,
      itemPct: item.box,
      tempId: item.tempId,
      angle: item.box.rotationDegrees || 0,
    };
    renderRotatedCropStage();
  }

  function renderRotatedCropStage() {
    const c = currentAiCropCtx;
    if (!c) return;
    const workingCanvas = buildRotatedWorkingImage(c.fullImg, c.naturalW, c.naturalH, { ...c.itemPct, rotationDegrees: c.angle });
    const workingDataUrl = workingCanvas.toDataURL('image/jpeg', 0.92);
    const workingImg = new Image();
    workingImg.onload = () => {
      const rawW = (c.itemPct.width / 100) * c.naturalW;
      const rawH = (c.itemPct.height / 100) * c.naturalH;
      const boxSizePx = Math.max(rawW, rawH) * 1.05;
      const boxPct = {
        x: ((workingCanvas.width - boxSizePx) / 2 / workingCanvas.width) * 100,
        y: ((workingCanvas.height - boxSizePx) / 2 / workingCanvas.height) * 100,
        width: (boxSizePx / workingCanvas.width) * 100,
        height: (boxSizePx / workingCanvas.height) * 100,
      };
      openCropModalForImage(workingImg, workingDataUrl, null, croppedDataUrl => {
        const v = pendingVariants.find(x => x.tempId === c.tempId);
        if (v) { v.images = [croppedDataUrl]; renderVariantList(); }
        currentAiCropCtx = null;
        processNextAiCropInQueue();
      }, boxPct, true);
    };
    workingImg.src = workingDataUrl;
  }

  function adjustAiCropRotation(delta) {
    if (!currentAiCropCtx) return;
    currentAiCropCtx.angle = (currentAiCropCtx.angle || 0) + delta;
    renderRotatedCropStage();
  }

  function setAiCropRotation(value) {
    if (!currentAiCropCtx) return;
    currentAiCropCtx.angle = Number(value) || 0;
    renderRotatedCropStage();
  }

  function updateRotationControlUI() {
    const wrap = document.getElementById('cropRotateWrap');
    if (!wrap) return;
    if (!currentAiCropCtx) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    const input = document.getElementById('cropRotateInput');
    if (input) input.value = Math.round(currentAiCropCtx.angle);
  }

  function buildRotatedWorkingImage(fullImg, naturalW, naturalH, itemPct) {
    const rawW = (itemPct.width / 100) * naturalW;
    const rawH = (itemPct.height / 100) * naturalH;
    const cx = (itemPct.x / 100) * naturalW + rawW / 2;
    const cy = (itemPct.y / 100) * naturalH + rawH / 2;
    const angle = ((itemPct.rotationDegrees || 0) * Math.PI) / 180;

    const pad = Math.max(rawW, rawH) * 1.1;
    const workSize = Math.max(24, Math.min(Math.max(rawW, rawH) + pad * 2, Math.max(naturalW, naturalH)));

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(workSize);
    canvas.height = Math.round(workSize);
    const ctx = canvas.getContext('2d');
    // พื้นขาวรองไว้ก่อน เผื่อพื้นที่หลังหมุนล้นขอบรูปต้นฉบับ (โดยเฉพาะชิ้นที่อยู่ใกล้ขอบภาพ)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // หมุนรูปต้นฉบับทั้งภาพให้ชิ้นนี้อยู่ตรงกลางและหน้าตรง โดยไม่ครอปก่อนหมุน (กันปัญหาจุดศูนย์กลางเพี้ยนตอนอยู่ใกล้ขอบภาพ)
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-angle);
    ctx.translate(-cx, -cy);
    ctx.drawImage(fullImg, 0, 0, naturalW, naturalH);
    return canvas;
  }

  function openCropModalForImage(img, originalDataUrl, editIndex, onConfirm, suggestedBoxPct, removeBg) {
    const stage = document.getElementById('cropStage');
    const maxW = 480;
    const scale = Math.min(1, maxW / img.naturalWidth);
    const dispW = Math.round(img.naturalWidth * scale);
    const dispH = Math.round(img.naturalHeight * scale);
    stage.style.width = dispW + 'px';
    stage.style.height = dispH + 'px';
    stage.innerHTML = `<img src="${originalDataUrl}" style="width:${dispW}px;height:${dispH}px;display:block;user-select:none;pointer-events:none;">`;
    updateRotationControlUI();

    let box;
    if (suggestedBoxPct) {
      // ให้จุดเริ่มต้นมาจากตำแหน่ง/ขนาดที่ AI เสนอ (มีขอบเผื่อไว้เล็กน้อย) แอดมินยังปรับต่อได้ก่อนกดยืนยัน
      const rawX = (suggestedBoxPct.x / 100) * dispW;
      const rawY = (suggestedBoxPct.y / 100) * dispH;
      const rawW = (suggestedBoxPct.width / 100) * dispW;
      const rawH = (suggestedBoxPct.height / 100) * dispH;
      const pad = Math.max(rawW, rawH) * 0.1;
      const bw = Math.min(dispW, rawW + pad * 2);
      const bh = Math.min(dispH, rawH + pad * 2);
      box = {
        x: Math.max(0, Math.min(dispW - bw, Math.round(rawX - pad))),
        y: Math.max(0, Math.min(dispH - bh, Math.round(rawY - pad))),
        w: Math.round(bw),
        h: Math.round(bh),
      };
    } else {
      // ค่าเริ่มต้น: เต็มภาพเสมอ ไม่บังคับสัดส่วนใดๆ — แอดมินลากปรับเองได้ถ้าต้องการครอปแคบลง
      box = { x: 0, y: 0, w: dispW, h: dispH };
    }

    cropCtx = { img, dispW, dispH, scale, box, editIndex, originalDataUrl, onConfirm: onConfirm || null, removeBg: !!removeBg };
    renderCropBox();
    document.getElementById('mainImageCropModal').classList.add('show');
  }

  function renderCropBox() {
    const stage = document.getElementById('cropStage');
    stage.querySelectorAll('.crop-box').forEach(el => el.remove());
    const { box, dispW, dispH } = cropCtx;
    const div = document.createElement('div');
    div.className = 'crop-box';
    div.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;border:2px solid var(--accent);box-sizing:border-box;cursor:move;background:rgba(58,55,48,0.08)`;
    const handle = document.createElement('div');
    handle.style.cssText = 'position:absolute;right:-7px;bottom:-7px;width:14px;height:14px;background:var(--accent);border-radius:3px;cursor:nwse-resize;';
    div.appendChild(handle);

    div.addEventListener('mousedown', e => {
      if (e.target === handle) return;
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const origX = box.x, origY = box.y;
      function onMove(ev) {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        box.x = Math.max(0, Math.min(dispW - box.w, origX + dx));
        box.y = Math.max(0, Math.min(dispH - box.h, origY + dy));
        div.style.left = box.x + 'px'; div.style.top = box.y + 'px';
      }
      function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    });
    handle.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const startX = e.clientX, startY = e.clientY;
      const origW = box.w, origH = box.h;
      function onMove(ev) {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        // ปรับกว้าง/สูงอิสระต่อกัน ไม่บังคับสัดส่วนใดๆ
        box.w = Math.max(24, Math.min(origW + dx, dispW - box.x));
        box.h = Math.max(24, Math.min(origH + dy, dispH - box.y));
        div.style.width = box.w + 'px'; div.style.height = box.h + 'px';
      }
      function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    });

    stage.appendChild(div);
  }

  function confirmCrop() {
    if (!cropCtx) return;
    const { img, box, scale, editIndex, originalDataUrl, onConfirm, removeBg } = cropCtx;
    const sx = Math.round(box.x / scale), sy = Math.round(box.y / scale);
    const sw = Math.round(box.w / scale), sh = Math.round(box.h / scale);
    // เอาต์พุตตามสัดส่วนของกรอบที่แอดมินเลือกเอง (ไม่บังคับสัดส่วนตายตัว) จำกัดด้านยาวสุดไว้ที่ 900px
    const maxSide = 900;
    const ratio = sw / sh;
    let outW, outH;
    if (ratio >= 1) { outW = maxSide; outH = Math.round(maxSide / ratio); }
    else { outH = maxSide; outW = Math.round(maxSide * ratio); }
    const canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    if (removeBg) removeBackgroundToWhiteInPlace(canvas);
    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);

    document.getElementById('mainImageCropModal').classList.remove('show');
    cropCtx = null;

    if (onConfirm) {
      onConfirm(croppedDataUrl);
      return;
    }
    if (editIndex == null) {
      pendingMainImages.push({ original: originalDataUrl, cropped: croppedDataUrl });
    } else {
      pendingMainImages[editIndex].cropped = croppedDataUrl;
    }
    renderMainImagesPreview();
    processNextCropInQueue();
  }

  function removeBackgroundToWhiteInPlace(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    if (w < 2 || h < 2) return;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const threshold = 32;
    const feather = 22;

    let rs = 0, gs = 0, bs = 0, count = 0;
    for (let x = 0; x < w; x++) {
      [0, h - 1].forEach(y => { const i = (y * w + x) * 4; rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; count++; });
    }
    for (let y = 0; y < h; y++) {
      [0, w - 1].forEach(x => { const i = (y * w + x) * 4; rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; count++; });
    }
    const bg = count > 0 ? [rs / count, gs / count, bs / count] : [255, 255, 255];

    function distAt(idx) {
      const i = idx * 4;
      const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    const visited = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) {
      [0, h - 1].forEach(y => {
        const idx = y * w + x;
        if (!visited[idx] && distAt(idx) < threshold) { visited[idx] = 1; stack.push(idx); }
      });
    }
    for (let y = 0; y < h; y++) {
      [0, w - 1].forEach(x => {
        const idx = y * w + x;
        if (!visited[idx] && distAt(idx) < threshold) { visited[idx] = 1; stack.push(idx); }
      });
    }
    while (stack.length) {
      const idx = stack.pop();
      const x = idx % w, y = (idx - x) / w;
      const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const nidx = ny * w + nx;
        if (visited[nidx]) continue;
        if (distAt(nidx) < threshold) { visited[nidx] = 1; stack.push(nidx); }
      }
    }
    for (let idx = 0; idx < w * h; idx++) {
      if (visited[idx]) {
        data[idx * 4] = 255; data[idx * 4 + 1] = 255; data[idx * 4 + 2] = 255;
      } else {
        const x = idx % w, y = (idx - x) / w;
        let nearRemoved = false;
        const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (visited[ny * w + nx]) { nearRemoved = true; break; }
        }
        if (nearRemoved) {
          const d = distAt(idx);
          if (d < threshold + feather) {
            const t = (d - threshold) / feather; // 0 = right at the removed edge, 1 = further from it
            data[idx * 4] = Math.round(data[idx * 4] * t + 255 * (1 - t));
            data[idx * 4 + 1] = Math.round(data[idx * 4 + 1] * t + 255 * (1 - t));
            data[idx * 4 + 2] = Math.round(data[idx * 4 + 2] * t + 255 * (1 - t));
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function renderMainImagesPreview() {
    const wrap = document.getElementById('mainImagesPreview');
    if (!wrap) return;
    const canAddMore = pendingMainImages.length < MAX_MAIN_IMAGES;
    const thumbsHtml = pendingMainImages.map((m, i) => `
      <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
        <img src="${m.cropped}" alt="" style="width:84px;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm" data-edit-main="${i}" type="button">แก้ไข</button>
          <button class="btn btn-sm btn-danger" data-remove-main="${i}" type="button">ลบ</button>
        </div>
      </div>
    `).join('');
    const addBtnHtml = canAddMore
      ? `<button class="btn" id="btnAddMoreImages" type="button" style="align-self:flex-start">+ เพิ่มรูป (${pendingMainImages.length}/${MAX_MAIN_IMAGES})</button>`
      : `<span class="tag-muted" style="align-self:center">ครบ ${MAX_MAIN_IMAGES} รูปแล้ว</span>`;
    wrap.innerHTML = `<p class="tag-muted" style="margin:14px 0 4px">ภาพหลักของสินค้า (ใช้เป็นภาพหน้าปกในหน้าร้าน — เพิ่มได้สูงสุด ${MAX_MAIN_IMAGES} รูป)</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start">
        ${thumbsHtml}
        ${addBtnHtml}
      </div>`;
    wrap.querySelectorAll('[data-edit-main]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.editMain);
        const m = pendingMainImages[i];
        const img = new Image();
        img.onload = () => openCropModalForImage(img, m.original, i);
        img.src = m.original;
      });
    });
    wrap.querySelectorAll('[data-remove-main]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingMainImages.splice(Number(btn.dataset.removeMain), 1);
        renderMainImagesPreview();
      });
    });
    const addMoreBtn = document.getElementById('btnAddMoreImages');
    if (addMoreBtn) addMoreBtn.addEventListener('click', () => document.getElementById('uploadInput').click());
  }

  function renderVariantList() {
    const wrap = document.getElementById('variantList');
    const listHtml = pendingVariants.map(v => `
      <div class="variant-card" data-tid="${v.tempId}">
        <div class="variant-fields">
          <div class="field">
            <label>ชื่อสี</label>
            <input type="text" class="v-color" data-tid="${v.tempId}" value="${escapeHtml(v.color)}" placeholder="พิมพ์ชื่อสี">
          </div>
          <div class="field">
            <label>จำนวนสต็อก</label>
            <input type="number" class="v-stock" data-tid="${v.tempId}" value="${v.stock}" min="0">
          </div>
        </div>
        <button class="btn btn-sm btn-danger variant-remove" data-remove="${v.tempId}" type="button">ลบตัวเลือกนี้</button>
      </div>
    `).join('');

    wrap.innerHTML =
      (pendingVariants.length ? `<p class="tag-muted" style="margin:14px 0 4px">ตั้งชื่อสีและจำนวนสต็อกสำหรับแต่ละตัวเลือก (1 ตัวเลือก = 1 สี) — ใช้ภาพหลักของสินค้าร่วมกันทุกสี ไม่ต้องอัปโหลดรูปแยกรายสี</p>` : '')
      + listHtml
      + `<button class="btn" id="btnAddVariantManual" type="button" style="margin-top:12px">+ เพิ่มตัวเลือกสี</button>`;

    wrap.querySelectorAll('.v-color').forEach(el => el.addEventListener('input', () => {
      const v = pendingVariants.find(x => x.tempId === el.dataset.tid);
      if (v) v.color = el.value;
    }));
    wrap.querySelectorAll('.v-stock').forEach(el => el.addEventListener('input', () => {
      const v = pendingVariants.find(x => x.tempId === el.dataset.tid);
      if (v) v.stock = Math.max(0, parseInt(el.value, 10) || 0);
    }));
    wrap.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingVariants = pendingVariants.filter(v => v.tempId !== btn.dataset.remove);
        renderVariantList();
      });
    });
    const addBtn = document.getElementById('btnAddVariantManual');
    if (addBtn) addBtn.addEventListener('click', () => {
      pendingVariants.push({ tempId: 'tmp_' + Math.random().toString(36).slice(2), color: '', stock: 5, images: [] });
      renderVariantList();
    });
  }

  async function saveNewProduct() {
    const err = document.getElementById('npError');
    const name = document.getElementById('npName').value.trim();
    const brand = document.getElementById('npBrand').value.trim();
    const category = document.getElementById('npCategory').value;
    const price = parseFloat(document.getElementById('npPrice').value);
    let code = document.getElementById('npCode').value.trim();

    let sizeData;
    if (category === 'accessories') {
      const accWidthEl = document.getElementById('npAccWidth');
      const accLengthEl = document.getElementById('npAccLength');
      const materialEl = document.getElementById('npMaterial');
      sizeData = {
        accWidth: accWidthEl && accWidthEl.value ? Number(accWidthEl.value) : null,
        accLength: accLengthEl && accLengthEl.value ? Number(accLengthEl.value) : null,
        material: materialEl ? materialEl.value.trim() : '',
      };
    } else {
      const fwEl = document.getElementById('npFrameWidth');
      const lwEl = document.getElementById('npLensWidth');
      const lhEl = document.getElementById('npLensHeight');
      const bwEl = document.getElementById('npBridgeWidth');
      const tlEl = document.getElementById('npTempleLength');
      sizeData = {
        frameWidth: fwEl && fwEl.value ? Number(fwEl.value) : null,
        lensWidth: lwEl && lwEl.value ? Number(lwEl.value) : null,
        lensHeight: lhEl && lhEl.value ? Number(lhEl.value) : null,
        bridgeWidth: bwEl && bwEl.value ? Number(bwEl.value) : null,
        templeLength: tlEl && tlEl.value ? Number(tlEl.value) : null,
      };
    }

    if (!name || !brand || !price || price <= 0) {
      err.textContent = 'กรุณากรอกชื่อสินค้า, แบรนด์ และราคาให้ถูกต้อง';
      return;
    }
    if (!pendingVariants.length) {
      err.textContent = 'กรุณาเพิ่มตัวเลือกสีอย่างน้อย 1 สี (กด "+ เพิ่มตัวเลือกสี")';
      return;
    }
    if (!code) code = DB.generateNextCode();

    const product = {
      code, name, brand, category, price, ...sizeData,
      images: pendingMainImages.map(m => m.cropped),
      imagesOriginal: pendingMainImages.map(m => m.original),
      variants: pendingVariants.map(v => {
        const row = { color: v.color.trim() || 'สีมาตรฐาน', stock: v.stock, images: v.images };
        if (v.existingId) row.id = v.existingId; // ไม่ส่ง id สำหรับสีใหม่ ให้เซิร์ฟเวอร์สร้าง uuid ให้เอง
        return row;
      }),
    };
    if (editingProductId) {
      product.id = editingProductId;
      product.createdAt = editingCreatedAt;
    }
    await DB.saveProduct(product);
    showToast(editingProductId ? `บันทึกการแก้ไข ${code} เรียบร้อย` : `บันทึกสินค้า ${code} เรียบร้อย`);
    resetProductForm();
  }

  function resetProductForm() {
    editingProductId = null;
    editingCreatedAt = null;
    ['npCode', 'npName', 'npBrand', 'npPrice'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('npCode').placeholder = DB.generateNextCode();
    document.getElementById('npCategory').value = 'sunglasses';
    renderSizeFields('sunglasses');
    pendingVariants = [];
    pendingMainImages = [];
    renderVariantList();
    renderMainImagesPreview();
    document.getElementById('aiReadStatus').textContent = '';
    document.getElementById('npError').textContent = '';
    document.getElementById('npEditingNotice').textContent = '';
    document.getElementById('npFormTitle').textContent = 'ลงสินค้าใหม่';
    document.getElementById('btnSaveProduct').textContent = 'บันทึกสินค้า';
    document.getElementById('btnCancelEdit').classList.add('hidden');
  }

  function editProduct(id) {
    const p = DB.getProduct(id);
    if (!p) return;
    editingProductId = p.id;
    editingCreatedAt = p.createdAt;

    switchView('newProduct');

    document.getElementById('npCode').value = p.code;
    document.getElementById('npName').value = p.name;
    document.getElementById('npBrand').value = p.brand;
    document.getElementById('npCategory').value = p.category;
    document.getElementById('npPrice').value = p.price;
    renderSizeFields(p.category);

    if (p.category === 'accessories') {
      const accWidthEl = document.getElementById('npAccWidth');
      const accLengthEl = document.getElementById('npAccLength');
      const materialEl = document.getElementById('npMaterial');
      if (accWidthEl) accWidthEl.value = p.accWidth != null ? p.accWidth : '';
      if (accLengthEl) accLengthEl.value = p.accLength != null ? p.accLength : '';
      if (materialEl) materialEl.value = p.material || '';
    } else {
      const fwEl = document.getElementById('npFrameWidth');
      const lwEl = document.getElementById('npLensWidth');
      const lhEl = document.getElementById('npLensHeight');
      const bwEl = document.getElementById('npBridgeWidth');
      const tlEl = document.getElementById('npTempleLength');
      if (fwEl) fwEl.value = p.frameWidth != null ? p.frameWidth : '';
      if (lwEl) lwEl.value = p.lensWidth != null ? p.lensWidth : '';
      if (lhEl) lhEl.value = p.lensHeight != null ? p.lensHeight : '';
      if (bwEl) bwEl.value = p.bridgeWidth != null ? p.bridgeWidth : '';
      if (tlEl) tlEl.value = p.templeLength != null ? p.templeLength : '';
    }

    pendingMainImages = (p.images || []).map((img, i) => ({
      original: (p.imagesOriginal && p.imagesOriginal[i]) || img,
      cropped: img,
    }));
    pendingVariants = p.variants.map(v => ({
      tempId: 'tmp_' + Math.random().toString(36).slice(2),
      existingId: v.id,
      color: v.color,
      stock: v.stock,
      images: v.images ? v.images.slice() : [],
    }));

    renderMainImagesPreview();
    renderVariantList();

    document.getElementById('npFormTitle').textContent = `แก้ไขสินค้า: ${p.code} · ${p.name}`;
    document.getElementById('npEditingNotice').textContent = 'กำลังแก้ไขสินค้าที่มีอยู่แล้ว — บันทึกจะอัปเดตทับข้อมูลเดิม ไม่สร้างรายการใหม่';
    document.getElementById('btnSaveProduct').textContent = 'บันทึกการแก้ไข';
    document.getElementById('btnCancelEdit').classList.remove('hidden');
    showToast('โหลดข้อมูลสินค้ามาแก้ไขแล้ว');
  }

  async function runAiReadFromImage() {
    const status = document.getElementById('aiReadStatus');
    if (!pendingMainImages.length) {
      status.style.color = '';
      status.textContent = 'กรุณาอัปโหลดภาพหลักของสินค้าก่อน';
      return;
    }
    const original = pendingMainImages[pendingMainImages.length - 1].original;
    const base64 = original.split(',')[1];
    status.style.color = '';
    status.textContent = 'AI กำลังอ่านข้อมูลจากภาพ...';

    const prompt = 'This photo shows one or more eyewear items (glasses/sunglasses), possibly with a product tag/label, and possibly with frame size markings printed on the inside of a temple arm (standard format like "52\u25a118-140" or "52-18-140", where the first number is lens width in mm, the middle number is bridge width in mm, and the last number is temple/arm length in mm). Respond with ONLY one JSON object, no markdown fences, no other text: {"productCode":string_or_null,"lensWidthMm":number_or_null,"bridgeWidthMm":number_or_null,"templeLengthMm":number_or_null,"colors":[string,...]}. productCode is any visible model/style code printed on a tag, label, or the frame itself (null if none is clearly visible). lensWidthMm, bridgeWidthMm and templeLengthMm must come only from a clearly visible, legible printed size marking (null if none visible or not legible \u2014 never guess a number). colors is a list of short Thai color names, one per distinct item/color visible in the photo (e.g. if there are 4 items of 4 different colors, list 4 color names); if you cannot tell colors apart or there is only one item, return a single-element array with your best guess.';

    let result;
    try {
      const resp = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType: 'image/jpeg', prompt }),
      });
      if (!resp.ok) throw new Error(`backend endpoint returned ${resp.status}`);
      const data = await resp.json();
      const text = (data.text || '').trim();
      const clean = text.replace(/```json|```/g, '').trim();
      result = JSON.parse(clean);
    } catch (e) {
      console.error('AI read failed:', e);
      status.style.color = 'var(--danger)';
      status.textContent = 'AI อ่านข้อมูลไม่สำเร็จ — ต้องมี backend /api/analyze-image ให้ใช้งานก่อน (ดู README) หรือกรอกข้อมูลเองแทนได้เลย';
      return;
    }

    const filled = [];
    if (result.productCode) { document.getElementById('npCode').value = result.productCode; filled.push('รหัสสินค้า'); }
    const lwEl = document.getElementById('npLensWidth');
    if (result.lensWidthMm && lwEl) { lwEl.value = result.lensWidthMm; filled.push('เลนส์กว้าง'); }
    const bwEl = document.getElementById('npBridgeWidth');
    if (result.bridgeWidthMm && bwEl) { bwEl.value = result.bridgeWidthMm; filled.push('สะพานแว่น'); }
    const tlEl = document.getElementById('npTempleLength');
    if (result.templeLengthMm && tlEl) { tlEl.value = result.templeLengthMm; filled.push('ความยาวขาแว่น'); }

    let colorsAdded = 0;
    if (Array.isArray(result.colors)) {
      result.colors.forEach(colorName => {
        if (!colorName) return;
        pendingVariants.push({ tempId: 'tmp_' + Math.random().toString(36).slice(2), color: String(colorName), stock: 5, images: [] });
        colorsAdded++;
      });
      if (colorsAdded) renderVariantList();
    }

    status.style.color = '';
    const parts = [];
    if (filled.length) parts.push(`เติมข้อมูล: ${filled.join(', ')}`);
    if (colorsAdded) parts.push(`เพิ่มตัวเลือกสี ${colorsAdded} สี (ยังไม่มีรูป — อัปโหลดรูปเพิ่มเองได้ด้านล่าง)`);
    status.textContent = parts.length ? parts.join(' · ') : 'AI ไม่พบข้อมูลที่อ่านได้ชัดเจนจากภาพนี้ — กรอกเองได้เลย';
  }

  // ================= Stock management =================
  let stockDetailProductId = null;

  function renderStock(filterText) {
    const searchWrap = document.getElementById('stockSearchWrap');
    if (stockDetailProductId) {
      searchWrap.classList.add('hidden');
      renderStockDetail(stockDetailProductId);
      return;
    }
    searchWrap.classList.remove('hidden');

    const q = (filterText != null ? filterText : (document.getElementById('stockSearch').value || '')).toLowerCase();
    const rows = [];
    DB.getProducts().forEach(p => {
      if (q && !(p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q))) return;
      const totalStock = p.variants.reduce((s, v) => s + v.stock, 0);
      rows.push(`
        <tr class="stock-item-row" data-view-product="${p.id}" style="cursor:pointer">
          <td>${p.code}</td>
          <td>${escapeHtml(p.name)}<div class="tag-muted">${escapeHtml(p.brand)}</div></td>
          <td>฿${p.price.toLocaleString()}</td>
          <td>${p.variants.length}</td>
          <td>${totalStock}</td>
          <td>
            <button class="btn btn-sm" data-view-product-btn="${p.id}" type="button">ดูรายละเอียด</button>
            <button class="btn btn-sm" data-edit-product-btn="${p.id}" type="button">แก้ไข</button>
          </td>
        </tr>`);
    });
    document.getElementById('stockContent').innerHTML = `
      <table>
        <thead><tr><th>รหัส</th><th>สินค้า</th><th>ราคา</th><th>จำนวนสี</th><th>สต็อกรวม</th><th></th></tr></thead>
        <tbody>${rows.length ? rows.join('') : `<tr><td colspan="6" class="tag-muted">ไม่พบสินค้า</td></tr>`}</tbody>
      </table>`;

    document.querySelectorAll('.stock-item-row').forEach(row => {
      row.addEventListener('click', () => {
        stockDetailProductId = row.dataset.viewProduct;
        renderStock();
      });
    });
    document.querySelectorAll('[data-view-product-btn]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        stockDetailProductId = btn.dataset.viewProductBtn;
        renderStock();
      });
    });
    document.querySelectorAll('[data-edit-product-btn]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        editProduct(btn.dataset.editProductBtn);
      });
    });
  }

  function renderStockDetail(productId) {
    const p = DB.getProduct(productId);
    if (!p) { stockDetailProductId = null; renderStock(); return; }
    document.getElementById('stockContent').innerHTML = `
      <button class="btn btn-sm" id="btnStockBack" type="button" style="margin-bottom:14px">← กลับไปดูรายการสินค้า</button>
      <button class="btn btn-sm" id="btnStockEdit" type="button" style="margin-bottom:14px">แก้ไขสินค้านี้</button>
      <h2 style="font-size:16px;margin-bottom:10px">${p.code} · ${escapeHtml(p.name)} <span class="tag-muted" style="font-weight:400">(${escapeHtml(p.brand)})</span></h2>
      <table>
        <thead><tr><th>สี</th><th>ราคา</th><th>สต็อก</th></tr></thead>
        <tbody>${p.variants.map(v => `
          <tr>
            <td>${escapeHtml(v.color)}</td>
            <td>฿${p.price.toLocaleString()}</td>
            <td><input type="number" class="stock-input" min="0" value="${v.stock}" data-pid="${p.id}" data-vid="${v.id}"></td>
          </tr>`).join('')}</tbody>
      </table>
    `;
    document.getElementById('btnStockBack').addEventListener('click', () => {
      stockDetailProductId = null;
      renderStock();
    });
    document.getElementById('btnStockEdit').addEventListener('click', () => editProduct(p.id));
    document.querySelectorAll('.stock-input').forEach(inp => {
      inp.addEventListener('change', async () => {
        await DB.updateVariantStock(inp.dataset.pid, inp.dataset.vid, inp.value);
        renderStockDetail(productId);
        showToast('อัปเดตสต็อกแล้ว');
      });
    });
  }
  document.getElementById('stockSearch').addEventListener('input', () => renderStock());

  // ================= Restock (Purchase Orders) =================
  let lowStockDefaultQty = null;

  function renderRestockView() {
    renderRestockLowStockPanel();
    renderRestockPicker();
    renderRestockDraft();
    renderRestockPendingList();
    renderRestockHistoryList();
  }

  function renderRestockLowStockPanel() {
    const cfg = DB.getConfig();
    const low = DB.lowStockVariants(cfg.lowStockThreshold);
    const panel = document.getElementById('restockLowStockPanel');
    if (!low.length) {
      panel.innerHTML = `<h2>สินค้าใกล้หมด/หมดสต็อก</h2><div class="tag-muted">ไม่มีสินค้าใกล้หมดตอนนี้</div>`;
      return;
    }
    const defaultQty = lowStockDefaultQty || 0;
    lowStockDefaultQty = null;
    panel.innerHTML = `
      <h2>สินค้าใกล้หมด/หมดสต็อก (${low.length} รายการ, เกณฑ์ ≤ ${cfg.lowStockThreshold} ชิ้น)</h2>
      <table id="lowStockOrderTable">
        <thead><tr><th>รหัส</th><th>สินค้า</th><th>สี</th><th>คงเหลือ</th><th>จะสั่ง</th></tr></thead>
        <tbody>${low.map(x => `
          <tr>
            <td>${x.product.code}</td>
            <td>${escapeHtml(x.product.name)}<div class="tag-muted">${escapeHtml(x.product.brand)}</div></td>
            <td>${escapeHtml(x.variant.color)}</td>
            <td style="color:${x.variant.stock === 0 ? 'var(--danger)' : 'var(--warn)'}">${x.variant.stock}</td>
            <td><input type="number" class="stock-input low-order-qty" min="0" value="${defaultQty}"
                  data-pid="${x.product.id}" data-vid="${x.variant.id}"></td>
          </tr>`).join('')}</tbody>
      </table>
    `;
  }

  function renderRestockPicker(filterText) {
    const q = (filterText != null ? filterText : (document.getElementById('restockSearch').value || '')).toLowerCase();
    const tbody = document.getElementById('restockPickerBody');
    if (!q) {
      tbody.innerHTML = `<tr><td colspan="6" class="tag-muted">พิมพ์คำค้นหาด้านบนเพื่อดูรายการสินค้า</td></tr>`;
      return;
    }
    const rows = [];
    DB.getProducts().forEach(p => {
      if (!(p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q))) return;
      p.variants.forEach(v => {
        const already = restockDraft.find(d => d.variantId === v.id);
        rows.push(`
          <tr>
            <td>${p.code}</td>
            <td>${escapeHtml(p.name)}<div class="tag-muted">${escapeHtml(p.brand)}</div></td>
            <td>${escapeHtml(v.color)}</td>
            <td>${v.stock}</td>
            <td><input type="number" class="stock-input restock-qty-input" min="1" value="10" data-pid="${p.id}" data-vid="${v.id}"></td>
            <td><button class="btn btn-sm" data-add-restock="${p.id}|${v.id}" ${already ? 'disabled' : ''}>${already ? 'เพิ่มแล้ว' : 'เพิ่ม'}</button></td>
          </tr>`);
      });
    });
    tbody.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="6" class="tag-muted">ไม่พบสินค้า</td></tr>`;

    document.querySelectorAll('[data-add-restock]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [pid, vid] = btn.dataset.addRestock.split('|');
        const p = DB.getProduct(pid);
        const v = p.variants.find(x => x.id === vid);
        const qtyInput = document.querySelector(`.restock-qty-input[data-pid="${pid}"][data-vid="${vid}"]`);
        const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        restockDraft.push({ productId: p.id, variantId: v.id, code: p.code, name: p.name, color: v.color, qtyOrdered: qty, currentStock: v.stock });
        renderRestockPicker(q);
        renderRestockDraft();
      });
    });
  }
  document.getElementById('restockSearch').addEventListener('input', e => renderRestockPicker(e.target.value.toLowerCase()));

  function renderRestockDraft() {
    const wrap = document.getElementById('restockDraftWrap');
    if (!restockDraft.length) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    document.getElementById('restockDraftBody').innerHTML = restockDraft.map((d, idx) => `
      <tr>
        <td>${d.code}</td>
        <td>${escapeHtml(d.name)}</td>
        <td>${escapeHtml(d.color)}</td>
        <td><input type="number" class="stock-input" min="1" value="${d.qtyOrdered}" data-draft-idx="${idx}"></td>
        <td><button class="btn btn-sm btn-danger" data-remove-draft="${idx}" type="button">ลบ</button></td>
      </tr>`).join('');

    document.querySelectorAll('[data-draft-idx]').forEach(inp => {
      inp.addEventListener('change', () => {
        restockDraft[Number(inp.dataset.draftIdx)].qtyOrdered = Math.max(1, parseInt(inp.value, 10) || 1);
      });
    });
    document.querySelectorAll('[data-remove-draft]').forEach(btn => {
      btn.addEventListener('click', () => {
        restockDraft.splice(Number(btn.dataset.removeDraft), 1);
        renderRestockDraft();
        renderRestockPicker();
      });
    });
  }

  // ---- Review-before-save: merges the low-stock qty inputs + any manually-added extra items ----
  function collectRestockItems() {
    const map = new Map();
    document.querySelectorAll('.low-order-qty').forEach(inp => {
      const qty = parseInt(inp.value, 10) || 0;
      if (qty <= 0) return;
      const p = DB.getProduct(inp.dataset.pid);
      if (!p) return;
      const v = p.variants.find(x => x.id === inp.dataset.vid);
      if (!v) return;
      map.set(v.id, { productId: p.id, variantId: v.id, code: p.code, name: p.name, color: v.color, qtyOrdered: qty, currentStock: v.stock });
    });
    restockDraft.forEach(d => { if (!map.has(d.variantId)) map.set(d.variantId, d); });
    return Array.from(map.values());
  }

  function setupRestockActions() {
    document.getElementById('btnReviewRestock').addEventListener('click', openRestockReviewModal);
    document.getElementById('btnExportCsv').addEventListener('click', exportLowStockCsv);
    document.getElementById('btnExportImage').addEventListener('click', exportLowStockImage);
    document.getElementById('btnConfirmCreateRestock').addEventListener('click', confirmCreateRestockFromReview);
    document.getElementById('toggleAddOtherPanel').addEventListener('click', () => {
      const body = document.getElementById('addOtherPanelBody');
      const icon = document.getElementById('addOtherToggleIcon');
      const opening = body.classList.contains('hidden');
      body.classList.toggle('hidden');
      icon.textContent = opening ? '▾' : '▸';
    });
  }

  let restockReviewItems = [];

  function openRestockReviewModal() {
    restockReviewItems = collectRestockItems();
    const err = document.getElementById('restockReviewError');
    const body = document.getElementById('restockReviewBody');
    if (!restockReviewItems.length) {
      err.textContent = 'กรุณาใส่จำนวนที่จะสั่งอย่างน้อย 1 รายการ ก่อนตรวจสอบ';
      body.innerHTML = '';
    } else {
      err.textContent = '';
      body.innerHTML = restockReviewItems.map(it => `
        <tr><td>${it.code}</td><td>${escapeHtml(it.name)}</td><td>${escapeHtml(it.color)}</td><td>${it.qtyOrdered}</td></tr>
      `).join('');
    }
    document.getElementById('restockReviewModal').classList.add('show');
  }

  async function confirmCreateRestockFromReview() {
    if (!restockReviewItems.length) return;
    const note = document.getElementById('restockReviewNote').value.trim();
    await DB.createRestock({ items: restockReviewItems, note });
    restockDraft = [];
    restockReviewItems = [];
    document.getElementById('restockReviewNote').value = '';
    document.getElementById('restockReviewModal').classList.remove('show');
    showToast('สร้างใบสั่งซื้อเรียบร้อย รอตรวจรับเมื่อของมาถึง');
    renderRestockView();
  }

  function exportLowStockCsv() {
    const cfg = DB.getConfig();
    const low = DB.lowStockVariants(cfg.lowStockThreshold);
    if (!low.length) { showToast('ไม่มีสินค้าใกล้หมดให้ส่งออก'); return; }
    const header = ['รหัส', 'ชื่อ', 'สี', 'แบรนด์', 'คงเหลือ'];
    const rows = low.map(x => [x.product.code, x.product.name, x.variant.color, x.product.brand, x.variant.stock]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `low-stock-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportLowStockImage() {
    const table = document.getElementById('lowStockOrderTable');
    if (!table) { showToast('ไม่มีสินค้าใกล้หมดให้ส่งออก'); return; }
    if (typeof html2canvas === 'undefined') { showToast('ไม่สามารถส่งออกรูปภาพได้ในขณะนี้'); return; }
    showToast('กำลังสร้างรูปภาพ...');
    try {
      const canvas = await html2canvas(table, { backgroundColor: '#ffffff', scale: 2 });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `low-stock-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (e) {
      console.error(e);
      showToast('ส่งออกรูปภาพไม่สำเร็จ');
    }
  }

  function renderRestockPendingList() {
    const list = DB.getRestocks().filter(r => r.status === 1);
    const wrap = document.getElementById('restockPendingList');
    if (!list.length) { wrap.innerHTML = `<div class="tag-muted">ไม่มีใบสั่งซื้อที่รอตรวจรับ</div>`; return; }
    wrap.innerHTML = list.map(r => `
      <div class="order-card" data-rid="${r.id}">
        <div class="order-card-head" data-toggle-po="${r.id}">
          <div><strong>${r.poNo}</strong> <span class="tag-muted">${new Date(r.createdAt).toLocaleString('th-TH')}</span></div>
          <div>${escapeHtml(r.note || '-')}</div>
          <span class="status-pill status-1">รอตรวจรับ</span>
        </div>
        <div class="order-card-body" id="po-body-${r.id}">
          <table>
            <thead><tr><th>สินค้า</th><th>สี</th><th>สั่งไป</th><th>ได้รับจริง (ตรวจนับก่อนกดยืนยัน)</th></tr></thead>
            <tbody>${r.items.map((it, idx) => `
              <tr>
                <td>${it.code} ${escapeHtml(it.name)}</td>
                <td>${escapeHtml(it.color)}</td>
                <td>${it.qtyOrdered}</td>
                <td><input type="number" class="stock-input po-recv-input" min="0" value="${it.qtyReceived}" data-rid="${r.id}" data-idx="${idx}"></td>
              </tr>`).join('')}</tbody>
          </table>
          <div class="order-actions" style="margin-top:14px">
            <button class="btn btn-primary" data-confirm-po="${r.id}">ยืนยันตรวจรับเข้าสต็อก</button>
          </div>
        </div>
      </div>
    `).join('');

    wrap.querySelectorAll('[data-toggle-po]').forEach(el => {
      el.addEventListener('click', () => document.getElementById('po-body-' + el.dataset.togglePo).classList.toggle('show'));
    });
    wrap.querySelectorAll('.po-recv-input').forEach(inp => {
      inp.addEventListener('change', async e => {
        e.stopPropagation();
        await DB.updateRestockReceivedQty(inp.dataset.rid, Number(inp.dataset.idx), inp.value);
      });
      inp.addEventListener('click', e => e.stopPropagation());
    });
    wrap.querySelectorAll('[data-confirm-po]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await DB.confirmRestockReceive(btn.dataset.confirmPo);
        showToast('ตรวจรับเข้าสต็อกเรียบร้อย');
        renderRestockView();
      });
    });
  }

  function renderRestockHistoryList() {
    const list = DB.getRestocks().filter(r => r.status === 2);
    const wrap = document.getElementById('restockHistoryList');
    if (!list.length) { wrap.innerHTML = `<div class="tag-muted">ยังไม่มีประวัติ</div>`; return; }
    wrap.innerHTML = `<table><thead><tr><th>เลขที่</th><th>วันที่รับ</th><th>รายการ</th><th>หมายเหตุ</th></tr></thead><tbody>
      ${list.map(r => `<tr><td>${r.poNo}</td><td>${new Date(r.receivedAt).toLocaleString('th-TH')}</td><td>${r.items.map(it => `${it.code} ${escapeHtml(it.color)} ×${it.qtyReceived}`).join(', ')}</td><td>${escapeHtml(r.note || '-')}</td></tr>`).join('')}
    </tbody></table>`;
  }

  // ================= Orders =================
  function renderOrderActionsHtml(o) {
    if (o.status === 1) {
      const slipHtml = o.paymentSlip
        ? `<div style="margin-bottom:10px">
             <div class="tag-muted" style="margin-bottom:4px">สลิปโอนเงินที่ลูกค้าแนบมา (คลิกเพื่อดูขนาดเต็ม):</div>
             <a href="${o.paymentSlip}" target="_blank"><img src="${o.paymentSlip}" style="max-width:200px;border-radius:8px;border:1px solid var(--border)"></a>
           </div>`
        : `<div class="tag-muted" style="margin-bottom:10px">ลูกค้าไม่ได้แนบสลิปมา — ตรวจสอบยอดโอนเข้าบัญชีร้านเองก่อนกดยืนยัน</div>`;
      return `${slipHtml}<button class="btn btn-primary" data-advance="${o.id}">ตรวจสลิป/ยอดโอนแล้ว → ไปขั้นตอนโทรยืนยัน</button>`;
    }
    if (o.status === 2) {
      const codNote = o.paymentMethod === 'cod' ? ' (ออเดอร์เก็บเงินปลายทาง ควรย้ำยอดที่ต้องชำระตอนรับของ ฿' + o.total.toLocaleString() + ' ด้วย)' : '';
      return `
        <div class="tag-muted" style="margin-bottom:8px">โทรยืนยันออเดอร์กับลูกค้าก่อน${codNote} แล้วค่อยกดพิมพ์ใบปะหน้า</div>
        <button class="btn btn-primary" data-print-label="${o.id}">🖨 พิมพ์ใบปะหน้า (ยืนยันโทร + แพ็คแล้ว)</button>
      `;
    }
    if (o.status === 3) {
      return `
        <div class="field" style="max-width:280px">
          <label>ขนส่ง (บังคับเลือกก่อนยืนยันจัดส่ง)</label>
          <select id="courier-${o.id}">
            <option value="">— เลือกขนส่ง —</option>
            ${Object.entries(DB.COURIERS).map(([key, label]) => `<option value="${key}">${escapeHtml(label)}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="max-width:280px">
          <label>เลข Tracking (บังคับกรอกก่อนยืนยันจัดส่ง)</label>
          <input type="text" id="tracking-${o.id}" placeholder="เช่น TH0123456789">
        </div>
        <div class="error-text" id="tracking-err-${o.id}"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" data-print-label="${o.id}" type="button">🖨 พิมพ์ใบปะหน้าอีกครั้ง</button>
          <button class="btn btn-primary" data-confirm-ship="${o.id}" type="button">ยืนยันจัดส่งแล้ว</button>
        </div>
      `;
    }
    // status 4 — จัดส่งแล้ว
    if (o.paymentMethod === 'cod') {
      if (!o.codDeliveryStatus) {
        return `
          <div class="tag-muted" style="margin-bottom:8px">ติดตามผลการส่ง COD:</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" data-cod-delivered="${o.id}" type="button">✓ ส่งสำเร็จ เก็บเงินได้แล้ว</button>
            <button class="btn btn-danger" data-cod-returned="${o.id}" type="button">✗ ตีกลับ (คืนสต็อกอัตโนมัติ)</button>
          </div>
        `;
      }
      return o.codDeliveryStatus === 'delivered'
        ? `<span class="status-pill status-3">ส่งสำเร็จ เก็บเงินแล้ว</span>`
        : `<span class="status-pill status-1">ตีกลับ — คืนสต็อกให้อัตโนมัติแล้ว</span>`;
    }
    return `<span class="status-pill status-4">จัดส่งเรียบร้อยแล้ว</span>`;
  }

  function printShippingLabel(order) {
    const win = window.open('', '_blank', 'width=420,height=650');
    if (!win) { showToast('เบราว์เซอร์บล็อกป๊อปอัพ กรุณาอนุญาตแล้วลองใหม่'); return; }
    const c = order.customer;
    const cfg = DB.getConfig();
    const codLine = order.paymentMethod === 'cod'
      ? `<div class="cod-amount">เก็บเงินปลายทาง<br>฿${order.total.toLocaleString()}</div>`
      : '';
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบปะหน้า ${escapeHtml(order.orderNo)}</title>
      <style>
        @page { size: 4in 6in; margin: 0; }
        body { margin:0; padding:0.2in; font-family: Arial, Tahoma, sans-serif; color:#000; width:3.6in; box-sizing:border-box; }
        .label-box { border:2px solid #000; border-radius:4px; overflow:hidden; }
        .order-strip { display:flex; justify-content:space-between; align-items:center; padding:6px 10px; border-bottom:2px solid #000; font-size:11px; }
        .order-strip .brand { font-weight:bold; font-size:13px; }
        .section { padding:8px 10px; }
        .section + .section { border-top:2px dashed #000; }
        .sec-label { font-size:10px; letter-spacing:0.05em; color:#333; margin-bottom:3px; }
        .from-name { font-size:13px; font-weight:bold; }
        .from-detail { font-size:11px; line-height:1.4; color:#222; }
        .to-name { font-size:21px; font-weight:bold; margin:2px 0; }
        .to-phone { font-size:16px; font-weight:bold; margin-bottom:4px; }
        .to-address { font-size:14px; line-height:1.5; }
        .cod-amount { margin:8px 10px 0; padding:10px; border:3px solid #000; text-align:center; font-size:20px; font-weight:bold; }
      </style></head><body>
        <div class="label-box">
          <div class="order-strip"><span class="brand">OptiHub</span><span>เลขที่ออเดอร์ ${escapeHtml(order.orderNo)}</span></div>
          <div class="section">
            <div class="sec-label">ผู้ส่ง (FROM)</div>
            <div class="from-name">OptiHub (ศูนย์รวมแว่นตา OH)</div>
            <div class="from-detail">${cfg.shopAddress ? escapeHtml(cfg.shopAddress) : '<span style="color:#999">— ยังไม่ได้ตั้งค่าที่อยู่ร้าน —</span>'}${cfg.shopPhone ? '<br>โทร ' + escapeHtml(cfg.shopPhone) : ''}</div>
          </div>
          <div class="section">
            <div class="sec-label">ผู้รับ (TO)</div>
            <div class="to-name">${escapeHtml(c.name)}</div>
            <div class="to-phone">โทร ${escapeHtml(c.phone)}${c.lineId ? ' · LINE: ' + escapeHtml(c.lineId) : ''}</div>
            <div class="to-address">${escapeHtml(c.address)}<br>ต.${escapeHtml(c.subdistrict)} อ.${escapeHtml(c.district)}<br>จ.${escapeHtml(c.province)} ${escapeHtml(c.zipcode)}</div>
          </div>
        </div>
        ${codLine}
      </body></html>`);
    win.document.close();
    win.onload = () => win.print();
  }

  function printReceipt(order) {
    const win = window.open('', '_blank', 'width=420,height=650');
    if (!win) { showToast('เบราว์เซอร์บล็อกป๊อปอัพ กรุณาอนุญาตแล้วลองใหม่'); return; }
    const c = order.customer;
    const cfg = DB.getConfig();
    const subtotal = order.subtotal != null ? order.subtotal : order.total;
    const rows = order.items.map(it => `
      <tr>
        <td>${escapeHtml(it.code)} ${escapeHtml(it.name)} (${escapeHtml(it.color)})</td>
        <td style="text-align:center">${it.qty}</td>
        <td style="text-align:right">฿${it.price.toLocaleString()}</td>
        <td style="text-align:right">฿${(it.price * it.qty).toLocaleString()}</td>
      </tr>`).join('');
    const feeRow = (label, amount, negative) => amount
      ? `<tr><td colspan="3" style="text-align:right">${label}</td><td style="text-align:right">${negative ? '−' : ''}฿${amount.toLocaleString()}</td></tr>`
      : '';
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบเสร็จรับเงิน ${escapeHtml(order.orderNo)}</title>
      <style>
        @page { size: 4in 6in; margin: 0; }
        body { margin:0; padding:0.25in; font-family: Arial, Tahoma, sans-serif; color:#000; width:3.5in; box-sizing:border-box; font-size:12px; }
        h1 { font-size:15px; margin:0 0 2px; }
        .sub { font-size:11px; color:#333; margin-bottom:10px; }
        table { width:100%; border-collapse:collapse; }
        thead th { text-align:left; border-bottom:1px solid #000; padding:4px 2px; font-size:11px; }
        tbody td, tfoot td { padding:3px 2px; font-size:11.5px; }
        tfoot tr:last-child td { border-top:1px solid #000; font-weight:bold; font-size:13px; padding-top:6px; }
        .meta { margin:10px 0; line-height:1.6; }
      </style></head><body>
        <h1>OptiHub (ศูนย์รวมแว่นตา OH)</h1>
        <div class="sub">${cfg.shopAddress ? escapeHtml(cfg.shopAddress) : ''}${cfg.shopPhone ? ' · โทร ' + escapeHtml(cfg.shopPhone) : ''}</div>
        <div class="meta">
          <strong>ใบเสร็จรับเงิน</strong><br>
          เลขที่ออเดอร์: ${escapeHtml(order.orderNo)}<br>
          วันที่: ${new Date(order.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}<br>
          ลูกค้า: ${escapeHtml(c.name)} (โทร ${escapeHtml(c.phone)})<br>
          ชำระเงิน: ${order.paymentMethod === 'cod' ? 'เก็บเงินปลายทาง (COD)' : 'พร้อมเพย์'}
        </div>
        <table>
          <thead><tr><th>รายการ</th><th style="text-align:center">จำนวน</th><th style="text-align:right">ราคา/ชิ้น</th><th style="text-align:right">รวม</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr><td colspan="3" style="text-align:right">ยอดสินค้า</td><td style="text-align:right">฿${subtotal.toLocaleString()}</td></tr>
            ${feeRow('ค่าจัดส่ง', order.shippingFee)}
            ${feeRow('ค่าบริการออเดอร์เล็ก', order.smallOrderFee)}
            ${feeRow('ค่าบริการเก็บเงินปลายทาง', order.codFee)}
            ${feeRow('ส่วนลด' + (order.promoCode ? ' (' + escapeHtml(order.promoCode) + ')' : ''), order.discountAmount, true)}
            <tr><td colspan="3" style="text-align:right">ยอดรวมสุทธิ</td><td style="text-align:right">฿${order.total.toLocaleString()}</td></tr>
          </tfoot>
        </table>
      </body></html>`);
    win.document.close();
    win.onload = () => win.print();
  }

  function renderOrders() {
    const orders = DB.getOrders();
    const wrap = document.getElementById('orderList');
    if (!orders.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="big">📦</div>ยังไม่มีคำสั่งซื้อ</div>`;
      return;
    }
    wrap.innerHTML = orders.map(o => `
      <div class="order-card" data-oid="${o.id}">
        <div class="order-card-head" data-toggle="${o.id}">
          <div><strong>${o.orderNo}</strong> <span class="tag-muted">${new Date(o.createdAt).toLocaleString('th-TH')}</span></div>
          <div>${escapeHtml(o.customer.name)} · ฿${o.total.toLocaleString()}</div>
          <span class="status-pill status-${o.status}">${DB.STATUS[o.status]}</span>
        </div>
        <div class="order-card-body" id="body-${o.id}">
          <div class="order-meta-grid">
            <div><strong>ผู้รับ:</strong> ${escapeHtml(o.customer.name)}</div>
            <div><strong>เบอร์โทร:</strong> ${escapeHtml(o.customer.phone)}</div>
            <div><strong>LINE ID:</strong> ${escapeHtml(o.customer.lineId || '-')}</div>
            <div><strong>รหัสไปรษณีย์:</strong> ${escapeHtml(o.customer.zipcode)}</div>
            <div><strong>ชำระเงิน:</strong> ${o.paymentMethod === 'cod' ? 'เก็บเงินปลายทาง (COD)' : 'พร้อมเพย์'}</div>
            <div><strong>คูปอง:</strong> ${o.promoCode ? escapeHtml(o.promoCode) : '-'}</div>
            <div><strong>ขนส่ง:</strong> ${o.courier ? escapeHtml(DB.COURIERS[o.courier] || o.courier) : '-'}</div>
            <div><strong>เลข Tracking:</strong> ${o.trackingNo ? escapeHtml(o.trackingNo) : '-'}</div>
            <div class="span2" style="grid-column:1/-1"><strong>ที่อยู่:</strong> ${escapeHtml(o.customer.address)} ต.${escapeHtml(o.customer.subdistrict)} อ.${escapeHtml(o.customer.district)} จ.${escapeHtml(o.customer.province)} ${escapeHtml(o.customer.zipcode)}</div>
          </div>
          <table><thead><tr><th>สินค้า</th><th>สี</th><th>จำนวน</th><th>ราคา</th></tr></thead>
          <tbody>${o.items.map(it => `<tr><td>${it.code} ${escapeHtml(it.name)}</td><td>${escapeHtml(it.color)}</td><td>${it.qty}</td><td>฿${(it.price * it.qty).toLocaleString()}</td></tr>`).join('')}</tbody></table>
          <div style="text-align:right;font-size:13px;margin-top:8px;color:var(--text-muted)">
            ยอดสินค้า ฿${(o.subtotal != null ? o.subtotal : o.total).toLocaleString()}
            · ค่าส่ง ${o.shippingFee ? '฿' + o.shippingFee.toLocaleString() : 'ฟรี'}
            ${o.smallOrderFee ? ` · ค่าบริการออเดอร์เล็ก ฿${o.smallOrderFee.toLocaleString()}` : ''}
            ${o.codFee ? ` · ค่าบริการ COD ฿${o.codFee.toLocaleString()}` : ''}
            ${o.discountAmount ? ` · ส่วนลด −฿${o.discountAmount.toLocaleString()}` : ''}
            · รวม <strong style="color:var(--text)">฿${o.total.toLocaleString()}</strong>
          </div>
          <div class="order-actions" style="margin-top:14px">
            ${renderOrderActionsHtml(o)}
            <button class="btn btn-sm" data-print-receipt="${o.id}" type="button" style="margin-top:8px">🧾 ออกใบเสร็จรับเงิน</button>
          </div>
        </div>
      </div>
    `).join('');

    wrap.querySelectorAll('[data-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        document.getElementById('body-' + el.dataset.toggle).classList.toggle('show');
      });
    });
    wrap.querySelectorAll('[data-advance]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const o = DB.getOrder(btn.dataset.advance);
        await DB.updateOrderStatus(o.id, DB.nextStatus(o.status));
        renderOrders();
        showToast('อัปเดตสถานะออเดอร์แล้ว');
      });
    });
    wrap.querySelectorAll('[data-print-label]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const o = DB.getOrder(btn.dataset.printLabel);
        printShippingLabel(o);
        if (o.status === 2) {
          await DB.updateOrderStatus(o.id, 3);
          renderOrders();
          showToast('พิมพ์ใบปะหน้าแล้ว — มาร์คว่าแพ็คสินค้าเรียบร้อย');
        }
      });
    });
    wrap.querySelectorAll('[data-confirm-ship]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const oid = btn.dataset.confirmShip;
        const courierSel = document.getElementById(`courier-${oid}`);
        const input = document.getElementById(`tracking-${oid}`);
        const err = document.getElementById(`tracking-err-${oid}`);
        const courier = courierSel.value;
        const trackingNo = input.value.trim();
        if (!courier) { err.textContent = 'กรุณาเลือกขนส่งก่อนยืนยันจัดส่ง'; return; }
        if (!trackingNo) { err.textContent = 'กรุณากรอกเลข Tracking ก่อนยืนยันจัดส่ง'; return; }
        await DB.setTrackingAndShip(oid, trackingNo, courier);
        renderOrders();
        showToast('บันทึกเลข Tracking และยืนยันจัดส่งแล้ว');
      });
    });
    wrap.querySelectorAll('[data-print-receipt]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const o = DB.getOrder(btn.dataset.printReceipt);
        printReceipt(o);
      });
    });
    wrap.querySelectorAll('[data-cod-delivered]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await DB.markCodDelivered(btn.dataset.codDelivered);
        renderOrders();
        showToast('บันทึกผลส่งสำเร็จแล้ว');
      });
    });
    wrap.querySelectorAll('[data-cod-returned]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('ยืนยันว่าออเดอร์นี้ตีกลับจริง? ระบบจะคืนสต็อกสินค้าทั้งหมดในออเดอร์นี้ให้อัตโนมัติ')) return;
        await DB.markCodReturned(btn.dataset.codReturned);
        renderOrders();
        showToast('บันทึกผลตีกลับและคืนสต็อกแล้ว');
      });
    });
  }

  // ================= CRM =================
  function renderCrm() {
    const customers = DB.getCustomers();
    const wrap = document.getElementById('crmBody');
    if (!customers.length) {
      wrap.innerHTML = `<tr><td colspan="5" class="tag-muted">ยังไม่มีข้อมูลลูกค้า</td></tr>`;
      return;
    }
    wrap.innerHTML = customers.map(c => {
      const stats = DB.getCustomerStats(c.phone);
      const rowId = 'crm_' + c.phone.replace(/\D/g, '');
      return `
      <tr class="crm-row" data-toggle="${rowId}">
        <td>${escapeHtml(c.phone)}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.province)}</td>
        <td>${stats.orderCount}</td><td>฿${stats.totalSpent.toLocaleString()}</td>
      </tr>
      <tr class="crm-detail" id="${rowId}">
        <td colspan="5">
          <table>
            <thead><tr><th>เลขที่ออเดอร์</th><th>วันที่</th><th>ยอดรวม</th><th>สถานะ</th></tr></thead>
            <tbody>${stats.orders.map(o => `<tr><td>${o.orderNo}</td><td>${new Date(o.createdAt).toLocaleDateString('th-TH')}</td><td>฿${o.total.toLocaleString()}</td><td><span class="status-pill status-${o.status}">${DB.STATUS[o.status]}</span></td></tr>`).join('')}</tbody>
          </table>
        </td>
      </tr>`;
    }).join('');
    wrap.querySelectorAll('.crm-row').forEach(row => {
      row.addEventListener('click', () => {
        document.getElementById(row.dataset.toggle).classList.toggle('show');
      });
    });
  }

  // ================= Reviews =================
  function renderReviews() {
    const reviews = DB.getReviews();
    const wrap = document.getElementById('reviewsBody');
    if (!reviews.length) {
      wrap.innerHTML = `<div class="panel"><div class="tag-muted">ยังไม่มีรีวิวจากลูกค้า</div></div>`;
      return;
    }
    wrap.innerHTML = reviews.map(r => {
      const order = DB.getOrder(r.orderId);
      return `
      <div class="panel" style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div><strong>${escapeHtml(r.customerName)}</strong><span class="tag-muted"> · ${escapeHtml(r.phone)}${order ? ' · ออเดอร์ ' + escapeHtml(order.orderNo) : ''}</span></div>
          <span class="tag-muted">${new Date(r.createdAt).toLocaleDateString('th-TH')}</span>
        </div>
        <div id="review-view-${r.id}" style="margin-top:8px">
          <div class="star-picker" style="pointer-events:none">${[1, 2, 3, 4, 5].map(n => `<span class="${n <= r.rating ? 'on' : ''}">★</span>`).join('')}</div>
          <div style="margin-top:6px">${r.comment ? escapeHtml(r.comment) : '<span class="tag-muted">— ไม่มีความคิดเห็นเพิ่มเติม —</span>'}</div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn btn-sm" data-edit-review="${r.id}" type="button">แก้ไข</button>
            <button class="btn btn-sm btn-danger" data-delete-review="${r.id}" type="button">ลบ</button>
          </div>
        </div>
        <div id="review-edit-${r.id}" style="display:none;margin-top:8px">
          <div class="field"><label>คะแนน</label>
            <select id="review-rating-${r.id}">
              ${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${n === r.rating ? 'selected' : ''}>${n} ดาว</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>ความคิดเห็น</label><textarea id="review-comment-${r.id}">${escapeHtml(r.comment)}</textarea></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" data-save-review="${r.id}" type="button">บันทึก</button>
            <button class="btn btn-sm" data-cancel-review="${r.id}" type="button">ยกเลิก</button>
          </div>
        </div>
      </div>`;
    }).join('');

    wrap.querySelectorAll('[data-edit-review]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('review-view-' + btn.dataset.editReview).style.display = 'none';
        document.getElementById('review-edit-' + btn.dataset.editReview).style.display = 'block';
      });
    });
    wrap.querySelectorAll('[data-cancel-review]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('review-edit-' + btn.dataset.cancelReview).style.display = 'none';
        document.getElementById('review-view-' + btn.dataset.cancelReview).style.display = 'block';
      });
    });
    wrap.querySelectorAll('[data-save-review]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.saveReview;
        const rating = document.getElementById('review-rating-' + id).value;
        const comment = document.getElementById('review-comment-' + id).value;
        await DB.updateReview(id, { rating, comment });
        showToast('บันทึกการแก้ไขรีวิวแล้ว');
        renderReviews();
      });
    });
    wrap.querySelectorAll('[data-delete-review]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('ลบรีวิวนี้แน่ใจไหม? กู้คืนไม่ได้')) return;
        await DB.deleteReview(btn.dataset.deleteReview);
        showToast('ลบรีวิวแล้ว');
        renderReviews();
      });
    });
  }

  // ================= Promotions (coupon codes) =================
  function renderPromotions() {
    const promos = DB.getPromotions();
    const wrap = document.getElementById('promoBody');
    if (!promos.length) {
      wrap.innerHTML = `<tr><td colspan="7" class="tag-muted">ยังไม่มีโค้ดโปรโมชั่น</td></tr>`;
      return;
    }
    wrap.innerHTML = promos.map(p => {
      const type = p.type || 'freeship'; // โค้ดเก่าก่อนมีฟีเจอร์นี้ ถือเป็นส่งฟรีตามเดิม
      const typeLabel = type === 'amount' ? `ส่วนลด ฿${(p.discountAmount || 0).toLocaleString()}` : 'ส่งฟรี';
      return `
      <tr>
        <td><strong>${escapeHtml(p.code)}</strong></td>
        <td>${typeLabel}</td>
        <td>${p.maxUses}</td>
        <td>${p.timesApplied}</td>
        <td>${p.timesRedeemed} / ${p.maxUses}</td>
        <td>${p.active ? '<span class="status-pill status-3">ใช้งานอยู่</span>' : '<span class="status-pill status-1">ปิดใช้งาน</span>'}</td>
        <td>
          <button class="btn btn-sm" data-toggle-promo="${p.id}" data-active="${p.active ? '0' : '1'}" type="button">${p.active ? 'ปิด' : 'เปิด'}</button>
          <button class="btn btn-sm btn-danger" data-delete-promo="${p.id}" type="button">ลบ</button>
        </td>
      </tr>
    `;
    }).join('');
    wrap.querySelectorAll('[data-toggle-promo]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await DB.setPromotionActive(btn.dataset.togglePromo, btn.dataset.active === '1');
        renderPromotions();
      });
    });
    wrap.querySelectorAll('[data-delete-promo]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('ลบโค้ดนี้แน่ใจไหม? กู้คืนไม่ได้')) return;
        await DB.deletePromotion(btn.dataset.deletePromo);
        renderPromotions();
      });
    });
  }

  function setupPromotions() {
    document.getElementById('promoType').addEventListener('change', e => {
      document.getElementById('promoAmountField').style.display = e.target.value === 'amount' ? 'block' : 'none';
    });
    document.getElementById('btnCreatePromo').addEventListener('click', async () => {
      const codeEl = document.getElementById('promoCode');
      const maxUsesEl = document.getElementById('promoMaxUses');
      const typeEl = document.getElementById('promoType');
      const discountEl = document.getElementById('promoDiscountAmount');
      const err = document.getElementById('promoFormError');
      const code = codeEl.value.trim().toUpperCase();
      const maxUses = parseInt(maxUsesEl.value, 10);
      const type = typeEl.value;
      const discountAmount = parseInt(discountEl.value, 10);
      if (!code) { err.textContent = 'กรุณากรอกชื่อโค้ด'; return; }
      if (DB.getPromotionByCode(code)) { err.textContent = 'มีโค้ดนี้อยู่แล้ว กรุณาใช้ชื่ออื่น'; return; }
      if (!maxUses || maxUses < 1) { err.textContent = 'กรุณากรอกจำนวนสิทธิ์ให้ถูกต้อง'; return; }
      if (type === 'amount' && (!discountAmount || discountAmount < 1)) { err.textContent = 'กรุณากรอกจำนวนเงินส่วนลดให้ถูกต้อง'; return; }
      err.textContent = '';
      await DB.createPromotion({ code, maxUses, type, discountAmount });
      codeEl.value = '';
      maxUsesEl.value = 50;
      typeEl.value = 'freeship';
      discountEl.value = '';
      document.getElementById('promoAmountField').style.display = 'none';
      showToast(`สร้างโค้ด ${code} เรียบร้อย`);
      renderPromotions();
    });
  }

  // ================= Settings =================
  function setupSettings() {
    document.getElementById('btnSaveSettings').addEventListener('click', async () => {
      const promptpayId = document.getElementById('stPromptpay').value.trim();
      const lowStockThreshold = Math.max(0, parseInt(document.getElementById('stThreshold').value, 10) || 0);
      const shopPhone = document.getElementById('stShopPhone').value.trim();
      const shopAddress = document.getElementById('stShopAddress').value.trim();
      const newPassword = document.getElementById('stPassword').value.trim();
      const patch = { promptpayId, lowStockThreshold, shopPhone, shopAddress };
      if (newPassword) patch.adminPassword = newPassword;
      await DB.setConfig(patch);
      document.getElementById('stPassword').value = '';
      document.getElementById('settingsMsg').style.color = 'var(--success)';
      document.getElementById('settingsMsg').textContent = 'บันทึกการตั้งค่าเรียบร้อย';
      setTimeout(() => document.getElementById('settingsMsg').textContent = '', 2500);
    });
  }
  function loadSettings() {
    const cfg = DB.getConfig();
    document.getElementById('stPromptpay').value = cfg.promptpayId;
    document.getElementById('stThreshold').value = cfg.lowStockThreshold;
    document.getElementById('stShopPhone').value = cfg.shopPhone || '';
    document.getElementById('stShopAddress').value = cfg.shopAddress || '';
  }
})();
