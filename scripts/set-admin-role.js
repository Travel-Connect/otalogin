#!/usr/bin/env node

/**
 * ユーザーにadmin権限を付与するスクリプト
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
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_URL || !ACCESS_TOKEN) {
  console.error('❌ 環境変数が設定されていません');
  process.exit(1);
}

const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

// コマンドライン引数からユーザーIDを取得
const userId = process.argv[2] || 'c5221674-d59b-4761-8350-23bab7f0c183'; // デフォルトはテストユーザー

function executeSql(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });

    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body });
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
  console.log(`🔧 ユーザーにadmin権限を付与中...\n`);
  console.log(`   User ID: ${userId}\n`);

  const sql = `
    INSERT INTO user_roles (user_id, role)
    VALUES ('${userId}', 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin', updated_at = NOW();
  `;

  try {
    await executeSql(sql);
    console.log('✅ admin権限を付与しました！');
  } catch (error) {
    console.error('❌ エラー:', error.message);
    process.exit(1);
  }
}

main();
