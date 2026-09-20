import * as esbuild from 'esbuild';
import { copyFileSync, rmSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// 默认生产构建（压缩）；`node tools/build-vuetify.mjs dev` 生成未压缩版本，
// 便于调试时阅读 Vuetify 内部堆栈。
const useDev = process.argv[2] === 'dev';

await esbuild.build({
  entryPoints: ['tools/vuetify-entry.js'],
  bundle: true,
  format: 'esm',
  outfile: 'cheat-engine/www/cheat/libs/vuetify.js',
  platform: 'browser',
  target: 'es2020',
  minify: !useDev,
  // 浏览器 / NW.js 里没有 process，构建时直接替换掉 Vuetify 的 env 引用
  define: {
    'process.env.NODE_ENV': useDev ? '"development"' : '"production"',
    'process.env.VITE_LOGGER_ENABLED': 'false',
  },
  plugins: [
    {
      name: 'vue-external',
      setup(build) {
        build.onResolve({ filter: /^vue$/ }, () => ({
          path: './vue.js',
          external: true,
        }));
      },
    },
  ],
});

console.log(`Vuetify 4 ESM bundle built (${useDev ? 'dev' : 'prod'}).`);

// Remove CSS emitted alongside JS (components import their own styles; full CSS comes from vendor:assets)
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const libsCss = resolve(root, 'cheat-engine/www/cheat/libs/vuetify.css');
if (existsSync(libsCss)) {
  rmSync(libsCss);
}
