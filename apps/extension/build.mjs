/**
 * Chrome Extension ビルドスクリプト
 *
 * Content Script は ES module として読み込まれないため import 文が使えない。
 * 複数エントリを同時ビルドすると Rollup が共有チャンクを生成して
 * import 文が出力されるため、各エントリを個別にビルドする。
 */
import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync, existsSync, rmSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

const sharedResolve = {
  alias: {
    '@otalogin/shared': resolve(__dirname, '../../packages/shared/src'),
  },
};

// dist をクリア
const distDir = resolve(__dirname, 'dist');
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

// 1. Background (ES module - service worker は type: module で読み込まれる)
await build({
  configFile: false,
  root: __dirname,
  resolve: sharedResolve,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/background/index.ts'),
      formats: ['es'],
      fileName: () => 'background.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    sourcemap: !isProduction,
    minify: isProduction,
  },
  logLevel: 'warn',
});

// 2. Content Script (IIFE - content_scripts は module ではない)
await build({
  configFile: false,
  root: __dirname,
  resolve: sharedResolve,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      fileName: () => 'content.js',
      name: 'OTALoginContent',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    sourcemap: !isProduction,
    minify: isProduction,
  },
  logLevel: 'warn',
});

// 3. Popup (IIFE)
await build({
  configFile: false,
  root: __dirname,
  resolve: sharedResolve,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/popup/index.ts'),
      formats: ['iife'],
      fileName: () => 'popup.js',
      name: 'OTALoginPopup',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    sourcemap: !isProduction,
    minify: isProduction,
  },
  logLevel: 'warn',
});

// 4. 静的ファイルをコピー
const publicDir = resolve(__dirname, 'public');
const filesToCopy = ['manifest.json', 'popup.html'];
for (const file of filesToCopy) {
  const src = resolve(publicDir, file);
  if (existsSync(src)) {
    copyFileSync(src, resolve(distDir, file));
  }
}

// icons ディレクトリをコピー
const iconsDir = resolve(publicDir, 'icons');
if (existsSync(iconsDir)) {
  const distIconsDir = resolve(distDir, 'icons');
  mkdirSync(distIconsDir, { recursive: true });
  for (const icon of ['icon16.png', 'icon48.png', 'icon128.png']) {
    const src = resolve(iconsDir, icon);
    if (existsSync(src)) {
      copyFileSync(src, resolve(distIconsDir, icon));
    }
  }
}

console.log('✓ Extension build complete');
