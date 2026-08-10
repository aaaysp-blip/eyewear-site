-- schema.sql
-- สร้างตารางทั้งหมดที่ api/*.js ต้องใช้ (products, product_variants, orders,
-- order_items, customers, store_config) ให้ตรงกับชื่อคอลัมน์ที่โค้ดเรียกจริง
--
-- วิธีรัน: เปิด Supabase Dashboard -> โปรเจกต์ของคุณ -> SQL Editor -> New query
-- วางไฟล์นี้ทั้งหมด แล้วกด Run (รันครั้งเดียวพอ, ใช้ IF NOT EXISTS กันรันซ้ำพัง)

create extension if not exists pgcrypto;

-- ---------- products ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  brand text,
  category text,
  price numeric not null default 0,
  frame_width numeric,
  lens_width numeric,
  lens_height numeric,
  bridge_width numeric,
  temple_length numeric,
  acc_width numeric,
  acc_length numeric,
  material text,
  images jsonb not null default '[]'::jsonb,
  images_original jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- เผื่อรันซ้ำกับฐานที่สร้างจาก schema.sql เวอร์ชันก่อนหน้า (ยังไม่มีคอลัมน์เหล่านี้)
alter table products add column if not exists bridge_width numeric;
alter table products add column if not exists temple_length numeric;
alter table products add column if not exists acc_width numeric;
alter table products add column if not exists acc_length numeric;
alter table products add column if not exists material text;
alter table products add column if not exists images jsonb not null default '[]'::jsonb;
alter table products add column if not exists images_original jsonb not null default '[]'::jsonb;

-- ---------- product_variants ----------
create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  color text not null,
  stock integer not null default 0,
  images jsonb not null default '[]'::jsonb
);

create index if not exists idx_product_variants_product_id on product_variants(product_id);

-- ---------- customers (keyed by phone, ไม่มีระบบสมาชิก) ----------
create table if not exists customers (
  phone text primary key,
  name text,
  line_id text,
  address text,
  subdistrict text,
  district text,
  province text,
  zipcode text,
  created_at timestamptz not null default now()
);

-- ---------- orders ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique not null,
  status integer not null default 1,
  total numeric not null default 0,
  customer_phone text references customers(phone),
  tracking_no text,
  courier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_customer_phone on orders(customer_phone);

-- ฟิลด์เพิ่มเติมที่หน้ารายละเอียดออเดอร์ในแอดมินต้องใช้ (สรุปยอด/ช่องทางชำระ/COD)
alter table orders add column if not exists subtotal numeric;
alter table orders add column if not exists shipping_fee numeric;
alter table orders add column if not exists small_order_fee numeric;
alter table orders add column if not exists cod_fee numeric;
alter table orders add column if not exists discount_amount numeric;
alter table orders add column if not exists payment_method text;
alter table orders add column if not exists promo_code text;
alter table orders add column if not exists payment_slip text;
alter table orders add column if not exists cod_delivery_status text;

-- ---------- order_items ----------
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid,
  variant_id uuid,
  code text,
  name text,
  color text,
  qty integer not null default 1,
  price numeric not null default 0,
  image text
);

create index if not exists idx_order_items_order_id on order_items(order_id);

-- ---------- store_config (แถวเดียว id = 1) ----------
create table if not exists store_config (
  id integer primary key,
  promptpay_id text not null default '0000000000',
  low_stock_threshold integer not null default 2,
  admin_password text not null default 'admin1234'
);

alter table store_config add column if not exists shop_phone text;
alter table store_config add column if not exists shop_address text;

insert into store_config (id, promptpay_id, low_stock_threshold, admin_password)
values (1, '0000000000', 2, 'admin1234')
on conflict (id) do nothing;

-- ---------- restocks / restock_items (ใบสั่งซื้อเข้าสต็อก) ----------
-- ตารางนี้มีอยู่ในโปรเจกต์อยู่แล้วก่อนหน้านี้ (สร้างจากที่อื่น) — ใช้ if not exists เพื่อไม่ชนกัน
-- แล้วเติมคอลัมน์ snapshot (code/name/color/current_stock) ที่ยังไม่มีให้ครบ
create table if not exists restocks (
  id uuid primary key default gen_random_uuid(),
  po_no text unique not null,
  note text,
  status integer not null default 1,
  created_at timestamptz not null default now(),
  received_at timestamptz
);

create table if not exists restock_items (
  id uuid primary key default gen_random_uuid(),
  restock_id uuid not null references restocks(id) on delete cascade,
  product_id uuid,
  variant_id uuid,
  qty_ordered integer not null default 0,
  qty_received integer not null default 0
);

alter table restock_items add column if not exists code text;
alter table restock_items add column if not exists name text;
alter table restock_items add column if not exists color text;
alter table restock_items add column if not exists current_stock integer;

create index if not exists idx_restock_items_restock_id on restock_items(restock_id);

-- ---------- promotions (คูปองส่งฟรี/ส่วนลด) ----------
create table if not exists promotions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  max_uses integer not null default 1,
  type text not null default 'freeship',
  discount_amount numeric not null default 0,
  times_applied integer not null default 0,
  times_redeemed integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- reviews (รีวิวร้านค้า) ----------
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  phone text,
  customer_name text,
  rating integer not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- ---------- Row Level Security ----------
-- ปิดการเข้าถึงจาก anon/authenticated key ทั้งหมด (ไม่มี policy = ปฏิเสธหมด)
-- api/*.js ใช้ SUPABASE_SERVICE_ROLE_KEY ซึ่ง bypass RLS อยู่แล้ว จึงยังทำงานได้ปกติ
alter table products enable row level security;
alter table product_variants enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table store_config enable row level security;
alter table restocks enable row level security;
alter table restock_items enable row level security;
alter table promotions enable row level security;
alter table reviews enable row level security;

-- service_role ต้องมี grant ตรงๆ ด้วย (RLS bypass ไม่ได้แทนที่ grant พื้นฐานของ Postgres)
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
