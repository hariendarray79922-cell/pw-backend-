const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================================
// SUPABASE CLIENT
// ============================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================================
// PW API HELPER
// ============================================================
const PW_BASE = 'https://api.penpencil.co';
const HEADERS = {
  'authorization': `Bearer ${process.env.PW_TOKEN}`,
  'client-id': process.env.CLIENT_ID,
  'client-type': 'WEB',
  'client-version': '1.0.0',
  'content-type': 'application/json'
};

async function pwFetch(path) {
  try {
    const res = await fetch(`${PW_BASE}${path}`, { headers: HEADERS });
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    console.error('PW Fetch error:', e.message);
    return null;
  }
}

// ============================================================
// SYNC DAILY STATS
// ============================================================
async function syncDailyStats() {
  console.log('🔄 Syncing daily stats...', new Date().toISOString());
  const today = new Date().toISOString().slice(0, 10);
  
  const streak = await pwFetch('/engagement/streak/info');
  const xp = await pwFetch(`/engagement/learn-to-earn/weekly-user-xp/${process.env.COHORT_ID}?startDate=2026-05-17T18:30:00.000Z&endDate=2026-06-01T18:29:59.000Z`);
  const level = await pwFetch(`/engagement/learn-to-earn/level-status/${process.env.COHORT_ID}?startDate=2026-05-17T18:30:00.000Z&endDate=2026-06-01T18:29:59.000Z`);
  const rank = await pwFetch(`/engagement/learn-to-earn/leaderboard/${process.env.COHORT_ID}?startDate=2026-05-17T18:30:00.000Z&endDate=2026-06-01T18:29:59.000Z`);
  
  const streakCount = streak?.data?.streakCount || 0;
  const todayWatch = streak?.data?.todaysWatchTime || 0;
  const currentXP = xp?.data?.currentXP || 0;
  const levelName = level?.data?.currentLevel?.name || 'Level 8';
  const userRank = rank?.data?.studentData?.rank || 0;
  
  const { error } = await supabase
    .from('user_daily_learning')
    .upsert({
      user_id: process.env.USER_ID,
      record_date: today,
      streak: streakCount,
      xp: currentXP,
      rank_position: userRank,
      level_name: levelName,
      watch_time_minutes: todayWatch
    }, { onConflict: 'user_id,record_date' });
  
  if (error) console.error('Sync error:', error.message);
  else console.log('✅ Daily stats saved');
  
  // Leaderboard snapshot
  if (rank?.data?.leaderboard) {
    const leaderboard = rank.data.leaderboard.map((u, idx) => ({
      rank_position: u.rank || idx + 1,
      user_name: u.name,
      xp: u.xp,
      streak: u.streakCount || 0,
      level_name: u.levelName || '?',
      watch_time_minutes: u.watchTime || 0,
      snapshot_date: today
    }));
    await supabase.from('xp_leaderboard').delete().eq('snapshot_date', today);
    if (leaderboard.length) {
      const { error: lbErr } = await supabase.from('xp_leaderboard').insert(leaderboard);
      if (lbErr) console.error('Leaderboard error:', lbErr.message);
      else console.log('✅ Leaderboard saved');
    }
  }
}

// ============================================================
// API ENDPOINTS
// ============================================================
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'PW Backend Running' });
});

app.get('/api/profile', async (req, res) => {
  const user = await pwFetch('/v3/users?landingPage=true');
  const batch = await pwFetch(`/v3/batches/${process.env.BATCH_ID}/details`);
  if (!user || !batch) return res.status(500).json({ error: 'PW fetch failed' });
  res.json({
    name: (user.data?.firstName + ' ' + user.data?.lastName).trim(),
    email: user.data?.email,
    phone: user.data?.username,
    batch_name: batch.data?.name
  });
});

app.get('/api/stats/today/:userId', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('user_daily_learning')
    .select('*')
    .eq('user_id', req.params.userId)
    .eq('record_date', today)
    .single();
  if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
  res.json(data || {});
});

app.get('/api/leaderboard', async (req, res) => {
  const { data, error } = await supabase
    .from('xp_leaderboard')
    .select('*')
    .order('rank_position', { ascending: true })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/schedule/today', async (req, res) => {
  const data = await pwFetch(`/v2/batches/${process.env.BATCH_ID}/todays-schedule?batchId=${process.env.BATCH_ID}`);
  res.json(data?.data || []);
});

app.get('/api/tests', async (req, res) => {
  const data = await pwFetch(`/v3/test-service/tests?testType=All&testStatus=All&attemptStatus=All&batchId=${process.env.BATCH_ID}&isSubjective=false`);
  res.json(data?.data || []);
});

app.get('/api/notifications', async (req, res) => {
  const unread = await pwFetch(`/v1/batches/${process.env.BATCH_ID}/announcement/unread/count`);
  const list = await pwFetch(`/v1/batches/${process.env.BATCH_ID}/announcement/v2?page=1&limit=15`);
  res.json({ unread: unread?.data?.unreadCount || 0, list: list?.data || [] });
});

app.get('/api/books', async (req, res) => {
  const data = await pwFetch(`/engagement/digital-books/v1/batches/${process.env.BATCH_ID}/books?page=1&limit=20`);
  res.json(data?.data?.books || []);
});

app.get('/api/health', async (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/api/sync', async (req, res) => {
  await syncDailyStats();
  res.json({ success: true });
});

// ============================================================
// CRON JOB (Daily at 1 AM IST)
// ============================================================
cron.schedule('0 1 * * *', () => {
  console.log('⏰ Running scheduled sync...');
  syncDailyStats();
}, { timezone: 'Asia/Kolkata' });

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`📅 Cron job set for 1 AM IST daily`);
});
