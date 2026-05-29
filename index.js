const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// SUPABASE
// ============================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================================
// PW API (FIXED)
// ============================================================
const PW_BASE = 'https://api.penpencil.co';
const PW_TOKEN = process.env.PW_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// Token check karne ke liye
console.log('✅ Backend Started');
console.log('🔑 PW_TOKEN exists:', !!PW_TOKEN);
console.log('📦 CLIENT_ID:', CLIENT_ID);

async function fetchPW(endpoint) {
  const url = `${PW_BASE}${endpoint}`;
  console.log(`📡 Fetching: ${url}`);
  
  try {
    const res = await fetch(url, {
      headers: {
        'authorization': `Bearer ${PW_TOKEN}`,
        'client-id': CLIENT_ID,
        'client-type': 'WEB',
        'content-type': 'application/json'
      }
    });
    
    console.log(`📊 Status: ${res.status}`);
    
    if (!res.ok) {
      console.log(`❌ Error ${res.status}`);
      return null;
    }
    
    const data = await res.json();
    console.log(`✅ Success`);
    return data;
  } catch(e) {
    console.log(`❌ Fetch error: ${e.message}`);
    return null;
  }
}

// ============================================================
// API ENDPOINTS
// ============================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Profile
app.get('/api/profile', async (req, res) => {
  console.log('🔍 GET /api/profile');
  
  // Try to get from Supabase first
  const { data: existing } = await supabase
    .from('profile')
    .select('*')
    .eq('user_id', process.env.USER_ID)
    .single();
  
  if (existing) {
    console.log('✅ From Supabase');
    return res.json(existing);
  }
  
  // Fetch from PW
  const user = await fetchPW('/v3/users?landingPage=true');
  const batch = await fetchPW(`/v3/batches/${process.env.BATCH_ID}/details`);
  
  if (!user || !batch) {
    console.log('❌ PW fetch failed');
    return res.status(500).json({ error: 'PW fetch failed' });
  }
  
  const profile = {
    user_id: process.env.USER_ID,
    name: (user.data?.firstName + ' ' + user.data?.lastName).trim(),
    email: user.data?.email,
    phone: user.data?.username,
    batch_id: process.env.BATCH_ID,
    batch_name: batch.data?.name
  };
  
  // Save to Supabase
  await supabase.from('profile').upsert(profile, { onConflict: 'user_id' });
  
  res.json(profile);
});

// Today Stats
app.get('/api/stats/today/:userId', async (req, res) => {
  console.log(`🔍 GET /api/stats/today/${req.params.userId}`);
  
  const streak = await fetchPW('/engagement/streak/info');
  const xp = await fetchPW(`/engagement/learn-to-earn/weekly-user-xp/${process.env.COHORT_ID}?startDate=2026-05-17T18:30:00.000Z&endDate=2026-06-01T18:29:59.000Z`);
  const rank = await fetchPW(`/engagement/learn-to-earn/leaderboard/${process.env.COHORT_ID}?startDate=2026-05-17T18:30:00.000Z&endDate=2026-06-01T18:29:59.000Z`);
  
  const stats = {
    user_id: req.params.userId,
    record_date: new Date().toISOString().slice(0,10),
    streak: streak?.data?.streakCount || 0,
    xp: xp?.data?.currentXP || 0,
    rank_position: rank?.data?.studentData?.rank || 0,
    watch_time_minutes: streak?.data?.todaysWatchTime || 0
  };
  
  // Save to Supabase
  await supabase.from('user_daily_learning').upsert(stats, { onConflict: 'user_id,record_date' });
  
  res.json(stats);
});

// Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  console.log('🔍 GET /api/leaderboard');
  
  const rank = await fetchPW(`/engagement/learn-to-earn/leaderboard/${process.env.COHORT_ID}?startDate=2026-05-17T18:30:00.000Z&endDate=2026-06-01T18:29:59.000Z`);
  
  if (!rank?.data?.leaderboard) {
    return res.json([]);
  }
  
  const leaderboard = rank.data.leaderboard.map(u => ({
    rank_position: u.rank,
    user_name: u.name,
    xp: u.xp,
    snapshot_date: new Date().toISOString().slice(0,10)
  }));
  
  res.json(leaderboard);
});

// Today Schedule
app.get('/api/schedule/today', async (req, res) => {
  console.log('🔍 GET /api/schedule/today');
  
  const data = await fetchPW(`/v2/batches/${process.env.BATCH_ID}/todays-schedule?batchId=${process.env.BATCH_ID}`);
  res.json(data?.data || []);
});

// Tests
app.get('/api/tests', async (req, res) => {
  console.log('🔍 GET /api/tests');
  
  const data = await fetchPW(`/v3/test-service/tests?testType=All&testStatus=All&attemptStatus=All&batchId=${process.env.BATCH_ID}&isSubjective=false`);
  res.json(data?.data || []);
});

// Notifications
app.get('/api/notifications', async (req, res) => {
  console.log('🔍 GET /api/notifications');
  
  const unread = await fetchPW(`/v1/batches/${process.env.BATCH_ID}/announcement/unread/count`);
  const list = await fetchPW(`/v1/batches/${process.env.BATCH_ID}/announcement/v2?page=1&limit=10`);
  
  res.json({
    unread: unread?.data?.unreadCount || 0,
    list: list?.data || []
  });
});

// Books
app.get('/api/books', async (req, res) => {
  console.log('🔍 GET /api/books');
  
  const data = await fetchPW(`/engagement/digital-books/v1/batches/${process.env.BATCH_ID}/books?page=1&limit=20`);
  res.json(data?.data?.books || []);
});

// Manual Sync
app.post('/api/sync', async (req, res) => {
  console.log('🔄 POST /api/sync');
  
  // Fetch and save today stats
  const statsRes = await fetch(`https://pw-backend-5h8p.onrender.com/api/stats/today/${process.env.USER_ID}`);
  const stats = await statsRes.json();
  
  res.json({ success: true, stats });
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 https://pw-backend-5h8p.onrender.com`);
});
