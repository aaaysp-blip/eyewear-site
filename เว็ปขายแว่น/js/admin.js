/* admin.js — หลังบ้าน: dashboard, ลงสินค้า+AI แยกสี, จัดการสต็อก, ออเดอร์, CRM, ตั้งค่า */
(function () {
  DB.seedIfEmpty();

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
  function doLogin() {
    const pw = document.getElementById('loginPassword').value;
    const cfg = DB.getConfig();
    if (pw === cfg.adminPassword) {
      sessionStorage.setItem(SESSION_KEY, '1');
      document.getElementById('loginError').textContent = '';
      showApp();
    } else {
      document.getElementById('loginError').textContent = 'รหัสผ่านไม่ถูกต้อง';
    }
  }
  document.getElementById('btnLogout').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
  });

  if (isLoggedIn()) showApp(); else showLogin();

  // ================= App init (nav) =================
  function initApp() {
    document.querySelectorAll('.nav-link[data-view]').forEach(link => {
      link.addEventListener('click', () => switchView(link.dataset.view));
    });
    if (!appInited) {
      appInited = true;
      setupNewProductForm();
      setupSettings();
      setupRestockActions();
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

    document.getElementById('btnSaveProduct').addEventListener('click', saveNewProduct);
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

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    for (const file of files) {
      try {
        const { dataUrl } = await ColorDetect.loadImageFromFile(file);
        mainImageCropQueue.push(dataUrl);
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
      // ครอปเป็นสี่เหลี่ยมจัตุรัสเสมอ (ตามที่เครื่องมือนี้ออกแบบไว้) แต่ให้จุดเริ่มต้นมาจากตำแหน่ง/ขนาดที่ AI เสนอ
      // แทนที่จะเริ่มจากกึ่งกลางภาพเสมอ — แอดมินยังลาก/ปรับขนาดต่อได้ตามปกติก่อนกดยืนยัน
      const rawX = (suggestedBoxPct.x / 100) * dispW;
      const rawY = (suggestedBoxPct.y / 100) * dispH;
      const rawW = (suggestedBoxPct.width / 100) * dispW;
      const rawH = (suggestedBoxPct.height / 100) * dispH;
      const cx = rawX + rawW / 2;
      const cy = rawY + rawH / 2;
      const size = Math.max(24, Math.min(dispW, dispH, Math.max(rawW, rawH) * 1.15));
      box = {
        x: Math.max(0, Math.min(dispW - size, Math.round(cx - size / 2))),
        y: Math.max(0, Math.min(dispH - size, Math.round(cy - size / 2))),
        w: Math.round(size),
        h: Math.round(size),
      };
    } else {
      const boxSize = Math.min(dispW, dispH);
      box = {
        x: Math.round((dispW - boxSize) / 2),
        y: Math.round((dispH - boxSize) / 2),
        w: boxSize,
        h: boxSize,
      };
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
        const size = Math.max(24, Math.min(origW + dx, origH + dy, dispW - box.x, dispH - box.y));
        box.w = size; box.h = size;
        div.style.width = size + 'px'; div.style.height = size + 'px';
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
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 600;
    canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, 600, 600);
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
    if (!pendingMainImages.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `<p class="tag-muted" style="margin:14px 0 4px">ภาพหลักของสินค้า (ใช้เป็นภาพหน้าปกในหน้าร้าน)</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${pendingMainImages.map((m, i) => `
          <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
            <img src="${m.cropped}" alt="" style="width:84px;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
            <div style="display:flex;gap:4px">
              <button class="btn btn-sm" data-edit-main="${i}" type="button">แก้ไข</button>
              <button class="btn btn-sm btn-danger" data-remove-main="${i}" type="button">ลบ</button>
            </div>
          </div>
        `).join('')}
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
  }

  function renderVariantList() {
    const wrap = document.getElementById('variantList');
    const listHtml = pendingVariants.map(v => `
      <div class="variant-card" data-tid="${v.tempId}">
        <div style="display:flex;flex-direction:column;gap:6px;align-items:center">
          ${v.images[0]
            ? `<img src="${v.images[0]}" alt="">`
            : `<div style="width:84px;height:84px;border-radius:8px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:11px;text-align:center;padding:4px">ยังไม่มีรูป</div>`}
          <label class="btn btn-sm" style="cursor:pointer;text-align:center">
            ${v.images[0] ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
            <input type="file" accept="image/*" class="v-image-input" data-tid="${v.tempId}" style="display:none">
          </label>
          ${v.images[0] ? `<button class="btn btn-sm btn-danger" data-remove-image="${v.tempId}" type="button">ลบรูป</button>` : ''}
        </div>
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
      (pendingVariants.length ? `<p class="tag-muted" style="margin:14px 0 4px">เพิ่มรูปและตั้งชื่อสีเองสำหรับแต่ละตัวเลือก (1 ตัวเลือก = 1 สี) — อัปโหลดรูปแล้วจะมีหน้าต่างให้ปรับกรอบก่อนใช้จริงเหมือนภาพหลัก</p>` : '')
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
    wrap.querySelectorAll('[data-remove-image]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = pendingVariants.find(x => x.tempId === btn.dataset.removeImage);
        if (v) { v.images = []; renderVariantList(); }
      });
    });
    wrap.querySelectorAll('.v-image-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const file = inp.files[0];
        if (!file) return;
        const tid = inp.dataset.tid;
        ColorDetect.loadImageFromFile(file).then(({ dataUrl }) => {
          const img = new Image();
          img.onload = () => {
            currentAiCropCtx = null;
            openCropModalForImage(img, dataUrl, null, croppedDataUrl => {
              const v = pendingVariants.find(x => x.tempId === tid);
              if (v) { v.images = [croppedDataUrl]; renderVariantList(); }
            });
          };
          img.src = dataUrl;
        });
        inp.value = '';
      });
    });
    const addBtn = document.getElementById('btnAddVariantManual');
    if (addBtn) addBtn.addEventListener('click', () => {
      pendingVariants.push({ tempId: 'tmp_' + Math.random().toString(36).slice(2), color: '', stock: 5, images: [] });
      renderVariantList();
    });
  }

  function saveNewProduct() {
    const err = document.getElementById('npError');
    const name = document.getElementById('npName').value.trim();
    const brand = document.getElementById('npBrand').value.trim();
    const category = document.getElementById('npCategory').value;
    const price = parseFloat(document.getElementById('npPrice').value);
    const frameWidth = document.getElementById('npFrameWidth').value ? Number(document.getElementById('npFrameWidth').value) : null;
    const lensWidth = document.getElementById('npLensWidth').value ? Number(document.getElementById('npLensWidth').value) : null;
    const lensHeight = document.getElementById('npLensHeight').value ? Number(document.getElementById('npLensHeight').value) : null;
    const bridgeWidth = document.getElementById('npBridgeWidth').value ? Number(document.getElementById('npBridgeWidth').value) : null;
    const templeLength = document.getElementById('npTempleLength').value ? Number(document.getElementById('npTempleLength').value) : null;
    let code = document.getElementById('npCode').value.trim();

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
      code, name, brand, category, price, frameWidth, lensWidth, lensHeight, bridgeWidth, templeLength,
      images: pendingMainImages.map(m => m.cropped),
      variants: pendingVariants.map(v => ({ id: DB.uid('v'), color: v.color.trim() || 'สีมาตรฐาน', stock: v.stock, images: v.images })),
    };
    DB.saveProduct(product);
    showToast(`บันทึกสินค้า ${code} เรียบร้อย`);

    // reset form
    ['npCode', 'npName', 'npBrand', 'npPrice', 'npFrameWidth', 'npLensWidth', 'npLensHeight', 'npBridgeWidth', 'npTempleLength'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('npCode').placeholder = DB.generateNextCode();
    pendingVariants = [];
    pendingMainImages = [];
    renderVariantList();
    renderMainImagesPreview();
    document.getElementById('aiReadStatus').textContent = '';
    err.textContent = '';
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

    const prompt = 'This photo shows one or more eyewear items (glasses/sunglasses), possibly at an angle or tilted, and possibly with a product tag/label, and possibly with frame size markings printed on the inside of a temple arm (standard format like "52\u25a118-140" or "52-18-140", where the first number is lens width in mm, the middle number is bridge width in mm, and the last number is temple/arm length in mm). Respond with ONLY one JSON object, no markdown fences, no other text: {"productCode":string_or_null,"lensWidthMm":number_or_null,"bridgeWidthMm":number_or_null,"templeLengthMm":number_or_null,"items":[{"x":number,"y":number,"width":number,"height":number,"rotationDegrees":number,"colorName":string}]}. productCode is any visible model/style code printed on a tag, label, or the frame itself (null if none is clearly visible). lensWidthMm, bridgeWidthMm and templeLengthMm must come only from a clearly visible, legible printed size marking (null if none visible or not legible \u2014 never guess a number). items lists every separate physical eyewear item in the photo: a bounding box (x,y,width,height as percentages 0-100 of the full image, x,y = top-left corner) that fully contains that ENTIRE item \u2014 a little extra margin is fine, better than cutting it off \u2014 rotationDegrees is the clockwise angle from -45 to 45 needed to make that item appear level/front-facing (0 if already level), and colorName, a short Thai name for that item\'s dominant color. If only one item is visible, return a single-element array covering the whole product.';

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
    if (result.lensWidthMm) { document.getElementById('npLensWidth').value = result.lensWidthMm; filled.push('เลนส์กว้าง'); }
    if (result.bridgeWidthMm) { document.getElementById('npBridgeWidth').value = result.bridgeWidthMm; filled.push('สะพานแว่น'); }
    if (result.templeLengthMm) { document.getElementById('npTempleLength').value = result.templeLengthMm; filled.push('ความยาวขาแว่น'); }

    const items = Array.isArray(result.items) ? result.items.filter(b => typeof b.x === 'number' && typeof b.y === 'number' && typeof b.width === 'number' && typeof b.height === 'number') : [];

    if (items.length) {
      const img = new Image();
      img.onload = () => {
        items.forEach(item => {
          const tempId = 'tmp_' + Math.random().toString(36).slice(2);
          pendingVariants.push({ tempId, color: item.colorName ? String(item.colorName) : '', stock: 5, images: [] });
          aiCropQueue.push({ img, originalDataUrl: original, box: item, tempId });
        });
        renderVariantList();
        status.style.color = '';
        const parts = [];
        if (filled.length) parts.push(`เติมข้อมูล: ${filled.join(', ')}`);
        parts.push(`เพิ่มตัวเลือกสี ${items.length} สี — จะขึ้นหน้าต่างครอปให้ปรับ/ยืนยันทีละสี`);
        status.textContent = parts.join(' · ');
        processNextAiCropInQueue();
      };
      img.src = original;
      return;
    }

    status.style.color = '';
    status.textContent = filled.length ? `เติมข้อมูล: ${filled.join(', ')} — ไม่พบสีที่แยกได้ชัดเจนในรูปนี้` : 'AI ไม่พบข้อมูลที่อ่านได้ชัดเจนจากภาพนี้ — กรอกเองได้เลย';
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
          <td><button class="btn btn-sm" data-view-product-btn="${p.id}" type="button">ดูรายละเอียด</button></td>
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
  }

  function renderStockDetail(productId) {
    const p = DB.getProduct(productId);
    if (!p) { stockDetailProductId = null; renderStock(); return; }
    document.getElementById('stockContent').innerHTML = `
      <button class="btn btn-sm" id="btnStockBack" type="button" style="margin-bottom:14px">← กลับไปดูรายการสินค้า</button>
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
    document.querySelectorAll('.stock-input').forEach(inp => {
      inp.addEventListener('change', () => {
        DB.updateVariantStock(inp.dataset.pid, inp.dataset.vid, inp.value);
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

  function confirmCreateRestockFromReview() {
    if (!restockReviewItems.length) return;
    const note = document.getElementById('restockReviewNote').value.trim();
    DB.createRestock({ items: restockReviewItems, note });
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
      inp.addEventListener('change', e => {
        e.stopPropagation();
        DB.updateRestockReceivedQty(inp.dataset.rid, Number(inp.dataset.idx), inp.value);
      });
      inp.addEventListener('click', e => e.stopPropagation());
    });
    wrap.querySelectorAll('[data-confirm-po]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        DB.confirmRestockReceive(btn.dataset.confirmPo);
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
  const NEXT_LABEL = {
    1: 'ยืนยันตรวจสลิปแล้ว → ไปขั้นตอน "รอยืนยันเบอร์โทร"',
    2: 'ยืนยันเบอร์โทร/ที่อยู่แล้ว → ไปขั้นตอน "แพ็คแล้ว"',
    3: 'แพ็คสินค้าเสร็จแล้ว → ไปขั้นตอน "จัดส่งแล้ว"',
  };

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
            <div class="span2" style="grid-column:1/-1"><strong>ที่อยู่:</strong> ${escapeHtml(o.customer.address)} ต.${escapeHtml(o.customer.subdistrict)} อ.${escapeHtml(o.customer.district)} จ.${escapeHtml(o.customer.province)} ${escapeHtml(o.customer.zipcode)}</div>
          </div>
          <table><thead><tr><th>สินค้า</th><th>สี</th><th>จำนวน</th><th>ราคา</th></tr></thead>
          <tbody>${o.items.map(it => `<tr><td>${it.code} ${escapeHtml(it.name)}</td><td>${escapeHtml(it.color)}</td><td>${it.qty}</td><td>฿${(it.price * it.qty).toLocaleString()}</td></tr>`).join('')}</tbody></table>
          <div class="order-actions" style="margin-top:14px">
            ${o.status < 4 ? `<button class="btn btn-primary" data-advance="${o.id}">${NEXT_LABEL[o.status]}</button>` : `<span class="status-pill status-4">จัดส่งเรียบร้อยแล้ว</span>`}
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
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const o = DB.getOrder(btn.dataset.advance);
        DB.updateOrderStatus(o.id, DB.nextStatus(o.status));
        renderOrders();
        showToast('อัปเดตสถานะออเดอร์แล้ว');
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

  // ================= Settings =================
  function setupSettings() {
    document.getElementById('btnSaveSettings').addEventListener('click', () => {
      const promptpayId = document.getElementById('stPromptpay').value.trim();
      const lowStockThreshold = Math.max(0, parseInt(document.getElementById('stThreshold').value, 10) || 0);
      const newPassword = document.getElementById('stPassword').value.trim();
      const patch = { promptpayId, lowStockThreshold };
      if (newPassword) patch.adminPassword = newPassword;
      DB.setConfig(patch);
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
  }
})();
