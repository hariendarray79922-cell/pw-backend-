const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config();

// Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// PW Config
const PW_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3ODA1NTkwMjguMzYsImRhdGEiOnsiX2lkIjoiNjU3MWRmYWM1NTNmOGIwMDE4MmYyNmRhIiwidXNlcm5hbWUiOiI3OTkyMjQ5NzYwIiwiZmlyc3ROYW1lIjoiSmF5c3dhbCIsImxhc3ROYW1lIjoiS3VtYXIiLCJvcmdhbml6YXRpb24iOnsiX2lkIjoiNWViMzkzZWU5NWZhYjc0NjhhNzlkMTg5Iiwid2Vic2l0ZSI6InBoeXNpY3N3YWxsYWguY29tIiwibmFtZSI6IlBoeXNpY3N3YWxsYWgifSwiZW1haWwiOiJhYmNkZWY3OTkyMkBnbWFpbC5jb20iLCJyb2xlcyI6WyI1YjI3YmQ5NjU4NDJmOTUwYTc3OGM2ZWYiLCI1Y2M5NWEyZThiZGU0ZDY2ZGU0MDBiMzciXSwiY291bnRyeUdyb3VwIjoiSU4iLCJ0eXBlIjoiVVNFUiJ9LCJqdGkiOiJQeDM3YXNmZFJweVJRUXJfZ0NEQTBnXzY1NzFkZmFjNTUzZjhiMDAxODJmMjZkYSIsImlhdCI6MTc3OTk1NDIyOH0.0KaEhq7jT6ChmGIPf2U6Mu8VSP7hFnbJBPk9WrmnShA";
const CLIENT_ID = "5eb393ee95fab7468a79d189";
const BATCH_ID = "6779346f920e596fe7f0e247";

async function fetchAndSaveProfile() {
  try {
    // 1. Decode JWT Token
    const payload = PW_TOKEN.split('.')[1];
    const userData = JSON.parse(Buffer.from(payload, 'base64').toString());
    const user = userData.data;

    const profile = {
      user_id: user._id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      mobile: user.username,
      batch_id: BATCH_ID,
      batch_name: "Lakshya NEET 2027",
      updated_at: new Date().toISOString()
    };

    console.log("📌 Profile Data:", profile);

    // 2. Save to Supabase (upsert)
    const { data, error } = await supabase
      .from('profiles')
      .upsert(profile, { onConflict: 'user_id' });

    if (error) {
      console.error("❌ Supabase Error:", error);
    } else {
      console.log("✅ Profile saved to Supabase!");
    }

    return profile;
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

// Run
fetchAndSaveProfile();
