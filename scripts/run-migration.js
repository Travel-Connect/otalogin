#!/usr/bin/env node

/**
 * Supabase マイグレーション実行スクリプト
 *
 * 使用方法:
 *   node scripts/run-migration.js
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
  console.error('   NEXT_PUBLIC_SUPABASE_URL と SUPABASE_ACCESS_TOKEN を確認してください');
  process.exit(1);
}

// プロジェクトIDをURLから抽出
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectRef) {
  console.error('❌ プロジェクトIDを取得できません');
  process.exit(1);
}

console.log(`📦 プロジェクト: ${projectRef}\n`);

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

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`📄 ${files.length}個のマイグレーションファイルを検出\n`);

  for (const file of files) {
    console.log(`▶️  実行中: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    try {
      const result = await executeSql(sql);
      console.log(`✅ 完了: ${file}\n`);
    } catch (error) {
      console.error(`❌ エラー: ${file}`);
      console.error(`   ${error.message}\n`);
      process.exit(1);
    }
  }

  console.log('🎉 全てのマイグレーションが完了しました！');
}

runMigrations().catch(err => {
  console.error('エラー:', err.message);
  process.exit(1);
});
