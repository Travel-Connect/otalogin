#!/usr/bin/env node

/**
 * テストユーザー作成スクリプト
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 環境変数を.env.localから読み込み
const envPath = path.join(__dirname, '..', 'apps', 'web', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ 環境変数が設定されていません');
  console.error('   NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を確認してください');
  process.exit(1);
}

const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

// テストユーザー情報
const TEST_USER = {
  email: 'test@example.com',
  password: 'Test1234!',
  email_confirm: true,
  user_metadata: {
    name: 'テストユーザー'
  }
};

function createUser(userData) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(userData);
    const url = new URL(SUPABASE_URL);

    const options = {
      hostname: url.hostname,
      path: '/auth/v1/admin/users',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🔧 テストユーザーを作成中...\n');
  console.log(`📧 Email: ${TEST_USER.email}`);
  console.log(`🔑 Password: ${TEST_USER.password}\n`);

  try {
    const user = await createUser(TEST_USER);
    console.log('✅ テストユーザーが作成されました！');
    console.log(`   User ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Created: ${user.created_at}`);
  } catch (error) {
    if (error.message.includes('already been registered')) {
      console.log('ℹ️  テストユーザーは既に存在します');
      console.log(`   Email: ${TEST_USER.email}`);
      console.log(`   Password: ${TEST_USER.password}`);
    } else {
      console.error('❌ エラー:', error.message);
      process.exit(1);
    }
  }
}

main();
