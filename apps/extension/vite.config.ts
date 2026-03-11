import { resolve } from 'path';
import { defineConfig } from 'vite';

/**
 * Chrome Extension ビルド設定
 *
 * 重要: Content Script は ES module として読み込まれないため、
 * import 文が含まれると SyntaxError になる。
 * そのため各エントリを個別にビルドし、コード分割を回避する。
 *
 * このファイルは build.mjs から参照される共通設定のみ定義。
 * 実際のビルドは build.mjs が行う。
 */
export const sharedConfig = {
  resolve: {
    alias: {
      '@otalogin/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
};

// vite build 直接実行時のフォールバック（dev watch用）
export default defineConfig({
  ...sharedConfig,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        popup: resolve(__dirname, 'src/popup/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
    sourcemap: process.env.NODE_ENV !== 'production',
    minify: process.env.NODE_ENV === 'production',
  },
});
