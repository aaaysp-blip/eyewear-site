/*
 * db.js — เชื่อมกับ Supabase จริงผ่าน /api/* ทั้งหมด (products, orders, customers,
 * config, restocks, promotions, reviews)
 * โครงสร้าง: cache ในหน่วยความจำ + async mutation
 *   - ฟังก์ชันอ่าน (getProducts, getOrders, getConfig ฯลฯ) ยังคง synchronous เหมือนเดิมทุกประการ
 *     (อ่านจาก cache ที่โหลดไว้ตอน DB.init() ไม่ใช่ยิง fetch ทุกครั้ง) — เพื่อไม่ต้องแก้โค้ด
 *     render/loop ที่มีอยู่แล้วใน store.js/admin.js
 *   - ฟังก์ชันเขียน (saveProduct, createOrder, setConfig, createRestock,
 *     createPromotion, submitReview ฯลฯ) เป็น async เรียก API จริง แล้วอัปเดต cache
 *     ให้ตรงกันก่อน resolve
 */
(function (global) {
  // ---------- placeholder image generator (SVG data URI) — ไม่เกี่ยวกับฐานข้อมูล ไม่แตะ ----------
  const COLOR_HEX = {
    'ดำ': '#2b2b2b', 'ดำด้าน': '#26262a', 'น้ำตาล': '#8a5a34', 'น้ำตาลเข้ม': '#5a3a20',
    'ทอง': '#c9a24b', 'เงิน': '#b9bfc4', 'กุหลาบทอง': '#caa593', 'ใส': '#dfe6e6',
    'เขียวมะกอก': '#6f7a4a', 'เขียว': '#3f7a56', 'ฟ้า': '#5b87ab', 'น้ำเงิน': '#33507a',
    'แดง': '#a5423c', 'ชมพู': '#d68fa0', 'ม่วง': '#7a5a91', 'เทา': '#8b8b85',
    'ขาว': '#f2f0ea', 'เบจ': '#cdbfa4', 'กระ': '#a07850', 'ส้ม': '#c97b3d',
  };
  function hashHue(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  function placeholderImage(label, colorName, category) {
    const hex = COLOR_HEX[colorName] || `hsl(${hashHue(colorName || label || 'x')},32%,55%)`;
    const icon = category === 'accessories'
      ? '<rect x="60" y="90" width="180" height="120" rx="14" fill="rgba(255,255,255,.5)"/>'
      : '<circle cx="105" cy="150" r="58" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="10"/>' +
        '<circle cx="195" cy="150" r="58" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="10"/>' +
        '<line x1="163" y1="150" x2="137" y2="150" stroke="rgba(255,255,255,.75)" stroke-width="10"/>' +
        '<line x1="47" y1="140" x2="18" y2="120" stroke="rgba(255,255,255,.75)" stroke-width="10"/>' +
        '<line x1="253" y1="140" x2="282" y2="120" stroke="rgba(255,255,255,.75)" stroke-width="10"/>';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
      <rect width="300" height="300" fill="${hex}"/>
      ${icon}
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function isNew(product) {
    const created = new Date(product.createdAt).getTime();
    const diffDays = (Date.now() - created) / 86400000;
    return diffDays <= 3;
  }

  // ---------- API helper ----------
  async function apiFetch(url, options) {
    const opts = Object.assign({ headers: { 'Content-Type': 'application/json' } }, options);
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* ไม่มี body หรือไม่ใช่ JSON (เช่นรูปภาพ) */ }
    if (!res.ok) throw new Error((data && data.error) || `${res.status} ${res.statusText}`);
    return data;
  }

  // ---------- mapping: snake_case (Supabase) <-> camelCase (โค้ดฝั่งหน้าเว็บ) ----------
  function mapProduct(row) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      brand: row.brand,
      category: row.category,
      price: Number(row.price),
      frameWidth: row.frame_width,
      lensWidth: row.lens_width,
      lensHeight: row.lens_height,
      bridgeWidth: row.bridge_width,
      templeLength: row.temple_length,
      accWidth: row.acc_width,
      accLength: row.acc_length,
      material: row.material,
      images: row.images || [],
      imagesOriginal: row.images_original || [],
      createdAt: row.created_at,
      variants: (row.variants || []).map((v) => ({ id: v.id, color: v.color, stock: v.stock, images: v.images || [] })),
    };
  }

  function productToApiBody(product) {
    const body = {
      code: product.code,
      name: product.name,
      brand: product.brand,
      category: product.category,
      price: product.price,
      frame_width: product.frameWidth,
      lens_width: product.lensWidth,
      lens_height: product.lensHeight,
      bridge_width: product.bridgeWidth,
      temple_length: product.templeLength,
      acc_width: product.accWidth,
      acc_length: product.accLength,
      material: product.material,
      images: product.images || [],
      images_original: product.imagesOriginal || [],
      variants: (product.variants || []).map((v) => {
        const row = { color: v.color, stock: v.stock || 0, images: v.images || [] };
        if (v.id) row.id = v.id;
        return row;
      }),
    };
    if (product.id) body.id = product.id;
    return body;
  }

  function mapOrderItem(it) {
    return {
      productId: it.product_id, variantId: it.variant_id, code: it.code,
      name: it.name, color: it.color, qty: it.qty, price: Number(it.price), image: it.image,
    };
  }

  function mapCustomer(row) {
    return {
      phone: row.phone, name: row.name, lineId: row.line_id, address: row.address,
      subdistrict: row.subdistrict, district: row.district, province: row.province,
      zipcode: row.zipcode, createdAt: row.created_at,
    };
  }

  // ต้องเรียกหลัง cache.customers โหลดแล้ว เพราะ join ลูกค้าเข้ากับออเดอร์ฝั่ง client
  // (ตาราง orders เก็บแค่ customer_phone อ้างอิง ไม่ได้ฝัง snapshot ลูกค้าทั้งก้อนเหมือน mock เดิม)
  function mapOrder(row) {
    const cust = cache.customers.find((c) => c.phone === row.customer_phone) || { phone: row.customer_phone };
    return {
      id: row.id,
      orderNo: row.order_no,
      status: row.status,
      total: Number(row.total),
      subtotal: row.subtotal != null ? Number(row.subtotal) : Number(row.total),
      shippingFee: Number(row.shipping_fee) || 0,
      smallOrderFee: Number(row.small_order_fee) || 0,
      codFee: Number(row.cod_fee) || 0,
      discountAmount: Number(row.discount_amount) || 0,
      paymentMethod: row.payment_method || 'promptpay',
      promoCode: row.promo_code || null,
      paymentSlip: row.payment_slip || null,
      trackingNo: row.tracking_no || null,
      courier: row.courier || null,
      codDeliveryStatus: row.cod_delivery_status || null,
      isPreorder: !!row.is_preorder,
      customer: cust,
      items: (row.items || []).map(mapOrderItem),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapConfig(row) {
    return {
      promptpayId: row.promptpay_id,
      lowStockThreshold: row.low_stock_threshold,
      shopPhone: row.shop_phone || '',
      shopAddress: row.shop_address || '',
    };
  }

  function mapRestockItem(it) {
    return {
      id: it.id, productId: it.product_id, variantId: it.variant_id,
      code: it.code, name: it.name, color: it.color,
      qtyOrdered: it.qty_ordered, currentStock: it.current_stock, qtyReceived: it.qty_received,
    };
  }
  function mapRestock(row) {
    return {
      id: row.id, poNo: row.po_no, note: row.note || '', status: row.status,
      createdAt: row.created_at, receivedAt: row.received_at,
      items: (row.items || []).map(mapRestockItem),
    };
  }

  function mapPromotion(row) {
    return {
      id: row.id, code: row.code, maxUses: row.max_uses, type: row.type,
      discountAmount: Number(row.discount_amount) || 0,
      timesApplied: row.times_applied, timesRedeemed: row.times_redeemed,
      active: row.active, createdAt: row.created_at,
    };
  }

  function mapReview(row) {
    return {
      id: row.id, orderId: row.order_id, phone: row.phone, customerName: row.customer_name,
      rating: row.rating, comment: row.comment, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  // ---------- cache ----------
  const cache = {
    products: [], orders: [], customers: [], restocks: [], promotions: [], reviews: [],
    config: { promptpayId: '0000000000', lowStockThreshold: 2, shopPhone: '', shopAddress: '' },
  };

  async function init() {
    const [customersRaw, productsRaw, ordersRaw, configRaw, restocksRaw, promotionsRaw, reviewsRaw] = await Promise.all([
      apiFetch('/api/customers'),
      apiFetch('/api/products'),
      apiFetch('/api/orders'),
      apiFetch('/api/config'),
      apiFetch('/api/restocks'),
      apiFetch('/api/promotions'),
      apiFetch('/api/reviews'),
    ]);
    cache.customers = customersRaw.map(mapCustomer);
    cache.products = productsRaw.map(mapProduct);
    cache.orders = ordersRaw.map(mapOrder); // ต้องมาหลัง customers เพราะ mapOrder join จาก cache.customers
    cache.config = mapConfig(configRaw);
    cache.restocks = restocksRaw.map(mapRestock);
    cache.promotions = promotionsRaw.map(mapPromotion);
    cache.reviews = reviewsRaw.map(mapReview);
  }

  function upsertCachedCustomer(customerData) {
    const idx = cache.customers.findIndex((c) => c.phone === customerData.phone);
    const merged = {
      phone: customerData.phone, name: customerData.name, lineId: customerData.lineId,
      address: customerData.address, subdistrict: customerData.subdistrict, district: customerData.district,
      province: customerData.province, zipcode: customerData.zipcode,
      createdAt: idx >= 0 ? cache.customers[idx].createdAt : new Date().toISOString(),
    };
    if (idx >= 0) cache.customers[idx] = merged; else cache.customers.unshift(merged);
  }

  // ---------- Products ----------
  function getProducts() { return cache.products; }
  function getProduct(id) { return cache.products.find((p) => p.id === id) || null; }
  function getProductByCode(code) { return cache.products.find((p) => p.code.toLowerCase() === String(code).toLowerCase()) || null; }

  function generateNextCode() {
    let max = 0;
    cache.products.forEach((p) => {
      const m = /^C(\d+)$/i.exec(p.code || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'C' + (max + 1);
  }

  async function saveProduct(product) {
    const body = productToApiBody(product);
    const { id } = await apiFetch('/api/products', { method: 'POST', body: JSON.stringify(body) });
    // สินค้า/ตัวเลือกสีอาจถูกเพิ่ม/ลบ/reassign id ฝั่งเซิร์ฟเวอร์ — ดึงรายการสินค้าใหม่ทั้งก้อนให้ตรงกันชัวร์ๆ
    const productsRaw = await apiFetch('/api/products');
    cache.products = productsRaw.map(mapProduct);
    return cache.products.find((p) => p.id === id) || null;
  }

  async function deleteProduct(id) {
    await apiFetch('/api/products?id=' + encodeURIComponent(id), { method: 'DELETE' });
    cache.products = cache.products.filter((p) => p.id !== id);
  }

  async function updateVariantStock(productId, variantId, newStock) {
    const stock = Math.max(0, parseInt(newStock, 10) || 0);
    await apiFetch('/api/products', { method: 'PATCH', body: JSON.stringify({ variantId, stock }) });
    const p = cache.products.find((x) => x.id === productId);
    const v = p && p.variants.find((x) => x.id === variantId);
    if (v) v.stock = stock;
  }

  // เปลี่ยนชื่อแบรนด์แบบ retroactive — มีผลกับทุกสินค้าที่ใช้แบรนด์เดิมอยู่
  async function renameBrand(oldName, newName) {
    await apiFetch('/api/products', { method: 'PATCH', body: JSON.stringify({ renameBrand: { from: oldName, to: newName } }) });
    cache.products.forEach((p) => { if (p.brand === oldName) p.brand = newName; });
  }

  // ---------- Orders ----------
  const STATUS = {
    1: 'รอตรวจสลิป',
    2: 'รอยืนยันเบอร์โทร',
    3: 'แพ็คแล้ว',
    4: 'จัดส่งแล้ว',
  };

  const COURIERS = {
    kex: 'KEX (Kerry Express)',
    flash: 'Flash Express',
    ems: 'ไปรษณีย์ไทย (EMS)',
    jt: 'J&T Express',
    spx: 'SPX Express',
  };

  function getOrders() { return cache.orders; }
  function getOrder(id) { return cache.orders.find((o) => o.id === id) || null; }
  function getOrdersForPhone(phone) {
    const p = String(phone || '').trim();
    return cache.orders.filter((o) => o.customer.phone === p);
  }

  async function createOrder({ items, subtotal, shippingFee, smallOrderFee, codFee, discountAmount, total, customer, paymentMethod, promoCode, paymentSlip, isPreorder }) {
    const body = {
      items, subtotal, shippingFee, smallOrderFee, codFee, discountAmount, total, customer,
      paymentMethod: paymentMethod || 'promptpay', promoCode: promoCode || null, paymentSlip: paymentSlip || null,
      isPreorder: !!isPreorder,
    };
    const resp = await apiFetch('/api/orders', { method: 'POST', body: JSON.stringify(body) });

    const order = {
      id: resp.id,
      orderNo: resp.order_no,
      status: resp.status,
      total: Number(resp.total),
      subtotal: resp.subtotal != null ? Number(resp.subtotal) : subtotal,
      shippingFee: Number(resp.shipping_fee) || 0,
      smallOrderFee: Number(resp.small_order_fee) || 0,
      codFee: Number(resp.cod_fee) || 0,
      discountAmount: Number(resp.discount_amount) || 0,
      paymentMethod: resp.payment_method || 'promptpay',
      promoCode: resp.promo_code || null,
      paymentSlip: resp.payment_slip || null,
      trackingNo: null,
      courier: null,
      codDeliveryStatus: null,
      isPreorder: !!resp.is_preorder,
      customer,
      items: resp.items || items,
      createdAt: resp.created_at,
      updatedAt: resp.updated_at,
    };
    cache.orders.unshift(order);
    upsertCachedCustomer(customer);

    // ลดสต็อกใน cache ให้ตรงกับที่ /api/orders ลดให้จริงแล้วฝั่งเซิร์ฟเวอร์ (ข้ามถ้าเป็น pre-order เพราะเซิร์ฟเวอร์ก็ไม่ได้ตัดสต็อกจริงเช่นกัน)
    if (!isPreorder) {
      items.forEach((item) => {
        const p = cache.products.find((x) => x.id === item.productId);
        const v = p && p.variants.find((x) => x.id === item.variantId);
        if (v) v.stock = Math.max(0, v.stock - item.qty);
      });
    }

    if (promoCode) await redeemPromotion(promoCode);
    return order;
  }

  async function updateOrderStatus(id, status) {
    await apiFetch('/api/orders', { method: 'PATCH', body: JSON.stringify({ id, status }) });
    const o = cache.orders.find((x) => x.id === id);
    if (o) { o.status = status; o.updatedAt = new Date().toISOString(); }
  }

  function nextStatus(status) { return Math.min(4, status + 1); }

  async function setTrackingAndShip(id, trackingNo, courier) {
    const trimmed = String(trackingNo || '').trim();
    await apiFetch('/api/orders', { method: 'PATCH', body: JSON.stringify({ id, trackingNo: trimmed, courier, status: 4 }) });
    const o = cache.orders.find((x) => x.id === id);
    if (!o) return null;
    o.trackingNo = trimmed;
    o.courier = courier || null;
    o.status = 4;
    o.updatedAt = new Date().toISOString();
    return o;
  }

  async function markCodDelivered(id) {
    await apiFetch('/api/orders', { method: 'PATCH', body: JSON.stringify({ id, codDeliveryStatus: 'delivered' }) });
    const o = cache.orders.find((x) => x.id === id);
    if (o) { o.codDeliveryStatus = 'delivered'; o.updatedAt = new Date().toISOString(); }
  }

  async function markCodReturned(id) {
    const o = cache.orders.find((x) => x.id === id);
    if (!o || o.codDeliveryStatus === 'returned') return; // กันคืนสต็อกซ้ำ
    await apiFetch('/api/orders', { method: 'PATCH', body: JSON.stringify({ id, codDeliveryStatus: 'returned' }) });
    o.codDeliveryStatus = 'returned';
    o.updatedAt = new Date().toISOString();
    // คืนสต็อกสินค้าที่ตีกลับให้อัตโนมัติทีละรายการผ่าน API เดียวกับหน้าแก้สต็อก
    for (const item of o.items) {
      const p = cache.products.find((x) => x.id === item.productId);
      const v = p && p.variants.find((x) => x.id === item.variantId);
      if (v) await updateVariantStock(item.productId, item.variantId, v.stock + item.qty);
    }
  }

  // ---------- Restocks (ใบสั่งซื้อเข้าสต็อก) ----------
  // สถานะ: 1 = รอของเข้า (รอตรวจรับ), 2 = ตรวจรับเข้าสต็อกแล้ว
  function getRestocks() { return cache.restocks; }
  function getRestock(id) { return cache.restocks.find((r) => r.id === id) || null; }

  async function createRestock({ items, note }) {
    const resp = await apiFetch('/api/restocks', { method: 'POST', body: JSON.stringify({ items, note }) });
    const restock = mapRestock(resp);
    cache.restocks.unshift(restock);
    return restock;
  }

  async function updateRestockReceivedQty(restockId, itemIndex, qty) {
    const r = cache.restocks.find((x) => x.id === restockId);
    if (!r || r.status !== 1) return;
    const item = r.items[itemIndex];
    if (!item) return;
    const qtyReceived = Math.max(0, parseInt(qty, 10) || 0);
    await apiFetch('/api/restocks', { method: 'PATCH', body: JSON.stringify({ id: restockId, itemId: item.id, qtyReceived }) });
    item.qtyReceived = qtyReceived;
  }

  async function confirmRestockReceive(restockId) {
    const r = cache.restocks.find((x) => x.id === restockId);
    if (!r || r.status !== 1) return;
    for (const it of r.items) {
      const p = cache.products.find((x) => x.id === it.productId);
      const v = p && p.variants.find((x) => x.id === it.variantId);
      if (v) await updateVariantStock(it.productId, it.variantId, v.stock + (Number(it.qtyReceived) || 0));
    }
    await apiFetch('/api/restocks', { method: 'PATCH', body: JSON.stringify({ id: restockId, confirmReceive: true }) });
    r.status = 2;
    r.receivedAt = new Date().toISOString();
  }

  function pendingRestockCount() { return cache.restocks.filter((r) => r.status === 1).length; }

  // ---------- Customers ----------
  function getCustomers() { return cache.customers; }
  function getCustomerByPhone(phone) { return cache.customers.find((c) => c.phone === phone) || null; }

  function getCustomerStats(phone) {
    const orders = cache.orders.filter((o) => o.customer.phone === phone);
    const totalSpent = orders.reduce((s, o) => s + o.total, 0);
    return { orders, totalSpent, orderCount: orders.length };
  }

  // ---------- Shipping (คำนวณล้วนๆ ไม่มีการเก็บข้อมูล ไม่แตะ) ----------
  const UNIT_WEIGHT_EYEWEAR_G = 100;
  const UNIT_WEIGHT_ACCESSORY_G = 500;
  const SHIPPING_TIERS = [
    { maxKg: 1, fee: 50 },
    { maxKg: 2, fee: 60 },
    { maxKg: 3, fee: 70 },
    { maxKg: 4, fee: 80 },
    { maxKg: 5, fee: 100 },
    { maxKg: 10, fee: 150 },
    { maxKg: 15, fee: 250 },
    { maxKg: 20, fee: 350 },
  ];
  const COD_MAX_KG = 2;
  const COD_FEE = 100;
  const SMALL_ORDER_MIN_QTY = 12;
  const SMALL_ORDER_FEE = 50;

  function calcSmallOrderFee(cartItems) {
    const qty = (cartItems || []).reduce((s, it) => s + it.qty, 0);
    return qty > 0 && qty < SMALL_ORDER_MIN_QTY ? SMALL_ORDER_FEE : 0;
  }

  function unitWeightForProduct(productId) {
    const p = getProduct(productId);
    return (p && p.category === 'accessories') ? UNIT_WEIGHT_ACCESSORY_G : UNIT_WEIGHT_EYEWEAR_G;
  }

  function calcCartWeightGrams(cartItems) {
    return (cartItems || []).reduce((sum, it) => sum + it.qty * unitWeightForProduct(it.productId), 0);
  }

  function calcShippingFee(cartItems) {
    const kg = calcCartWeightGrams(cartItems) / 1000;
    for (const tier of SHIPPING_TIERS) {
      if (kg <= tier.maxKg) return tier.fee;
    }
    return null;
  }

  function isCodAvailable(cartItems) { return calcCartWeightGrams(cartItems) / 1000 <= COD_MAX_KG; }

  // ---------- Config ----------
  function getConfig() { return cache.config; }

  async function setConfig(patch) {
    await apiFetch('/api/config', { method: 'POST', body: JSON.stringify(patch) });
    const merged = Object.assign({}, cache.config);
    if (patch.promptpayId != null) merged.promptpayId = patch.promptpayId;
    if (patch.lowStockThreshold != null) merged.lowStockThreshold = patch.lowStockThreshold;
    if (patch.shopPhone != null) merged.shopPhone = patch.shopPhone;
    if (patch.shopAddress != null) merged.shopAddress = patch.shopAddress;
    cache.config = merged;
  }

  async function verifyAdminPassword(password) {
    const resp = await apiFetch('/api/config', { method: 'POST', body: JSON.stringify({ verifyPassword: password }) });
    return !!resp.ok;
  }

  async function verifyPreorderCode(code) {
    const resp = await apiFetch('/api/config', { method: 'POST', body: JSON.stringify({ verifyPreorderCode: code }) });
    return !!resp.ok;
  }

  // ให้แอดมินดูรหัส Pre-order ปัจจุบันได้ ต้องยืนยันตัวด้วยรหัสผ่านแอดมินก่อนทุกครั้ง (กันคนอื่นแอบดู)
  async function revealPreorderCode(adminPassword) {
    return apiFetch('/api/config', { method: 'POST', body: JSON.stringify({ revealPreorderCode: adminPassword }) });
  }

  // ---------- Dashboard helpers ----------
  function monthSales() {
    const now = new Date();
    const orders = cache.orders.filter((o) => {
      const d = new Date(o.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    return orders.reduce((s, o) => s + o.total, 0);
  }
  function pendingOrderCount() {
    return cache.orders.filter((o) => o.status < 4).length;
  }
  function bestSellers(limit) {
    const counts = {};
    cache.orders.forEach((o) => {
      o.items.forEach((it) => {
        const key = it.productId + '|' + it.name;
        counts[key] = counts[key] || { name: it.name, code: it.code, qty: 0 };
        counts[key].qty += it.qty;
      });
    });
    return Object.values(counts).sort((a, b) => b.qty - a.qty).slice(0, limit || 5);
  }
  function lowStockVariants(threshold) {
    const th = threshold != null ? threshold : cache.config.lowStockThreshold;
    const out = [];
    cache.products.forEach((p) => {
      p.variants.forEach((v) => {
        if (v.stock <= th) out.push({ product: p, variant: v });
      });
    });
    return out;
  }

  // ---------- Promotions (คูปองส่งฟรี) ----------
  function getPromotions() { return cache.promotions; }
  function getPromotion(id) { return cache.promotions.find((p) => p.id === id) || null; }
  function getPromotionByCode(code) {
    const norm = String(code || '').trim().toUpperCase();
    return cache.promotions.find((p) => p.code.toUpperCase() === norm) || null;
  }

  function upsertCachedPromotion(mapped) {
    const idx = cache.promotions.findIndex((p) => p.id === mapped.id);
    if (idx >= 0) cache.promotions[idx] = mapped; else cache.promotions.unshift(mapped);
  }

  async function createPromotion({ code, maxUses, type, discountAmount }) {
    const resp = await apiFetch('/api/promotions', { method: 'POST', body: JSON.stringify({ code, maxUses, type, discountAmount }) });
    const promo = mapPromotion(resp);
    cache.promotions.unshift(promo);
    return promo;
  }

  async function setPromotionActive(id, active) {
    await apiFetch('/api/promotions', { method: 'PATCH', body: JSON.stringify({ id, active: !!active }) });
    const p = cache.promotions.find((x) => x.id === id);
    if (p) p.active = !!active;
  }

  async function deletePromotion(id) {
    await apiFetch('/api/promotions?id=' + encodeURIComponent(id), { method: 'DELETE' });
    cache.promotions = cache.promotions.filter((p) => p.id !== id);
  }

  async function applyPromotion(code) {
    const resp = await apiFetch('/api/promotions', { method: 'PATCH', body: JSON.stringify({ code, action: 'apply' }) });
    if (resp.ok && resp.promotion) {
      const mapped = mapPromotion(resp.promotion);
      upsertCachedPromotion(mapped);
      return { ok: true, promotion: mapped };
    }
    return resp;
  }

  async function redeemPromotion(code) {
    const resp = await apiFetch('/api/promotions', { method: 'PATCH', body: JSON.stringify({ code, action: 'redeem' }) });
    if (resp.ok && resp.promotion) upsertCachedPromotion(mapPromotion(resp.promotion));
  }

  // ---------- Reviews ----------
  function getReviews() { return cache.reviews; }

  function getStoreRatingSummary() {
    const reviews = cache.reviews;
    if (!reviews.length) return { count: 0, average: 0 };
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    return { count: reviews.length, average: Math.round((sum / reviews.length) * 10) / 10 };
  }

  function getReviewableOrdersForPhone(phone) {
    return cache.orders.filter((o) => o.customer.phone === phone && o.status === 4 && !cache.reviews.some((r) => r.orderId === o.id));
  }

  async function submitReview({ orderId, phone, customerName, rating, comment }) {
    const resp = await apiFetch('/api/reviews', { method: 'POST', body: JSON.stringify({ orderId, phone, customerName, rating, comment }) });
    const review = mapReview(resp);
    cache.reviews.unshift(review);
    return review;
  }

  async function deleteReview(id) {
    await apiFetch('/api/reviews?id=' + encodeURIComponent(id), { method: 'DELETE' });
    cache.reviews = cache.reviews.filter((r) => r.id !== id);
  }

  async function updateReview(id, { rating, comment }) {
    const resp = await apiFetch('/api/reviews', { method: 'PATCH', body: JSON.stringify({ id, rating, comment }) });
    const review = mapReview(resp);
    const idx = cache.reviews.findIndex((r) => r.id === id);
    if (idx >= 0) cache.reviews[idx] = review;
    return review;
  }

  global.DB = {
    init,
    placeholderImage,
    getProducts, getProduct, getProductByCode, saveProduct, deleteProduct,
    generateNextCode, updateVariantStock, isNew, renameBrand,
    STATUS, COURIERS, getOrders, getOrder, createOrder, updateOrderStatus, nextStatus, setTrackingAndShip, getOrdersForPhone, markCodDelivered, markCodReturned,
    getRestocks, getRestock, createRestock, updateRestockReceivedQty, confirmRestockReceive, pendingRestockCount,
    getCustomers, getCustomerByPhone, getCustomerStats,
    getConfig, setConfig, verifyAdminPassword, verifyPreorderCode, revealPreorderCode,
    monthSales, pendingOrderCount, bestSellers, lowStockVariants,
    calcCartWeightGrams, calcShippingFee, isCodAvailable, unitWeightForProduct, UNIT_WEIGHT_EYEWEAR_G, UNIT_WEIGHT_ACCESSORY_G, COD_MAX_KG, COD_FEE,
    calcSmallOrderFee, SMALL_ORDER_MIN_QTY, SMALL_ORDER_FEE,
    getPromotions, getPromotion, getPromotionByCode, createPromotion, setPromotionActive, deletePromotion, applyPromotion, redeemPromotion,
    getReviews, getStoreRatingSummary, getReviewableOrdersForPhone, submitReview, deleteReview, updateReview,
  };
})(window);
