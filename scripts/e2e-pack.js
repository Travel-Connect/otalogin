#!/usr/bin/env node

/**
 * E2E成果物パッキングスクリプト
 *
 * e2e:mock の成果物のみを zip 化して e2e-artifacts.zip を生成
 * ChatGPT レビュー用に使用可能
 *
 * 注意: e2e:real の成果物は含めない（機密混入リスク）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WEB_DIR = path.join(__dirname, '..', 'apps', 'web');
const OUTPUT_DIR = path.join(__dirname, '..');
const ARTIFACTS_DIR = path.join(WEB_DIR, 'e2e-artifacts');
const ZIP_FILE = path.join(OUTPUT_DIR, 'e2e-artifacts.zip');

// 収集するディレクトリ
const SOURCES = [
  { src: path.join(WEB_DIR, 'playwright-report'), dest: 'playwright-report' },
  { src: path.join(WEB_DIR, 'test-results'), dest: 'test-results' },
];

function main() {
  console.log('📦 E2E成果物をパッキング中...\n');

  // クリーンアップ
  if (fs.existsSync(ARTIFACTS_DIR)) {
    fs.rmSync(ARTIFACTS_DIR, { recursive: true });
  }
  if (fs.existsSync(ZIP_FILE)) {
    fs.rmSync(ZIP_FILE);
  }

  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

  // 成果物をコピー
  let hasArtifacts = false;

  for (const { src, dest } of SOURCES) {
    if (fs.existsSync(src)) {
      const destPath = path.join(ARTIFACTS_DIR, dest);
      copyDir(src, destPath);
      console.log(`✅ ${dest} をコピーしました`);
      hasArtifacts = true;
    } else {
      console.log(`⚠️  ${dest} が見つかりません（スキップ）`);
    }
  }

  if (!hasArtifacts) {
    console.log('\n❌ 成果物が見つかりません。先に pnpm e2e:mock を実行してください。');
    process.exit(1);
  }

  // サマリーを生成
  const summary = generateSummary();
  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'e2e-summary.json'),
    JSON.stringify(summary, null, 2)
  );
  console.log('✅ e2e-summary.json を生成しました');

  // ZIP化
  try {
    // Windows用のzip
    if (process.platform === 'win32') {
      execSync(
        `powershell -Command "Compress-Archive -Path '${ARTIFACTS_DIR}\\*' -DestinationPath '${ZIP_FILE}' -Force"`,
        { stdio: 'inherit' }
      );
    } else {
      execSync(`cd "${ARTIFACTS_DIR}" && zip -r "${ZIP_FILE}" .`, {
        stdio: 'inherit',
      });
    }
    console.log(`\n✅ ${ZIP_FILE} を生成しました`);
  } catch (error) {
    console.error('❌ ZIP作成に失敗しました:', error.message);
    process.exit(1);
  }

  // クリーンアップ
  fs.rmSync(ARTIFACTS_DIR, { recursive: true });

  console.log('\n📋 次のステップ:');
  console.log('   1. e2e-artifacts.zip を ChatGPT にアップロード');
  console.log('   2. テスト結果のレビューを依頼');
  console.log('\n⚠️  注意: e2e:real の成果物は含まれていません（機密保護）');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function generateSummary() {
  const resultsFile = path.join(WEB_DIR, 'test-results', 'results.json');

  let testResults = { suites: [], stats: {} };
  if (fs.existsSync(resultsFile)) {
    try {
      testResults = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    } catch {
      // ignore
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    type: 'mock',
    description: 'E2E Mock テスト成果物（ChatGPTレビュー用）',
    warning: 'この成果物には機密情報は含まれていません',
    totalTests: testResults.stats?.expected || 0,
    passed: testResults.stats?.expected || 0,
    failed: testResults.stats?.unexpected || 0,
    skipped: testResults.stats?.skipped || 0,
    duration: testResults.stats?.duration || 0,
  };

  return summary;
}

main();
