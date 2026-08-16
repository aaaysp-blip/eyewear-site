/* store.js — หน้าร้าน: แท็บ/ตัวกรอง/แบ่งหน้า/popup สินค้า/ตะกร้า/checkout */
(function () {
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
    if (stock === 0 && isPreorderUnlocked()) badge = `<span class="card-badge preorder">พรีออเดอร์ได้</span>`;
    else if (stock === 0) badge = `<span class="card-badge out">หมดสต็อก</span>`;
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
          <div class="card-stock ${stock === 0 ? 'out' : stock <= 2 ? 'low' : ''}">${stock === 0 ? (isPreorderUnlocked() ? 'พรีออเดอร์ได้' : 'หมด') : 'คงเหลือ ' + stock}</div>
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

  function starsString(rating) {
    const r = Math.max(0, Math.min(5, Math.round(rating || 0)));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  }

  function maskReviewerName(name) {
    const n = String(name || 'ลูกค้า').trim();
    if (n.length <= 2) return n + '***';
    return n.slice(0, 2) + '***';
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
    const fSearchEl = document.getElementById('fSearch');
    if (fSearchEl) fSearchEl.value = state.filters.search || '';
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

  const headerSearchEl = document.getElementById('headerSearch');
  if (headerSearchEl) {
    headerSearchEl.addEventListener('input', () => {
      state.filters.search = headerSearchEl.value;
      const drawerSearch = document.getElementById('fSearch');
      if (drawerSearch) drawerSearch.value = headerSearchEl.value;
      state.page = 1;
      updateFilterBadge();
      renderGrid();
    });
  }

  // ---------------- Product popup ----------------
  const productModal = document.getElementById('productModal');
  let popupState = { product: null, variant: null, qty: 1 };

  function openProductPopup(id) {
    const p = DB.getProduct(id);
    if (!p) return;
    const firstAvailable = p.variants.find(v => v.stock > 0) || p.variants[0];
    popupState = { product: p, variant: firstAvailable, qty: firstAvailable && (firstAvailable.stock > 0 || isPreorderUnlocked()) ? 1 : 0, imageIndex: 0 };
    renderProductPopup();
    productModal.classList.add('show');
  }

  // รูปของสีที่เลือกอยู่ (ถ้ามี) ตามด้วยรูปหลักของสินค้าทุกรูป (ไม่เอาซ้ำ) — ให้ลูกค้าเลื่อนดูได้ครบ
  function popupGalleryImages(p, v) {
    const mainImages = (p.images && p.images.length ? p.images : p.imagesOriginal) || [];
    const list = [];
    if (v && v.images[0]) list.push(v.images[0]);
    mainImages.forEach(src => { if (!list.includes(src)) list.push(src); });
    return list;
  }

  function renderProductPopup() {
    const { product: p, variant: v, qty } = popupState;
    const gallery = popupGalleryImages(p, v);
    const imageIndex = Math.min(popupState.imageIndex || 0, Math.max(0, gallery.length - 1));
    popupState.imageIndex = imageIndex;
    const img = gallery[imageIndex] || DB.placeholderImage(p.name, '', p.category);
    const galleryNav = gallery.length > 1 ? `
      <button class="popup-gallery-arrow prev" id="popupGalleryPrev" type="button" aria-label="รูปก่อนหน้า">‹</button>
      <button class="popup-gallery-arrow next" id="popupGalleryNext" type="button" aria-label="รูปถัดไป">›</button>
      <div class="popup-gallery-dots">
        ${gallery.map((_, i) => `<button class="popup-gallery-dot ${i === imageIndex ? 'active' : ''}" data-img-idx="${i}" type="button" aria-label="รูปที่ ${i + 1}"></button>`).join('')}
      </div>` : '';
    const preorderMode = isPreorderUnlocked();
    const swatches = p.variants.map(vr => `
      <button class="swatch ${vr.id === v.id ? 'active' : ''} ${vr.stock === 0 && !preorderMode ? 'disabled' : ''}" data-vid="${vr.id}" ${vr.stock === 0 && !preorderMode ? 'disabled' : ''}>
        ${escapeHtml(vr.color)}${vr.stock === 0 ? (preorderMode ? ' (พรีออเดอร์)' : ' (หมด)') : ''}
      </button>`).join('');
    const maxQty = v ? (preorderMode ? 99 : v.stock) : 0;

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
      <div class="popup-media"><img src="${img}" alt="" id="popupMediaImg"><span class="popup-zoom-hint">🔍 แตะเพื่อซูม</span>${galleryNav}</div>
      <div class="popup-info">
        <div class="popup-code">${p.code}</div>
        <div class="popup-name">${escapeHtml(p.name)}</div>
        <div class="popup-brand">${escapeHtml(p.brand)}</div>
        ${specParts.length ? `<div class="spec-grid">${specParts.join('')}</div>` : ''}
        ${p.variants.length > 1 ? `<div class="field"><label>เลือกสี</label><div class="swatches" id="popupSwatches">${swatches}</div></div>` : ''}
        ${preorderMode && v && v.stock === 0 ? `<div class="tag-muted" style="color:var(--accent);margin-bottom:6px">🔓 สินค้านี้หมดสต็อก — สั่งเป็นรายการ Pre-order ได้ ทางร้านจะจัดส่งเมื่อของเข้า</div>` : ''}
        <div class="field">
          <label>จำนวน (คงเหลือ ${v ? v.stock : 0} ชิ้น)</label>
          <div class="qty-row">
            <div class="qty-control">
              <button id="qtyMinus" type="button">−</button>
              <input type="number" id="qtyInput" value="${qty}" min="0" max="${maxQty}">
              <button id="qtyPlus" type="button">+</button>
            </div>
          </div>
        </div>
        <div class="popup-total">
          <span>ราคารวม</span>
          <span class="amt" id="popupTotal">฿${((v ? p.price * qty : 0)).toLocaleString()}</span>
        </div>
        <button class="btn btn-primary btn-block" id="btnAddCart" ${!v || (v.stock === 0 && !preorderMode) || qty < 1 ? 'disabled' : ''}>
          ${!v || v.stock === 0 ? (preorderMode ? 'สั่งจอง (Pre-order)' : 'หมดสต็อก') : 'ใส่ตะกร้า'}
        </button>
      </div>
    `;

    const swatchWrap = document.getElementById('popupSwatches');
    if (swatchWrap) {
      swatchWrap.querySelectorAll('.swatch').forEach(btn => {
        btn.addEventListener('click', () => {
          const vr = p.variants.find(x => x.id === btn.dataset.vid);
          popupState.variant = vr;
          popupState.qty = (vr.stock > 0 || isPreorderUnlocked()) ? 1 : 0;
          popupState.imageIndex = 0; // สลับสีแล้วกลับไปโชว์รูปแรกของสีนั้นก่อน
          renderProductPopup();
        });
      });
    }

    const prevBtn = document.getElementById('popupGalleryPrev');
    if (prevBtn) prevBtn.addEventListener('click', () => {
      popupState.imageIndex = (imageIndex - 1 + gallery.length) % gallery.length;
      renderProductPopup();
    });
    const nextBtn = document.getElementById('popupGalleryNext');
    if (nextBtn) nextBtn.addEventListener('click', () => {
      popupState.imageIndex = (imageIndex + 1) % gallery.length;
      renderProductPopup();
    });
    document.querySelectorAll('.popup-gallery-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        popupState.imageIndex = Number(dot.dataset.imgIdx);
        renderProductPopup();
      });
    });

    document.getElementById('qtyMinus').addEventListener('click', () => changeQty(-1));
    document.getElementById('qtyPlus').addEventListener('click', () => changeQty(1));
    document.getElementById('qtyInput').addEventListener('change', e => {
      let val = parseInt(e.target.value, 10) || 0;
      val = Math.max(0, Math.min(val, maxQty));
      popupState.qty = val;
      renderProductPopup();
    });
    const addBtn = document.getElementById('btnAddCart');
    if (addBtn) addBtn.addEventListener('click', addToCartFromPopup);

    const mediaImg = document.getElementById('popupMediaImg');
    if (mediaImg) mediaImg.addEventListener('click', () => openImageZoom(img));
  }

  function changeQty(delta) {
    const v = popupState.variant;
    const max = v ? (isPreorderUnlocked() ? 99 : v.stock) : 0;
    popupState.qty = Math.max(1, Math.min(max, popupState.qty + delta));
    renderProductPopup();
  }

  function addToCartFromPopup() {
    const { product: p, variant: v, qty } = popupState;
    if (!v || qty < 1) return;
    const cart = getCart();
    const existing = cart.find(it => it.variantId === v.id);
    const maxAllowed = isPreorderUnlocked() ? 99 : v.stock;
    if (existing) {
      existing.qty = Math.min(maxAllowed, existing.qty + qty);
    } else {
      cart.push({
        productId: p.id, variantId: v.id, code: p.code, name: p.name,
        color: v.color, qty, price: p.price,
        image: v.images[0] || (p.imagesOriginal && p.imagesOriginal[0]) || (p.images && p.images[0]) || '',
      });
    }
    setCart(cart);
    showToast('เพิ่มลงตะกร้าแล้ว — เลือกสีอื่นเพิ่มได้เลย');
    popupState.qty = (v.stock > 0 || isPreorderUnlocked()) ? 1 : 0;
    renderProductPopup();
  }

  // ---------------- Image zoom ----------------
  const zoomModal = document.getElementById('imageZoomModal');
  const zoomStage = document.getElementById('zoomStage');
  const zoomImgEl = document.getElementById('zoomImg');
  let zoomScale = 1, zoomPanX = 0, zoomPanY = 0;

  function applyZoomTransform() {
    zoomImgEl.style.transform = `translate(${zoomPanX}px, ${zoomPanY}px) scale(${zoomScale})`;
    zoomStage.classList.toggle('dragging', false);
  }

  function openImageZoom(src) {
    zoomImgEl.src = src;
    zoomScale = 1; zoomPanX = 0; zoomPanY = 0;
    applyZoomTransform();
    zoomModal.classList.add('show');
  }

  function setZoom(newScale) {
    zoomScale = Math.max(1, Math.min(5, newScale));
    if (zoomScale === 1) { zoomPanX = 0; zoomPanY = 0; }
    applyZoomTransform();
  }

  document.getElementById('zoomIn').addEventListener('click', () => setZoom(zoomScale + 0.5));
  document.getElementById('zoomOut').addEventListener('click', () => setZoom(zoomScale - 0.5));
  document.getElementById('zoomReset').addEventListener('click', () => setZoom(1));

  zoomStage.addEventListener('wheel', e => {
    e.preventDefault();
    setZoom(zoomScale + (e.deltaY < 0 ? 0.3 : -0.3));
  }, { passive: false });

  let dragging = false, dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;
  zoomStage.addEventListener('pointerdown', e => {
    if (zoomScale <= 1) return;
    dragging = true;
    zoomStage.classList.add('dragging');
    dragStartX = e.clientX; dragStartY = e.clientY;
    panStartX = zoomPanX; panStartY = zoomPanY;
    zoomStage.setPointerCapture(e.pointerId);
  });
  zoomStage.addEventListener('pointermove', e => {
    if (!dragging) return;
    zoomPanX = panStartX + (e.clientX - dragStartX);
    zoomPanY = panStartY + (e.clientY - dragStartY);
    applyZoomTransform();
  });
  ['pointerup', 'pointercancel'].forEach(evt => {
    zoomStage.addEventListener(evt, () => { dragging = false; zoomStage.classList.remove('dragging'); });
  });
  zoomModal.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => setZoom(1));
  });

  // ---------------- Write a review (รีวิวร้านค้าโดยรวม 1 ออเดอร์ = 1 รีวิว) ----------------
  const reviewModal = document.getElementById('reviewModal');
  document.getElementById('btnOpenReview').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('reviewPhoneInput').value = '';
    document.getElementById('reviewLookupMsg').textContent = '';
    document.getElementById('reviewableList').innerHTML = '';
    reviewModal.classList.add('show');
  });

  document.getElementById('btnReviewLookup').addEventListener('click', () => {
    const phone = document.getElementById('reviewPhoneInput').value.trim();
    const msg = document.getElementById('reviewLookupMsg');
    const listWrap = document.getElementById('reviewableList');
    if (!/^0\d{8,9}$/.test(phone)) {
      msg.textContent = 'กรุณากรอกเบอร์โทรให้ถูกต้อง';
      listWrap.innerHTML = '';
      return;
    }
    msg.textContent = '';
    const orders = DB.getReviewableOrdersForPhone(phone);
    renderReviewableList(orders, phone);
  });

  function renderReviewableList(orders, phone) {
    const listWrap = document.getElementById('reviewableList');
    if (!orders.length) {
      listWrap.innerHTML = `<div class="tag-muted">ไม่พบออเดอร์ที่จัดส่งแล้วและยังไม่เคยรีวิวสำหรับเบอร์นี้</div>`;
      return;
    }
    listWrap.innerHTML = orders.map((o, idx) => `
      <div class="reviewable-card" data-idx="${idx}">
        <div class="rp-head">
          <div>
            <div style="font-weight:600">ออเดอร์ ${o.orderNo}</div>
            <div class="tag-muted" style="font-size:11.5px">${o.items.length} รายการ · ${new Date(o.createdAt).toLocaleDateString('th-TH')} · ฿${o.total.toLocaleString()}</div>
          </div>
        </div>
        <div class="field"><label>ให้คะแนนร้านค้าโดยรวม</label>
          <div class="star-picker" data-idx="${idx}">
            ${[1, 2, 3, 4, 5].map(n => `<span data-star="${n}">★</span>`).join('')}
          </div>
        </div>
        <textarea placeholder="เล่าประสบการณ์การสั่งซื้อครั้งนี้ (ไม่บังคับ)" data-idx="${idx}"></textarea>
        <div class="error-text" data-idx="${idx}"></div>
        <button class="btn btn-primary btn-sm" data-submit-review="${idx}" type="button" style="margin-top:8px">ส่งรีวิว</button>
      </div>
    `).join('');

    const ratings = orders.map(() => 0);

    listWrap.querySelectorAll('.star-picker').forEach(picker => {
      const idx = Number(picker.dataset.idx);
      const spans = picker.querySelectorAll('span');
      function paint(n) { spans.forEach(s => s.classList.toggle('on', Number(s.dataset.star) <= n)); }
      spans.forEach(s => {
        s.addEventListener('click', () => { ratings[idx] = Number(s.dataset.star); paint(ratings[idx]); });
        s.addEventListener('mouseenter', () => paint(Number(s.dataset.star)));
      });
      picker.addEventListener('mouseleave', () => paint(ratings[idx]));
    });

    listWrap.querySelectorAll('[data-submit-review]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.submitReview);
        const order = orders[idx];
        const card = listWrap.querySelector(`.reviewable-card[data-idx="${idx}"]`);
        const errEl = card.querySelector('.error-text');
        const rating = ratings[idx];
        if (!rating) { errEl.textContent = 'กรุณาเลือกจำนวนดาว'; return; }
        const comment = card.querySelector('textarea').value.trim();
        await DB.submitReview({
          orderId: order.id,
          phone,
          customerName: order.customer.name || 'ลูกค้า',
          rating,
          comment,
        });
        card.innerHTML = `<div class="tag-muted">ส่งรีวิวเรียบร้อย ขอบคุณค่ะ/ครับ 🙏</div>`;
        renderStoreRating();
      });
    });
  }

  // ---------------- Store-wide rating display ----------------
  function renderStoreRating() {
    const badge = document.getElementById('storeRatingBadge');
    if (!badge) return;
    const summary = DB.getStoreRatingSummary();
    badge.innerHTML = summary.count
      ? `<span class="star-rating">${starsString(summary.average)}</span> <span class="avg">${summary.average.toFixed(1)}</span> <span class="tag-muted">(${summary.count} รีวิวจากลูกค้าจริง)</span>`
      : `<span class="tag-muted">ยังไม่มีรีวิว</span>`;
  }
  document.getElementById('btnOpenStoreReviews').addEventListener('click', e => {
    e.preventDefault();
    const listWrap = document.getElementById('storeReviewList');
    const reviews = DB.getReviews();
    listWrap.innerHTML = reviews.length ? reviews.map(r => `
      <div class="review-item">
        <div class="rhead">
          <span class="rname">${escapeHtml(maskReviewerName(r.customerName))}</span>
          <span class="star-rating">${starsString(r.rating)}</span>
        </div>
        ${r.comment ? `<div>${escapeHtml(r.comment)}</div>` : ''}
        <div class="rdate">${new Date(r.createdAt).toLocaleDateString('th-TH')}</div>
      </div>
    `).join('') : `<div class="tag-muted">ยังไม่มีรีวิว</div>`;
    document.getElementById('storeReviewsModal').classList.add('show');
  });

  // ---------------- เช็คสถานะออเดอร์ (เบอร์โทร → เลือกออเดอร์จากวันที่สั่ง → สถานะ/ขนส่ง/เลข Tracking) ----------------
  const trackingModal = document.getElementById('trackingModal');
  document.getElementById('btnOpenTracking').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('trackPhoneInput').value = '';
    document.getElementById('trackLookupMsg').textContent = '';
    document.getElementById('trackOrderList').innerHTML = '';
    document.getElementById('trackResult').innerHTML = '';
    trackingModal.classList.add('show');
  });

  document.getElementById('btnTrackLookup').addEventListener('click', runTrackLookup);
  document.getElementById('trackPhoneInput').addEventListener('keydown', e => { if (e.key === 'Enter') runTrackLookup(); });

  function runTrackLookup() {
    const phone = document.getElementById('trackPhoneInput').value.trim();
    const msg = document.getElementById('trackLookupMsg');
    const listWrap = document.getElementById('trackOrderList');
    document.getElementById('trackResult').innerHTML = '';
    if (!/^0\d{8,9}$/.test(phone)) { msg.textContent = 'กรุณากรอกเบอร์โทรให้ถูกต้อง'; listWrap.innerHTML = ''; return; }
    const orders = DB.getOrdersForPhone(phone);
    if (!orders.length) { msg.textContent = 'ไม่พบออเดอร์สำหรับเบอร์นี้'; listWrap.innerHTML = ''; return; }
    msg.textContent = '';
    renderTrackOrderList(orders);
  }

  function renderTrackOrderList(orders) {
    const listWrap = document.getElementById('trackOrderList');
    listWrap.innerHTML = `<div class="tag-muted" style="margin-bottom:8px">เลือกออเดอร์ที่ต้องการเช็คสถานะ:</div>` + orders.map(o => `
      <div class="reviewable-card" data-track-order="${o.id}" style="cursor:pointer">
        <div class="rp-head">
          <div>
            <div style="font-weight:600">ออเดอร์ ${escapeHtml(o.orderNo)}</div>
            <div class="tag-muted" style="font-size:11.5px">สั่งเมื่อ ${new Date(o.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })} · ${o.items.length} รายการ · ฿${o.total.toLocaleString()}</div>
          </div>
          <span class="status-pill status-${o.status}">${DB.STATUS[o.status]}</span>
        </div>
      </div>
    `).join('');
    listWrap.querySelectorAll('[data-track-order]').forEach(card => {
      card.addEventListener('click', () => {
        const order = orders.find(o => o.id === card.dataset.trackOrder);
        renderTrackResult(order);
      });
    });
  }

  function renderTrackResult(o) {
    const wrap = document.getElementById('trackResult');
    const stepDefs = [[1, 'รอตรวจสลิป'], [2, 'รอยืนยันเบอร์โทร'], [3, 'แพ็คแล้ว'], [4, 'จัดส่งแล้ว']];
    const orderDate = new Date(o.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    wrap.innerHTML = `
      <div style="border-top:1px solid var(--border);padding-top:14px">
        <div style="font-weight:600;font-size:16px">ออเดอร์ ${escapeHtml(o.orderNo)}</div>
        <div class="tag-muted" style="margin:2px 0 12px">วันที่สั่งซื้อ: ${orderDate}</div>
        <div class="steps" style="margin-bottom:14px">
          ${stepDefs.map(([n, label], idx) => `
            ${idx > 0 ? '<div class="step-sep"></div>' : ''}
            <div class="step ${o.status === n ? 'active' : ''} ${o.status > n ? 'done' : ''}"><span class="num">${n}</span> ${escapeHtml(label)}</div>
          `).join('')}
        </div>
        ${o.status === 4 ? `
          <div class="order-meta-grid">
            <div><strong>จัดส่งโดย:</strong> ${o.courier ? escapeHtml(DB.COURIERS[o.courier] || o.courier) : '-'}</div>
            <div><strong>เลข Tracking:</strong> ${o.trackingNo ? escapeHtml(o.trackingNo) : '-'}</div>
          </div>
          <div class="tag-muted" style="margin-top:8px;font-size:12.5px">นำเลข Tracking ไปเช็คสถานะการเดินทางของพัสดุได้ที่เว็บไซต์หรือแอปของขนส่งที่ระบุไว้ด้านบน</div>
        ` : ''}
      </div>
    `;
  }

  // ---------------- Pre-order (ปลดล็อกด้วยรหัสจากทางร้าน — สั่งได้แม้สต็อกไม่พอ ไม่ตัดสต็อกจริง) ----------------
  const PREORDER_KEY = 'ew_preorder_unlocked';
  function isPreorderUnlocked() { return sessionStorage.getItem(PREORDER_KEY) === '1'; }

  const preorderModal = document.getElementById('preorderModal');
  const btnOpenPreorder = document.getElementById('btnOpenPreorder');
  function updatePreorderButtonLabel() {
    const unlocked = isPreorderUnlocked();
    btnOpenPreorder.textContent = unlocked ? '🔓 Pre-order (เปิดใช้งานอยู่)' : '🔓 มีรหัส Pre-order?';
    btnOpenPreorder.title = unlocked ? 'กดเพื่อออกจากโหมด Pre-order' : '';
  }
  updatePreorderButtonLabel();

  // ปรับตะกร้าให้ตรงกับสต็อกจริงหลังออกจากโหมด Pre-order (กันเหลือรายการที่สั่งเกินสต็อกค้างเป็นออเดอร์ปกติแบบไม่ตั้งใจ)
  function reconcileCartAfterPreorderExit() {
    const cart = getCart();
    const products = DB.getProducts();
    let changed = false;
    const reconciled = cart.filter(item => {
      const p = products.find(x => x.id === item.productId);
      const v = p && p.variants.find(x => x.id === item.variantId);
      const maxQty = v ? v.stock : 0;
      if (maxQty <= 0) { changed = true; return false; }
      if (item.qty > maxQty) { item.qty = maxQty; changed = true; }
      return true;
    });
    setCart(reconciled);
    return changed;
  }

  btnOpenPreorder.addEventListener('click', e => {
    e.preventDefault();
    if (isPreorderUnlocked()) {
      if (!confirm('ออกจากโหมด Pre-order? ถ้ามีสินค้าที่สต็อกไม่พอ/หมดอยู่ในตะกร้า ระบบจะปรับจำนวนหรือนำออกให้อัตโนมัติ')) return;
      sessionStorage.removeItem(PREORDER_KEY);
      const cartChanged = reconcileCartAfterPreorderExit();
      updatePreorderButtonLabel();
      renderCartCount();
      showToast(cartChanged ? 'ออกจากโหมด Pre-order แล้ว — ปรับตะกร้าให้ตรงกับสต็อกจริงแล้ว' : 'ออกจากโหมด Pre-order แล้ว');
      renderGrid();
      if (productModal.classList.contains('show')) renderProductPopup();
      if (cartModal.classList.contains('show')) renderCheckout();
      return;
    }
    document.getElementById('preorderCodeInput').value = '';
    document.getElementById('preorderMsg').textContent = '';
    preorderModal.classList.add('show');
  });

  async function runPreorderUnlock() {
    const code = document.getElementById('preorderCodeInput').value.trim();
    const msg = document.getElementById('preorderMsg');
    if (!code) { msg.textContent = 'กรุณากรอกรหัส'; return; }
    const ok = await DB.verifyPreorderCode(code);
    if (!ok) { msg.textContent = 'รหัสไม่ถูกต้อง'; return; }
    sessionStorage.setItem(PREORDER_KEY, '1');
    msg.textContent = '';
    preorderModal.classList.remove('show');
    updatePreorderButtonLabel();
    showToast('ปลดล็อก Pre-order แล้ว — สั่งสินค้าที่สต็อกไม่พอได้เลย');
    renderGrid();
    if (productModal.classList.contains('show')) renderProductPopup();
  }
  document.getElementById('btnPreorderUnlock').addEventListener('click', runPreorderUnlock);
  document.getElementById('preorderCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') runPreorderUnlock(); });

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
  let checkoutPromo = null;
  let checkoutPaymentMethod = 'promptpay';
  let checkoutSlipDataUrl = null;

  function renderCartCount() {
    const cart = getCart();
    const count = cart.reduce((s, i) => s + i.qty, 0);
    const badge = document.getElementById('cartCount');
    if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }

  document.getElementById('btnCart').addEventListener('click', () => {
    checkoutStep = 1;
    checkoutPromo = null;
    checkoutPaymentMethod = 'promptpay';
    checkoutSlipDataUrl = null;
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
  function cartTotalQty(cart) { return cart.reduce((s, i) => s + i.qty, 0); }
  function currentShippingFee(cart) { return (checkoutPromo && (checkoutPromo.type || 'freeship') === 'freeship') ? 0 : DB.calcShippingFee(cart); }
  function currentCodFee() { return checkoutPaymentMethod === 'cod' ? DB.COD_FEE : 0; }
  function currentSmallOrderFee(cart) { return DB.calcSmallOrderFee(cart); }
  function currentPromoDiscount() { return (checkoutPromo && checkoutPromo.type === 'amount') ? (checkoutPromo.discountAmount || 0) : 0; }

  function renderCheckout() {
    setStepUI(checkoutStep);
    const body = document.getElementById('checkoutBody');
    const cart = getCart();

    if (checkoutStep === 1) {
      if (!cart.length) {
        body.innerHTML = `<div class="empty-state"><div class="big">🛒</div>ยังไม่มีสินค้าในตะกร้า</div>`;
        return;
      }
      const preorderMode = isPreorderUnlocked();
      const subtotal = cartTotal(cart);
      const totalQty = cartTotalQty(cart);
      const totalWeightKg = DB.calcCartWeightGrams(cart) / 1000;
      const shippingFee = currentShippingFee(cart);
      const smallOrderFee = currentSmallOrderFee(cart);
      const discountAmount = currentPromoDiscount();
      const codOk = DB.isCodAvailable(cart);
      if (!codOk && checkoutPaymentMethod === 'cod') checkoutPaymentMethod = 'promptpay';
      const codFee = preorderMode ? 0 : currentCodFee();
      const overLimit = shippingFee == null;
      const grandTotal = overLimit ? null : Math.max(0, subtotal + shippingFee + smallOrderFee + codFee - discountAmount);

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

        <div class="field" style="margin-top:14px;max-width:340px">
          <label>คูปองส่วนลด (ถ้ามี)</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="promoInput" placeholder="กรอกโค้ด" value="${checkoutPromo ? checkoutPromo.code : ''}" ${checkoutPromo ? 'disabled' : ''}>
            ${checkoutPromo
              ? `<button class="btn btn-sm btn-danger" id="btnRemovePromo" type="button">ยกเลิก</button>`
              : `<button class="btn btn-sm" id="btnApplyPromo" type="button">ใช้คูปอง</button>`}
          </div>
          <div class="error-text" id="promoMsg">${checkoutPromo ? ((checkoutPromo.type || 'freeship') === 'amount' ? `ใช้ส่วนลด ฿${(checkoutPromo.discountAmount || 0).toLocaleString()} แล้ว ✓` : 'ใช้คูปองส่งฟรีแล้ว ✓') : ''}</div>
        </div>

        <div class="cart-summary-total" style="flex-direction:column;align-items:stretch;gap:5px">
          <div style="display:flex;justify-content:space-between"><span>ยอดสินค้า</span><span>฿${subtotal.toLocaleString()}</span></div>
          <div style="display:flex;justify-content:space-between">
            <span>ค่าจัดส่ง (${totalWeightKg.toFixed(1)} กก.)</span>
            <span>${overLimit ? 'ติดต่อร้าน' : (shippingFee === 0 ? 'ฟรี' : '฿' + shippingFee.toLocaleString())}</span>
          </div>
          ${smallOrderFee ? `<div style="display:flex;justify-content:space-between"><span>ค่าบริการออเดอร์เล็ก (ต่ำกว่า ${DB.SMALL_ORDER_MIN_QTY} ชิ้น)</span><span>฿${smallOrderFee.toLocaleString()}</span></div>` : ''}
          ${codFee ? `<div style="display:flex;justify-content:space-between"><span>ค่าบริการเก็บเงินปลายทาง</span><span>฿${codFee.toLocaleString()}</span></div>` : ''}
          ${discountAmount ? `<div style="display:flex;justify-content:space-between"><span>ส่วนลด</span><span>−฿${discountAmount.toLocaleString()}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;font-weight:700;font-size:16px;border-top:1px solid var(--border);padding-top:6px">
            <span>ยอดรวมทั้งหมด</span><span>฿${overLimit ? subtotal.toLocaleString() + ' +ค่าส่ง' : grandTotal.toLocaleString()}</span>
          </div>
        </div>

        ${preorderMode ? `
        <div class="tag-muted" style="margin-top:14px;color:var(--accent)">🔓 โหมด Pre-order — ข้ามขั้นตอนชำระเงิน แอดมินจะติดต่อสรุปยอด/วิธีชำระเงินให้ทาง LINE หลังได้รับออเดอร์</div>
        ` : `
        <div class="field" style="margin-top:14px">
          <label>วิธีชำระเงิน</label>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="radio" name="payMethod" value="promptpay" ${checkoutPaymentMethod === 'promptpay' ? 'checked' : ''}> พร้อมเพย์ (สแกน QR)</label>
            <label style="display:flex;gap:6px;align-items:center;font-weight:400;${codOk ? '' : 'opacity:.5'}"><input type="radio" name="payMethod" value="cod" ${checkoutPaymentMethod === 'cod' ? 'checked' : ''} ${codOk ? '' : 'disabled'}> เก็บเงินปลายทาง (+฿${DB.COD_FEE})</label>
          </div>
          ${!codOk ? `<div class="tag-muted" style="margin-top:4px">เก็บเงินปลายทางให้บริการเฉพาะน้ำหนักรวมไม่เกิน ${DB.COD_MAX_KG} กก. คำสั่งซื้อนี้เกินกำหนด จึงรองรับเฉพาะพร้อมเพย์</div>` : ''}
        </div>
        `}

        ${overLimit ? `<div class="error-text">น้ำหนักรวมเกิน 20 กก. ระบบยังไม่มีเกณฑ์ค่าส่งอัตโนมัติ กรุณาติดต่อร้านโดยตรงเพื่อสอบถามค่าจัดส่งก่อนสั่งซื้อ</div>` : ''}
        <button class="btn btn-primary btn-block" id="btnGoPayment" style="margin-top:10px" ${overLimit ? 'disabled' : ''}>${preorderMode ? 'ถัดไป: กรอกที่อยู่จัดส่ง' : 'ถัดไป'}</button>
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
      const applyPromoBtn = document.getElementById('btnApplyPromo');
      if (applyPromoBtn) applyPromoBtn.addEventListener('click', async () => {
        const code = document.getElementById('promoInput').value.trim();
        const msg = document.getElementById('promoMsg');
        if (!code) { msg.textContent = 'กรุณากรอกโค้ด'; return; }
        const result = await DB.applyPromotion(code);
        if (!result.ok) {
          msg.textContent = result.reason === 'notfound' ? 'ไม่พบโค้ดนี้'
            : result.reason === 'exhausted' ? 'โค้ดนี้ถูกใช้ครบจำนวนแล้ว'
            : 'โค้ดนี้ไม่สามารถใช้ได้แล้ว';
          return;
        }
        checkoutPromo = result.promotion;
        renderCheckout();
      });
      const removePromoBtn = document.getElementById('btnRemovePromo');
      if (removePromoBtn) removePromoBtn.addEventListener('click', () => { checkoutPromo = null; renderCheckout(); });
      body.querySelectorAll('input[name="payMethod"]').forEach(r => {
        r.addEventListener('change', e => { checkoutPaymentMethod = e.target.value; renderCheckout(); });
      });
      const goBtn = document.getElementById('btnGoPayment');
      if (goBtn) goBtn.addEventListener('click', () => { checkoutStep = preorderMode ? 3 : 2; renderCheckout(); });
      return;
    }

    if (checkoutStep === 2) {
      const subtotal = cartTotal(cart);
      const shippingFee = currentShippingFee(cart) || 0;
      const smallOrderFee = currentSmallOrderFee(cart);
      const discountAmount = currentPromoDiscount();
      const codFee = currentCodFee();
      const grandTotal = Math.max(0, subtotal + shippingFee + smallOrderFee + codFee - discountAmount);
      const extraFeesNote = [
        shippingFee ? `ค่าจัดส่ง ฿${shippingFee.toLocaleString()}` : null,
        smallOrderFee ? `ค่าบริการออเดอร์เล็ก ฿${smallOrderFee.toLocaleString()}` : null,
      ].filter(Boolean).join(' และ ');

      if (checkoutPaymentMethod === 'cod') {
        body.innerHTML = `
          <div class="qr-box">
            <div style="font-size:40px">📦</div>
            <div class="qr-amount">฿${grandTotal.toLocaleString()}</div>
            <div class="qr-hint">ชำระเงินปลายทางกับพนักงานจัดส่งเมื่อได้รับสินค้า<br>(รวม${extraFeesNote ? extraFeesNote + ' และ' : ''}ค่าบริการเก็บเงินปลายทาง ฿${codFee.toLocaleString()} แล้ว)</div>
          </div>
          <div style="display:flex;gap:10px;margin-top:14px;">
            <button class="btn" id="btnBack1">‹ กลับ</button>
            <button class="btn btn-primary btn-block" id="btnGoAddress">ถัดไป: กรอกที่อยู่จัดส่ง</button>
          </div>
        `;
        document.getElementById('btnBack1').addEventListener('click', () => { checkoutStep = 1; renderCheckout(); });
        document.getElementById('btnGoAddress').addEventListener('click', () => { checkoutStep = 3; renderCheckout(); });
        return;
      }

      body.innerHTML = `
        <div class="qr-box">
          <img src="assets/promptpay-qr.jpg" alt="QR พร้อมเพย์ร้าน OptiHub" style="max-width:220px;width:100%;border-radius:12px;border:1px solid var(--border);background:#fff;padding:8px">
          <div class="qr-amount">฿${grandTotal.toLocaleString()}</div>
          <div class="qr-hint">สแกน QR ด้วยแอปธนาคารใดก็ได้ (PromptPay) แล้ว<strong>กรอกยอดเงิน ฿${grandTotal.toLocaleString()} ด้วยตัวเอง</strong>ก่อนโอน — ยอดนี้รวม${extraFeesNote || 'ค่าจัดส่ง'}แล้ว<br>แอดมินจะตรวจสอบสลิปการโอนของท่านหลังยืนยันคำสั่งซื้อ</div>
        </div>
        <div class="field" style="max-width:340px;margin:14px auto 0">
          <label>แนบสลิปโอนเงิน<br><span class="tag-muted" style="font-weight:400">(แนะนำ — ช่วยให้แอดมินตรวจสอบไวขึ้น ไม่บังคับ)</span></label>
          <input type="file" accept="image/*" id="slipInput">
          ${checkoutSlipDataUrl ? `<div style="margin-top:8px"><img src="${checkoutSlipDataUrl}" alt="" style="max-width:120px;border-radius:8px;border:1px solid var(--border)"></div>` : ''}
        </div>
        <div style="display:flex;gap:10px;margin-top:14px;">
          <button class="btn" id="btnBack1">‹ กลับ</button>
          <button class="btn btn-primary btn-block" id="btnGoAddress">ถัดไป: กรอกที่อยู่จัดส่ง</button>
        </div>
      `;
      document.getElementById('slipInput').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => { checkoutSlipDataUrl = ev.target.result; renderCheckout(); };
        reader.readAsDataURL(file);
      });
      document.getElementById('btnBack1').addEventListener('click', () => { checkoutStep = 1; renderCheckout(); });
      document.getElementById('btnGoAddress').addEventListener('click', () => { checkoutStep = 3; renderCheckout(); });
      return;
    }

    if (checkoutStep === 3) {
      body.innerHTML = `
        <div class="form-grid">
          <div class="field span2"><label>เบอร์โทร *</label><input type="tel" id="adPhone" maxlength="10" placeholder="08xxxxxxxx"></div>
          <div class="field"><label>ชื่อ-นามสกุลผู้รับ *</label><input type="text" id="adName"></div>
          <div class="field"><label>LINE ID (สำรอง)</label><input type="text" id="adLine"></div>
          <div class="field span2"><label>ที่อยู่ (บ้านเลขที่ ถนน ซอย) *</label><input type="text" id="adAddress"></div>
          <div class="field"><label>แขวง/ตำบล *</label><input type="text" id="adSubdistrict"></div>
          <div class="field"><label>เขต/อำเภอ *</label><input type="text" id="adDistrict"></div>
          <div class="field"><label>จังหวัด *</label><input type="text" id="adProvince"></div>
          <div class="field"><label>รหัสไปรษณีย์ *</label><input type="text" id="adZip" maxlength="5"></div>
        </div>
        <div class="error-text" id="addressError"></div>
        <div style="display:flex;gap:10px;margin-top:8px;">
          <button class="btn" id="btnBack2">‹ กลับ</button>
          <button class="btn btn-primary btn-block" id="btnConfirmOrder">ยืนยันคำสั่งซื้อ</button>
        </div>
      `;
      document.getElementById('adPhone').addEventListener('blur', () => {
        const phone = document.getElementById('adPhone').value.trim();
        if (!/^0\d{8,9}$/.test(phone)) return;
        const cust = DB.getCustomerByPhone(phone);
        if (!cust) return;
        document.getElementById('adName').value = cust.name || '';
        document.getElementById('adLine').value = cust.lineId || '';
        document.getElementById('adAddress').value = cust.address || '';
        document.getElementById('adSubdistrict').value = cust.subdistrict || '';
        document.getElementById('adDistrict').value = cust.district || '';
        document.getElementById('adProvince').value = cust.province || '';
        document.getElementById('adZip').value = cust.zipcode || '';
        showToast('พบข้อมูลลูกค้าเดิม เติมให้อัตโนมัติแล้ว (แก้ไขได้ถ้าต้องการเปลี่ยน)');
      });
      document.getElementById('btnBack2').addEventListener('click', () => { checkoutStep = isPreorderUnlocked() ? 1 : 2; renderCheckout(); });
      document.getElementById('btnConfirmOrder').addEventListener('click', submitOrder);
      return;
    }

    if (checkoutStep === 4) {
      const isPreorderOrder = lastOrder && lastOrder.isPreorder;
      const codMsg = lastOrder && lastOrder.paymentMethod === 'cod'
        ? 'เตรียมเงินสดไว้ชำระกับพนักงานจัดส่งเมื่อสินค้าถึง'
        : 'แอดมินจะตรวจสอบสลิปและติดต่อกลับเพื่อยืนยันเบอร์โทร/ที่อยู่';
      body.innerHTML = `
        <div class="order-done">
          <div class="ok-icon">✅</div>
          <div>${isPreorderOrder ? 'บันทึกรายการ Pre-order เรียบร้อย' : 'สั่งซื้อสำเร็จ ขอบคุณที่อุดหนุนค่ะ/ครับ'}</div>
          <div class="order-no">เลขที่ออเดอร์ ${lastOrder ? lastOrder.orderNo : ''}</div>
          ${isPreorderOrder ? `
            <div class="tag-muted" style="margin-top:6px">รายการนี้ยังไม่ได้ชำระเงิน — กรุณาส่ง<strong>เลขที่ออเดอร์ด้านบน</strong>ไปทาง LINE ร้าน เพื่อให้แอดมินสรุปยอดและยืนยันสินค้ากลับไปอีกครั้ง</div>
            <a class="btn btn-primary" style="margin-top:14px;text-decoration:none" href="https://lin.ee/Th0WU0AQ" target="_blank" rel="noopener noreferrer">แชทผ่าน LINE ร้าน</a>
          ` : `<div class="tag-muted">${codMsg}</div>`}
          <button class="btn" style="margin-top:12px" id="btnCloseDone">ปิดหน้าต่าง</button>
        </div>
      `;
      document.getElementById('btnCloseDone').addEventListener('click', () => {
        cartModal.classList.remove('show');
      });
      return;
    }
  }

  async function submitOrder() {
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
    const preorderMode = isPreorderUnlocked();
    const subtotal = cartTotal(cart);
    const shippingFee = currentShippingFee(cart) || 0;
    const smallOrderFee = currentSmallOrderFee(cart);
    const discountAmount = currentPromoDiscount();
    const codFee = preorderMode ? 0 : currentCodFee();
    const total = Math.max(0, subtotal + shippingFee + smallOrderFee + codFee - discountAmount);
    lastOrder = await DB.createOrder({
      items: cart,
      subtotal,
      shippingFee,
      smallOrderFee,
      codFee,
      discountAmount,
      total,
      customer: { name, phone, lineId, address, subdistrict, district, province, zipcode },
      paymentMethod: preorderMode ? 'line' : checkoutPaymentMethod,
      promoCode: checkoutPromo ? checkoutPromo.code : null,
      paymentSlip: checkoutSlipDataUrl,
      isPreorder: preorderMode,
    });
    setCart([]);
    checkoutPromo = null;
    checkoutPaymentMethod = 'promptpay';
    checkoutSlipDataUrl = null;
    checkoutStep = 4;
    renderCheckout();
    renderGrid();
  }

  // ---------------- init ----------------
  DB.init().then(() => {
    renderCartCount();
    updateFilterBadge();
    renderStoreRating();
    renderGrid();
  }).catch((err) => {
    console.error('DB.init failed', err);
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="background:#fee2e2;color:#991b1b;padding:12px;text-align:center;font-size:14px">โหลดข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ: ' + (err.message || err) + '</div>');
  });
})();
