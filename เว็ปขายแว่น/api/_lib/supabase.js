// api/_lib/supabase.js
// ใช้ service_role key เท่านั้น — ไฟล์นี้รันฝั่งเซิร์ฟเวอร์ (Vercel Function) เท่านั้น
// ห้าม import ไฟล์นี้จาก store.js / admin.js (ฝั่ง browser) เด็ดขาด

import { createClient } from '@supabase/supabase-js';

let client = null;

export function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return client;
}
