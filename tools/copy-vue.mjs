import { copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// 默认使用生产构建（仍包含运行时模板编译器）：去掉 prop 校验 / dev 警告，
// 面板挂载速度约快 30%~40%。
// 排查问题时可执行 `pnpm run vendor:vue:dev` 换成开发构建，
// 以获得组件告警与 Vue Devtools 支持。
const useDev = process.argv[2] === 'dev';
const file = useDev ? 'vue.esm-browser.js' : 'vue.esm-browser.prod.js';
const src = resolve(projectRoot, 'node_modules/vue/dist', file);
const dest = resolve(projectRoot, 'cheat-engine/www/cheat/libs/vue.js');

copyFileSync(src, dest);
console.log(`Copied ${file} -> ${dest}`);
