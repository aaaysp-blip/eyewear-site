/* store.js — หน้าร้าน: แท็บ/ตัวกรอง/แบ่งหน้า/popup สินค้า/ตะกร้า/checkout */
(function () {
  DB.seedIfEmpty();

  const PAGE_SIZE = 20;
  const CART_KEY = 'ew_cart';

  const DEFAULT_FILTERS = { search: '', brand: '', priceMin: '', priceMax: '', frameMin: '', frameMax: '', lensWMin: '', lensWMax: '', lensHMin: '', lensHMax: '' };
  function hasActiveFilters() {
    return Object.keys(DEFAULT_FILTERS).some(k => state.filters[k] !== DEFAULT_FILTERS[k]);
  }
  function updateFilterBadge() {
    const dot = document.getElementById('filterActiveDot');
    if (!dot) return;
    dot.classList.toggle('hidden', !hasActiveFilters());
  }

  const state = {
    tab: 'new',
    page: 1,
    filters: { search: '', brand: '', priceMin: '', priceMax: '', frameMin: '', frameMax: '', lensWMin: '', lensWMax: '', lensHMin: '', lensHMax: '' },
    selectedVariantByProduct: {},
  };

  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; }
  }
  function setCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderCartCount();
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------------- Filtering ----------------
  function categoryOfTab(tab) {
    return tab === 'new' ? null : tab;
  }

  function totalStock(product) {
    return product.variants.reduce((s, v) => s + v.stock, 0);
  }

  function getFilteredProducts() {
    let list = DB.getProducts();
    const cat = categoryOfTab(state.tab);
    if (cat) list = list.filter(p => p.category === cat);

    const f = state.filters;
    if (f.search) {
      const q = f.search.trim().toLowerCase();
      list = list.filter(p =>
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q)
      );
    }
    if (f.brand) list = list.filter(p => p.brand === f.brand);
    if (f.priceMin !== '') list = list.filter(p => p.price >= Number(f.priceMin));
    if (f.priceMax !== '') list = list.filter(p => p.price <= Number(f.priceMax));

    function inRange(val, min, max) {
      if (val == null) return min === '' && max === '';
      if (min !== '' && val < Number(min)) return false;
      if (max !== '' && val > Number(max)) return false;
      return true;
    }
    if (f.frameMin !== '' || f.frameMax !== '') list = list.filter(p => inRange(p.frameWidth, f.frameMin, f.frameMax));
    if (f.lensWMin !== '' || f.lensWMax !== '') list = list.filter(p => inRange(p.lensWidth, f.lensWMin, f.lensWMax));
    if (f.lensHMin !== '' || f.lensHMax !== '') list = list.filter(p => inRange(p.lensHeight, f.lensHMin, f.lensHMax));

    list = list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list;
  }

  // ---------------- Grid render ----------------
  function renderGrid() {
    const all = getFilteredProducts();
    const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = all.slice(start, start + PAGE_SIZE);

    document.getElementById('resultCount').textContent = `พบ ${all.length} รายการ`;

    const grid = document.getElementById('productGrid');
    if (!pageItems.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="big">🔍</div>ไม่พบสินค้าที่ตรงกับเงื่อนไข</div>`;
    } else {
      grid.innerHTML = pageItems.map(cardHtml).join('');
    }
    renderPagination(totalPages);

    grid.querySelectorAll('.card').forEach(el => {
      el.addEventListener('click', () => openProductPopup(el.dataset.id));
    });
  }

  function cardHtml(p) {
    const stock = totalStock(p);
    const img = (p.images && p.images[0]) || (p.variants[0] && p.variants[0].images[0]) || DB.placeholderImage(p.name, '', p.category);
    const isNew = DB.isNew(p);
    let badge = '';
    if (stock === 0) badge = `<span class="card-badge out">หมดสต็อก</span>`;
    else if (isNew) badge = `<span class="card-badge new">ใหม่</span>`;
    const sizeParts = [];
    if (p.category === 'accessories') {
      if (p.accWidth && p.accLength) sizeParts.push(`${p.accWidth}×${p.accLength}มม.`);
      if (p.material) sizeParts.push(escapeHtml(p.material));
    } else {
      if (p.frameWidth) sizeParts.push(`หน้า ${p.frameWidth}มม.`);
      if (p.lensWidth) {
        const combo = [p.lensWidth, p.bridgeWidth, p.templeLength].filter(v => v != null && v !== '').join('-');
        sizeParts.push(`${combo}มม.`);
      }
    }
    return `
    <div class="card" data-id="${p.id}">
      <div class="card-img"><img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy">${badge}</div>
      <div class="card-body">
        <div class="card-code">${p.code}</div>
        <div class="card-name">${escapeHtml(p.name)}</div>
        <div class="card-brand">${escapeHtml(p.brand)}</div>
        ${sizeParts.length ? `<div class="card-size">${sizeParts.join(' · ')}</div>` : ''}
        <div class="card-footer">
          <div class="card-price">฿${p.price.toLocaleString()}</div>
          <div class="card-stock ${stock === 0 ? 'out' : stock <= 2 ? 'low' : ''}">${stock === 0 ? 'หมด' : 'คงเหลือ ' + stock}</div>
        </div>
      </div>
    </div>`;
  }

  function renderPagination(totalPages) {
    const el = document.getElementById('pagination');
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    let html = `<button class="page-btn" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="page-btn ${i === state.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button class="page-btn" data-page="${state.page + 1}" ${state.page === totalPages ? 'disabled' : ''}>›</button>`;
    el.innerHTML = html;
    el.querySelectorAll('.page-btn').forEach(b => {
      b.addEventListener('click', () => {
        state.page = Number(b.dataset.page);
        renderGrid();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------------- Tabs ----------------
  document.getElementById('tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.tab = btn.dataset.tab;
    state.page = 1;
    renderGrid();
  });

  // ---------------- Filter drawer ----------------
  const filterOverlay = document.getElementById('filterOverlay');
  const filterDrawer = document.getElementById('filterDrawer');
  function openFilter() {
    populateBrandOptions();
    filterOverlay.classList.add('show');
    filterDrawer.classList.add('show');
  }
  function closeFilter() {
    filterOverlay.classList.remove('show');
    filterDrawer.classList.remove('show');
  }
  document.getElementById('btnFilter').addEventListener('click', openFilter);
  document.getElementById('btnCloseFilter').addEventListener('click', closeFilter);
  filterOverlay.addEventListener('click', closeFilter);

  function populateBrandOptions() {
    const sel = document.getElementById('fBrand');
    const brands = Array.from(new Set(DB.getProducts().map(p => p.brand))).sort();
    const current = state.filters.brand;
    sel.innerHTML = '<option value="">ทั้งหมด</option>' + brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    sel.value = current;
  }

  document.getElementById('btnApplyFilter').addEventListener('click', () => {
    state.filters = {
      search: document.getElementById('fSearch').value,
      brand: document.getElementById('fBrand').value,
      priceMin: document.getElementById('fPriceMin').value,
      priceMax: document.getElementById('fPriceMax').value,
      frameMin: document.getElementById('fFrameMin').value,
      frameMax: document.getElementById('fFrameMax').value,
      lensWMin: document.getElementById('fLensWMin').value,
      lensWMax: document.getElementById('fLensWMax').value,
      lensHMin: document.getElementById('fLensHMin').value,
      lensHMax: document.getElementById('fLensHMax').value,
    };
    state.page = 1;
    closeFilter();
    updateFilterBadge();
    renderGrid();
  });

  document.getElementById('btnResetFilter').addEventListener('click', () => {
    ['fSearch'].forEach(id => document.getElementById(id).value = '');
    ['fPriceMin', 'fPriceMax', 'fFrameMin', 'fFrameMax', 'fLensWMin', 'fLensWMax', 'fLensHMin', 'fLensHMax'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('fBrand').value = '';
  });

  // ---------------- Product popup ----------------
  const productModal = document.getElementById('productModal');
  let popupState = { product: null, variant: null, qty: 1 };

  function openProductPopup(id) {
    const p = DB.getProduct(id);
    if (!p) return;
    const firstAvailable = p.variants.find(v => v.stock > 0) || p.variants[0];
    popupState = { product: p, variant: firstAvailable, qty: firstAvailable && firstAvailable.stock > 0 ? 1 : 0 };
    renderProductPopup();
    productModal.classList.add('show');
  }

  function renderProductPopup() {
    const { product: p, variant: v, qty } = popupState;
    const img = (v && v.images[0]) || (p.images && p.images[0]) || DB.placeholderImage(p.name, '', p.category);
    const swatches = p.variants.map(vr => `
      <button class="swatch ${vr.id === v.id ? 'active' : ''} ${vr.stock === 0 ? 'disabled' : ''}" data-vid="${vr.id}" ${vr.stock === 0 ? 'disabled' : ''}>
        ${escapeHtml(vr.color)}${vr.stock === 0 ? ' (หมด)' : ''}
      </button>`).join('');

    const specParts = [];
    if (p.category === 'accessories') {
      if (p.accWidth && p.accLength) specParts.push(`<div class="spec-item"><div class="val">${p.accWidth}×${p.accLength}</div><div class="lbl">กว้าง×ยาว (มม.)</div></div>`);
      if (p.material) specParts.push(`<div class="spec-item"><div class="val">${escapeHtml(p.material)}</div><div class="lbl">วัสดุ</div></div>`);
    } else {
      if (p.frameWidth) specParts.push(`<div class="spec-item"><div class="val">${p.frameWidth}</div><div class="lbl">หน้าแว่นกว้าง (มม.)</div></div>`);
      if (p.lensWidth) specParts.push(`<div class="spec-item"><div class="val">${p.lensWidth}</div><div class="lbl">เลนส์กว้าง (มม.)</div></div>`);
      if (p.lensHeight) specParts.push(`<div class="spec-item"><div class="val">${p.lensHeight}</div><div class="lbl">เลนส์สูง (มม.)</div></div>`);
      if (p.bridgeWidth) specParts.push(`<div class="spec-item"><div class="val">${p.bridgeWidth}</div><div class="lbl">สะพานแว่น (มม.)</div></div>`);
      if (p.templeLength) specParts.push(`<div class="spec-item"><div class="val">${p.templeLength}</div><div class="lbl">ความยาวขาแว่น (มม.)</div></div>`);
    }

    document.getElementById('productPopupBody').innerHTML = `
      <div class="popup-media"><img src="${img}" alt=""></div>
      <div class="popup-info">
        <div class="popup-code">${p.code}</div>
        <div class="popup-name">${escapeHtml(p.name)}</div>
        <div class="popup-brand">${escapeHtml(p.brand)}</div>
        ${specParts.length ? `<div class="spec-grid">${specParts.join('')}</div>` : ''}
        ${p.variants.length > 1 ? `<div class="field"><label>เลือกสี</label><div class="swatches" id="popupSwatches">${swatches}</div></div>` : ''}
        <div class="field">
          <label>จำนวน (คงเหลือ ${v ? v.stock : 0} ชิ้น)</label>
          <div class="qty-row">
            <div class="qty-control">
              <button id="qtyMinus" type="button">−</button>
              <input type="number" id="qtyInput" value="${qty}" min="0" max="${v ? v.stock : 0}">
              <button id="qtyPlus" type="button">+</button>
            </div>
          </div>
        </div>
        <div class="popup-total">
          <span>ราคารวม</span>
          <span class="amt" id="popupTotal">฿${((v ? p.price * qty : 0)).toLocaleString()}</span>
        </div>
        <button class="btn btn-primary btn-block" id="btnAddCart" ${!v || v.stock === 0 || qty < 1 ? 'disabled' : ''}>
          ${!v || v.stock === 0 ? 'หมดสต็อก' : 'ใส่ตะกร้า'}
        </button>
      </div>
    `;

    const swatchWrap = document.getElementById('popupSwatches');
    if (swatchWrap) {
      swatchWrap.querySelectorAll('.swatch').forEach(btn => {
        btn.addEventListener('click', () => {
          const vr = p.variants.find(x => x.id === btn.dataset.vid);
          popupState.variant = vr;
          popupState.qty = vr.stock > 0 ? 1 : 0;
          renderProductPopup();
        });
      });
    }

    document.getElementById('qtyMinus').addEventListener('click', () => changeQty(-1));
    document.getElementById('qtyPlus').addEventListener('click', () => changeQty(1));
    document.getElementById('qtyInput').addEventListener('change', e => {
      let val = parseInt(e.target.value, 10) || 0;
      val = Math.max(0, Math.min(val, v ? v.stock : 0));
      popupState.qty = val;
      renderProductPopup();
    });
    const addBtn = document.getElementById('btnAddCart');
    if (addBtn) addBtn.addEventListener('click', addToCartFromPopup);
  }

  function changeQty(delta) {
    const v = popupState.variant;
    const max = v ? v.stock : 0;
    popupState.qty = Math.max(1, Math.min(max, popupState.qty + delta));
    renderProductPopup();
  }

  function addToCartFromPopup() {
    const { product: p, variant: v, qty } = popupState;
    if (!v || qty < 1) return;
    const cart = getCart();
    const existing = cart.find(it => it.variantId === v.id);
    const maxAllowed = v.stock;
    if (existing) {
      existing.qty = Math.min(maxAllowed, existing.qty + qty);
    } else {
      cart.push({
        productId: p.id, variantId: v.id, code: p.code, name: p.name,
        color: v.color, qty, price: p.price, image: v.images[0] || '',
      });
    }
    setCart(cart);
    showToast('เพิ่มลงตะกร้าแล้ว');
    productModal.classList.remove('show');
  }

  // ---------------- Modal close (generic) ----------------
  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById(el.dataset.closeModal).classList.remove('show');
    });
  });

  // ---------------- Cart / Checkout ----------------
  const cartModal = document.getElementById('cartModal');
  let checkoutStep = 1;
  let lastOrder = null;

  function renderCartCount() {
    const cart = getCart();
    const count = cart.reduce((s, i) => s + i.qty, 0);
    const badge = document.getElementById('cartCount');
    if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }

  document.getElementById('btnCart').addEventListener('click', () => {
    checkoutStep = 1;
    renderCheckout();
    cartModal.classList.add('show');
  });

  function setStepUI(step) {
    document.querySelectorAll('#checkoutSteps .step').forEach(el => {
      const n = Number(el.dataset.step);
      el.classList.toggle('active', n === step);
      el.classList.toggle('done', n < step);
    });
  }

  function cartTotal(cart) { return cart.reduce((s, i) => s + i.price * i.qty, 0); }

  function renderCheckout() {
    setStepUI(checkoutStep);
    const body = document.getElementById('checkoutBody');
    const cart = getCart();

    if (checkoutStep === 1) {
      if (!cart.length) {
        body.innerHTML = `<div class="empty-state"><div class="big">🛒</div>ยังไม่มีสินค้าในตะกร้า</div>`;
        return;
      }
      body.innerHTML = `
        ${cart.map((it, idx) => `
          <div class="cart-row">
            <img src="${it.image}" alt="">
            <div class="info">
              <div class="name">${escapeHtml(it.name)} <span class="tag-muted">(${escapeHtml(it.color)})</span></div>
              <div class="meta">${it.code} · ฿${it.price.toLocaleString()} × ${it.qty}</div>
            </div>
            <div class="qty-control">
              <button data-act="dec" data-idx="${idx}" type="button">−</button>
              <input type="number" value="${it.qty}" data-act="set" data-idx="${idx}" min="1">
              <button data-act="inc" data-idx="${idx}" type="button">+</button>
            </div>
            <button class="btn btn-sm btn-danger" data-act="remove" data-idx="${idx}" type="button">ลบ</button>
          </div>
        `).join('')}
        <div class="cart-summary-total"><span>ยอดรวม</span><span>฿${cartTotal(cart).toLocaleString()}</span></div>
        <button class="btn btn-primary btn-block" id="btnGoPayment">สร้าง QR พร้อมเพย์</button>
      `;
      body.querySelectorAll('[data-act]').forEach(el => {
        el.addEventListener('click', () => {
          const idx = Number(el.dataset.idx);
          const c = getCart();
          if (el.dataset.act === 'inc') c[idx].qty++;
          if (el.dataset.act === 'dec') c[idx].qty = Math.max(1, c[idx].qty - 1);
          if (el.dataset.act === 'remove') c.splice(idx, 1);
          setCart(c);
          renderCheckout();
        });
        if (el.dataset.act === 'set') {
          el.addEventListener('change', () => {
            const idx = Number(el.dataset.idx);
            const c = getCart();
            c[idx].qty = Math.max(1, parseInt(el.value, 10) || 1);
            setCart(c);
            renderCheckout();
          });
        }
      });
      const goBtn = document.getElementById('btnGoPayment');
      if (goBtn) goBtn.addEventListener('click', () => { checkoutStep = 2; renderCheckout(); });
      return;
    }

    if (checkoutStep === 2) {
      const total = cartTotal(cart);
      const cfg = DB.getConfig();
      const payload = PromptPay.generatePayload(cfg.promptpayId, total);
      body.innerHTML = `
        <div class="qr-box">
          <div id="qrHolder" style="display:inline-block;background:#fff;padding:16px;border-radius:12px;border:1px solid var(--border)"></div>
          <div class="qr-amount">฿${total.toLocaleString()}</div>
          <div class="qr-hint">สแกนจ่ายผ่านแอปธนาคารใดก็ได้ (PromptPay)<br>แอดมินจะตรวจสอบสลิปการโอนของท่านหลังยืนยันคำสั่งซื้อ</div>
        </div>
        <div style="display:flex;gap:10px;margin-top:14px;">
          <button class="btn" id="btnBack1">‹ กลับ</button>
          <button class="btn btn-primary btn-block" id="btnGoAddress">ถัดไป: กรอกที่อยู่จัดส่ง</button>
        </div>
      `;
      new QRCode(document.getElementById('qrHolder'), {
        text: payload, width: 220, height: 220, colorDark: '#26241f', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
      document.getElementById('btnBack1').addEventListener('click', () => { checkoutStep = 1; renderCheckout(); });
      document.getElementById('btnGoAddress').addEventListener('click', () => { checkoutStep = 3; renderCheckout(); });
      return;
    }

    if (checkoutStep === 3) {
      body.innerHTML = `
        <div class="form-grid">
          <div class="field"><label>ชื่อ-นามสกุลผู้รับ *</label><input type="text" id="adName"></div>
          <div class="field"><label>เบอร์โทร *</label><input type="tel" id="adPhone" maxlength="10" placeholder="08xxxxxxxx"></div>
          <div class="field"><label>LINE ID (สำรอง)</label><input type="text" id="adLine"></div>
          <div class="field"><label>รหัสไปรษณีย์ *</label><input type="text" id="adZip" maxlength="5"></div>
          <div class="field span2"><label>ที่อยู่ (บ้านเลขที่ ถนน ซอย) *</label><input type="text" id="adAddress"></div>
          <div class="field"><label>แขวง/ตำบล *</label><input type="text" id="adSubdistrict"></div>
          <div class="field"><label>เขต/อำเภอ *</label><input type="text" id="adDistrict"></div>
          <div class="field span2"><label>จังหวัด *</label><input type="text" id="adProvince"></div>
        </div>
        <div class="error-text" id="addressError"></div>
        <div style="display:flex;gap:10px;margin-top:8px;">
          <button class="btn" id="btnBack2">‹ กลับ</button>
          <button class="btn btn-primary btn-block" id="btnConfirmOrder">ยืนยันคำสั่งซื้อ</button>
        </div>
      `;
      document.getElementById('btnBack2').addEventListener('click', () => { checkoutStep = 2; renderCheckout(); });
      document.getElementById('btnConfirmOrder').addEventListener('click', submitOrder);
      return;
    }

    if (checkoutStep === 4) {
      body.innerHTML = `
        <div class="order-done">
          <div class="ok-icon">✅</div>
          <div>สั่งซื้อสำเร็จ ขอบคุณที่อุดหนุนค่ะ/ครับ</div>
          <div class="order-no">เลขที่ออเดอร์ ${lastOrder ? lastOrder.orderNo : ''}</div>
          <div class="tag-muted">แอดมินจะตรวจสอบสลิปและติดต่อกลับเพื่อยืนยันเบอร์โทร/ที่อยู่</div>
          <button class="btn btn-primary" style="margin-top:18px" id="btnCloseDone">ปิดหน้าต่าง</button>
        </div>
      `;
      document.getElementById('btnCloseDone').addEventListener('click', () => {
        cartModal.classList.remove('show');
      });
      return;
    }
  }

  function submitOrder() {
    const name = document.getElementById('adName').value.trim();
    const phone = document.getElementById('adPhone').value.trim();
    const lineId = document.getElementById('adLine').value.trim();
    const zipcode = document.getElementById('adZip').value.trim();
    const address = document.getElementById('adAddress').value.trim();
    const subdistrict = document.getElementById('adSubdistrict').value.trim();
    const district = document.getElementById('adDistrict').value.trim();
    const province = document.getElementById('adProvince').value.trim();
    const err = document.getElementById('addressError');

    if (!name || !phone || !zipcode || !address || !subdistrict || !district || !province) {
      err.textContent = 'กรุณากรอกข้อมูลที่จำเป็น (มีเครื่องหมาย *) ให้ครบถ้วน';
      return;
    }
    if (!/^0\d{8,9}$/.test(phone)) {
      err.textContent = 'กรุณากรอกเบอร์โทรให้ถูกต้อง (เช่น 0812345678)';
      return;
    }
    if (!/^\d{5}$/.test(zipcode)) {
      err.textContent = 'กรุณากรอกรหัสไปรษณีย์ 5 หลัก';
      return;
    }
    err.textContent = '';

    const cart = getCart();
    if (!cart.length) return;
    const total = cartTotal(cart);
    lastOrder = DB.createOrder({
      items: cart,
      total,
      customer: { name, phone, lineId, address, subdistrict, district, province, zipcode },
    });
    setCart([]);
    checkoutStep = 4;
    renderCheckout();
    renderGrid();
  }

  // ---------------- init ----------------
  renderCartCount();
  updateFilterBadge();
  renderGrid();
})();
