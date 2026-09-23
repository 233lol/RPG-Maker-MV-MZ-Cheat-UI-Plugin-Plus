import { copyFileSync, readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const destCss = resolve(root, 'cheat-engine/www/cheat/css');
const destFonts = resolve(root, 'cheat-engine/www/cheat/fonts');

// 与 vue / shiki / vuetify 一致：默认拷生产（压缩）版 CSS，
// `pnpm run vendor:assets:dev` / `make dev` 切换为可读的开发版。
// 未压缩的 vuetify.css / materialdesignicons.css 比 min 版大 30% / 20%，
// 下载与 CSS 解析都是纯开销，生产包没必要带。
const useDev = process.argv[2] === 'dev';
const mode = useDev ? 'dev' : 'prod';

// Vuetify CSS
const vuetifyFile = useDev ? 'vuetify.css' : 'vuetify.min.css';
const vuetifySrc = resolve(root, 'node_modules/vuetify/dist', vuetifyFile);
const vuetifyDest = resolve(destCss, 'vuetify.css');
copyFileSync(vuetifySrc, vuetifyDest);
console.log(`Copied ${vuetifyFile} (${mode}) -> ${vuetifyDest}`);

// Material Design Icons CSS（压缩版同样做下面的 woff2 过滤）
const mdiFile = useDev ? 'materialdesignicons.css' : 'materialdesignicons.min.css';
const mdiSrc = resolve(root, 'node_modules/@mdi/font/css', mdiFile);
const mdiDest = resolve(destCss, 'materialdesignicons.css');
let mdiCss = readFileSync(mdiSrc, 'utf8');

// 去掉 sourceMappingURL 注释：对应的 .map 文件不会被打包，
// 留着只会让 DevTools 打开时白发一次 404 请求
mdiCss = mdiCss.replace(/\/\*#\s*sourceMappingURL=[^*]*\*\/\s*$/, '');

// Strip non-woff2 font formats, keep only woff2
mdiCss = mdiCss.replace(
  /@font-face\s*\{[\s\S]*?\}/,
  (match) => {
    const woff2 = match.match(/url\([^)]*?\.woff2[^)]*\)\s*format\s*\([^)]*\)/);
    const family = match.match(/font-family\s*:\s*([^;]+);/);
    const fam = family ? family[1].trim() : '"Material Design Icons"';
    const url = woff2 ? woff2[0] : 'url("../fonts/materialdesignicons-webfont.woff2") format("woff2")';
    return '@font-face {\n  font-family: ' + fam + ';\n  src: ' + url + ';\n  font-weight: normal;\n  font-style: normal;\n}';
  }
);
writeFileSync(mdiDest, mdiCss);
console.log(`Copied ${mdiFile} (woff2 only, ${mode}) -> ${mdiDest}`);

// Material Design Icons Fonts (woff2 only)
const mdiFontsSrc = resolve(root, 'node_modules/@mdi/font/fonts');
if (existsSync(mdiFontsSrc)) {
  if (!existsSync(destFonts)) mkdirSync(destFonts, { recursive: true });
  // Remove old non-woff2 mdi font files
  for (const file of readdirSync(destFonts)) {
    if (file.startsWith('materialdesignicons-webfont.') && extname(file) !== '.woff2') {
      rmSync(resolve(destFonts, file), { force: true });
    }
  }
  // Copy woff2 only
  for (const file of readdirSync(mdiFontsSrc)) {
    if (extname(file) === '.woff2') {
      copyFileSync(resolve(mdiFontsSrc, file), resolve(destFonts, file));
    }
  }
  console.log(`Copied .woff2 from @mdi/font/fonts -> ${destFonts}`);
}
