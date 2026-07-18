/*
 * db.js — mock database layer (localStorage)
 * ออกแบบ schema ให้ใกล้เคียงตารางจริง เพื่อให้ย้ายไป Supabase/Postgres ในอนาคตได้ง่าย:
 *   products(id, code, name, brand, category, price, frame_width, lens_width, lens_height, created_at)
 *   product_variants(id, product_id, color, stock, images[])
 *   orders(id, order_no, status, total, customer_phone, created_at, updated_at)
 *   order_items(order_id, product_id, variant_id, code, name, color, qty, price, image)
 *   customers(phone, name, line_id, address, subdistrict, district, province, zipcode, created_at)
 */
(function (global) {
  const KEYS = {
    products: 'ew_products',
    orders: 'ew_orders',
    customers: 'ew_customers',
    restocks: 'ew_restocks',
    seq: 'ew_seq',
    config: 'ew_config',
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('DB read error', key, e);
      return fallback;
    }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function nextSeq(name) {
    const seq = read(KEYS.seq, {});
    seq[name] = (seq[name] || 0) + 1;
    write(KEYS.seq, seq);
    return seq[name];
  }

  // ---------- placeholder image generator (SVG data URI) ----------
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

  // ---------- seed ----------
  function daysAgoISO(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  function seedIfEmpty() {
    const existing = read(KEYS.products, null);
    if (existing && existing.length) return;

    const seedDefs = [
      { name: 'Aviator Classic', brand: 'RayVue', category: 'sunglasses', price: 1290, fw: 140, lw: 58, lh: 52, age: 1,
        colors: ['ทอง', 'เงิน', 'ดำ'] },
      { name: 'Round Retro', brand: 'RayVue', category: 'sunglasses', price: 990, fw: 138, lw: 50, lh: 48, age: 5,
        colors: ['น้ำตาลเข้ม', 'ดำ'] },
      { name: 'Sport Wrap', brand: 'ZoomOptic', category: 'sunglasses', price: 1590, fw: 145, lw: 60, lh: 45, age: 8,
        colors: ['ดำด้าน', 'เขียวมะกอก'] },
      { name: 'Cat Eye Chic', brand: 'Luna', category: 'sunglasses', price: 1190, fw: 136, lw: 54, lh: 50, age: 2,
        colors: ['กุหลาบทอง', 'ดำ', 'เบจ'] },
      { name: 'Polarized Pro', brand: 'ZoomOptic', category: 'sunglasses', price: 1890, fw: 142, lw: 58, lh: 50, age: 20,
        colors: ['ดำ'] },
      { name: 'Classic Rim', brand: 'OptiWell', category: 'frames', price: 890, fw: 132, lw: 52, lh: 40, age: 1,
        colors: ['ดำ', 'กระ', 'เงิน'] },
      { name: 'Slim Titanium', brand: 'OptiWell', category: 'frames', price: 1490, fw: 134, lw: 50, lh: 38, age: 3,
        colors: ['เงิน', 'ทอง'] },
      { name: 'Round Vintage', brand: 'Luna', category: 'frames', price: 990, fw: 130, lw: 46, lh: 44, age: 10,
        colors: ['น้ำตาล', 'ดำ'] },
      { name: 'Clear Acetate', brand: 'OptiWell', category: 'frames', price: 790, fw: 136, lw: 52, lh: 40, age: 15,
        colors: ['ใส', 'เบจ'] },
      { name: 'Browline Bold', brand: 'RayVue', category: 'frames', price: 1090, fw: 138, lw: 54, lh: 42, age: 25,
        colors: ['ดำ', 'น้ำตาลเข้ม'] },
      { name: 'Kids Explorer', brand: 'LittleSpecs', category: 'kids', price: 690, fw: 118, lw: 44, lh: 36, age: 1,
        colors: ['ฟ้า', 'ชมพู', 'เหลือง'] },
      { name: 'Kids Flexible Bear', brand: 'LittleSpecs', category: 'kids', price: 790, fw: 116, lw: 42, lh: 34, age: 6,
        colors: ['ส้ม', 'เขียว'] },
      { name: 'ผ้าเช็ดแว่นไมโครไฟเบอร์', brand: 'CareLens', category: 'accessories', price: 59, fw: null, lw: null, lh: null, age: 0,
        colors: ['เทา', 'ฟ้า', 'ชมพู'] },
      { name: 'ซองแว่นตากำมะหยี่', brand: 'CareLens', category: 'accessories', price: 129, fw: null, lw: null, lh: null, age: 4,
        colors: ['ดำ', 'น้ำตาล'] },
      { name: 'กล่องแว่นตาแข็งพกพา', brand: 'CareLens', category: 'accessories', price: 179, fw: null, lw: null, lh: null, age: 12,
        colors: ['ดำ', 'ขาว'] },
      { name: 'สเปรย์ทำความสะอาดเลนส์', brand: 'CareLens', category: 'accessories', price: 89, fw: null, lw: null, lh: null, age: 30,
        colors: ['ใส'] },
    ];

    const products = seedDefs.map((def, idx) => {
      const code = 'C' + (idx + 1);
      const variants = def.colors.map((color, ci) => ({
        id: uid('v'),
        color,
        stock: (idx + ci) % 7 === 0 ? 0 : (ci === 0 ? 2 : 8 + ci),
        images: [placeholderImage(def.name, color, def.category)],
      }));
      return {
        id: uid('p'),
        code,
        name: def.name,
        brand: def.brand,
        category: def.category,
        price: def.price,
        frameWidth: def.fw,
        lensWidth: def.lw,
        lensHeight: def.lh,
        createdAt: daysAgoISO(def.age),
        variants,
      };
    });

    write(KEYS.products, products);
    write(KEYS.seq, { product: products.length });
    write(KEYS.orders, []);
    write(KEYS.customers, []);
    write(KEYS.restocks, []);
    if (!read(KEYS.config, null)) {
      write(KEYS.config, { promptpayId: '0000000000', lowStockThreshold: 2, adminPassword: 'admin1234' });
    }
  }

  // ---------- Products ----------
  function getProducts() { return read(KEYS.products, []); }
  function getProduct(id) { return getProducts().find(p => p.id === id) || null; }
  function getProductByCode(code) { return getProducts().find(p => p.code.toLowerCase() === String(code).toLowerCase()) || null; }

  function saveProduct(product) {
    const all = getProducts();
    if (product.id) {
      const idx = all.findIndex(p => p.id === product.id);
      if (idx >= 0) { all[idx] = product; write(KEYS.products, all); return product; }
    }
    product.id = uid('p');
    if (!product.code) product.code = 'C' + nextSeq('product');
    if (!product.createdAt) product.createdAt = new Date().toISOString();
    all.unshift(product);
    write(KEYS.products, all);
    return product;
  }

  function deleteProduct(id) {
    write(KEYS.products, getProducts().filter(p => p.id !== id));
  }

  function generateNextCode() {
    const all = getProducts();
    let max = 0;
    all.forEach(p => {
      const m = /^C(\d+)$/i.exec(p.code || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'C' + (max + 1);
  }

  function updateVariantStock(productId, variantId, newStock) {
    const all = getProducts();
    const p = all.find(x => x.id === productId);
    if (!p) return;
    const v = p.variants.find(x => x.id === variantId);
    if (!v) return;
    v.stock = Math.max(0, parseInt(newStock, 10) || 0);
    write(KEYS.products, all);
  }

  function isNew(product) {
    const created = new Date(product.createdAt).getTime();
    const diffDays = (Date.now() - created) / 86400000;
    return diffDays <= 3;
  }

  // ---------- Orders ----------
  const STATUS = {
    1: 'รอตรวจสลิป',
    2: 'รอยืนยันเบอร์โทร',
    3: 'แพ็คแล้ว',
    4: 'จัดส่งแล้ว',
  };

  function getOrders() { return read(KEYS.orders, []); }
  function getOrder(id) { return getOrders().find(o => o.id === id) || null; }

  function createOrder({ items, total, customer }) {
    const orders = getOrders();
    const orderNo = 'OD' + Date.now().toString().slice(-8) + String(orders.length + 1).padStart(3, '0');
    const order = {
      id: uid('o'),
      orderNo,
      items,
      total,
      customer,
      status: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    orders.unshift(order);
    write(KEYS.orders, orders);

    // ลดสต็อกทันทีที่สั่งซื้อ
    const products = getProducts();
    items.forEach(item => {
      const p = products.find(x => x.id === item.productId);
      if (!p) return;
      const v = p.variants.find(x => x.id === item.variantId);
      if (!v) return;
      v.stock = Math.max(0, v.stock - item.qty);
    });
    write(KEYS.products, products);

    upsertCustomerFromOrder(order);
    return order;
  }

  function updateOrderStatus(id, status) {
    const orders = getOrders();
    const o = orders.find(x => x.id === id);
    if (!o) return;
    o.status = status;
    o.updatedAt = new Date().toISOString();
    write(KEYS.orders, orders);
  }

  function nextStatus(status) { return Math.min(4, status + 1); }

  // ---------- Restocks (ใบสั่งซื้อเข้าสต็อก) ----------
  // สถานะ: 1 = รอของเข้า (รอตรวจรับ), 2 = ตรวจรับเข้าสต็อกแล้ว
  function getRestocks() { return read(KEYS.restocks, []); }
  function getRestock(id) { return getRestocks().find(r => r.id === id) || null; }

  function createRestock({ items, note }) {
    const restocks = getRestocks();
    const poNo = 'PO' + Date.now().toString().slice(-8) + String(restocks.length + 1).padStart(3, '0');
    const restock = {
      id: uid('r'),
      poNo,
      note: note || '',
      items: items.map(it => ({ ...it, qtyReceived: it.qtyOrdered })),
      status: 1,
      createdAt: new Date().toISOString(),
      receivedAt: null,
    };
    restocks.unshift(restock);
    write(KEYS.restocks, restocks);
    return restock;
  }

  function updateRestockReceivedQty(restockId, itemIndex, qty) {
    const restocks = getRestocks();
    const r = restocks.find(x => x.id === restockId);
    if (!r || r.status !== 1) return;
    if (!r.items[itemIndex]) return;
    r.items[itemIndex].qtyReceived = Math.max(0, parseInt(qty, 10) || 0);
    write(KEYS.restocks, restocks);
  }

  function confirmRestockReceive(restockId) {
    const restocks = getRestocks();
    const r = restocks.find(x => x.id === restockId);
    if (!r || r.status !== 1) return;
    const products = getProducts();
    r.items.forEach(it => {
      const p = products.find(x => x.id === it.productId);
      if (!p) return;
      const v = p.variants.find(x => x.id === it.variantId);
      if (!v) return;
      v.stock += Number(it.qtyReceived) || 0;
    });
    write(KEYS.products, products);
    r.status = 2;
    r.receivedAt = new Date().toISOString();
    write(KEYS.restocks, restocks);
  }

  function pendingRestockCount() { return getRestocks().filter(r => r.status === 1).length; }

  // ---------- Customers (CRM, keyed by phone, ไม่มีระบบสมาชิก) ----------
  function getCustomers() { return read(KEYS.customers, []); }
  function getCustomerByPhone(phone) { return getCustomers().find(c => c.phone === phone) || null; }

  function upsertCustomerFromOrder(order) {
    const customers = getCustomers();
    const phone = order.customer.phone;
    let c = customers.find(x => x.phone === phone);
    if (!c) {
      c = {
        phone,
        name: order.customer.name,
        lineId: order.customer.lineId,
        address: order.customer.address,
        subdistrict: order.customer.subdistrict,
        district: order.customer.district,
        province: order.customer.province,
        zipcode: order.customer.zipcode,
        orderIds: [],
        createdAt: new Date().toISOString(),
      };
      customers.push(c);
    } else {
      // อัปเดตข้อมูลล่าสุดของลูกค้า
      c.name = order.customer.name;
      c.lineId = order.customer.lineId;
      c.address = order.customer.address;
      c.subdistrict = order.customer.subdistrict;
      c.district = order.customer.district;
      c.province = order.customer.province;
      c.zipcode = order.customer.zipcode;
    }
    c.orderIds.push(order.id);
    write(KEYS.customers, customers);
  }

  function getCustomerStats(phone) {
    const orders = getOrders().filter(o => o.customer.phone === phone);
    const totalSpent = orders.reduce((s, o) => s + o.total, 0);
    return { orders, totalSpent, orderCount: orders.length };
  }

  // ---------- Config ----------
  function getConfig() { return read(KEYS.config, { promptpayId: '0000000000', lowStockThreshold: 2, adminPassword: 'admin1234' }); }
  function setConfig(cfg) { write(KEYS.config, Object.assign(getConfig(), cfg)); }

  // ---------- Dashboard helpers ----------
  function monthSales() {
    const now = new Date();
    const orders = getOrders().filter(o => {
      const d = new Date(o.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    return orders.reduce((s, o) => s + o.total, 0);
  }
  function pendingOrderCount() {
    return getOrders().filter(o => o.status < 4).length;
  }
  function bestSellers(limit) {
    const counts = {};
    getOrders().forEach(o => {
      o.items.forEach(it => {
        const key = it.productId + '|' + it.name;
        counts[key] = counts[key] || { name: it.name, code: it.code, qty: 0 };
        counts[key].qty += it.qty;
      });
    });
    return Object.values(counts).sort((a, b) => b.qty - a.qty).slice(0, limit || 5);
  }
  function lowStockVariants(threshold) {
    const th = threshold != null ? threshold : getConfig().lowStockThreshold;
    const out = [];
    getProducts().forEach(p => {
      p.variants.forEach(v => {
        if (v.stock <= th) out.push({ product: p, variant: v });
      });
    });
    return out;
  }

  global.DB = {
    seedIfEmpty,
    placeholderImage,
    getProducts, getProduct, getProductByCode, saveProduct, deleteProduct,
    generateNextCode, updateVariantStock, isNew,
    STATUS, getOrders, getOrder, createOrder, updateOrderStatus, nextStatus,
    getRestocks, getRestock, createRestock, updateRestockReceivedQty, confirmRestockReceive, pendingRestockCount,
    getCustomers, getCustomerByPhone, getCustomerStats,
    getConfig, setConfig,
    monthSales, pendingOrderCount, bestSellers, lowStockVariants,
    uid,
  };
})(window);
