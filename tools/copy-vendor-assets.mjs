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

// Material Design Icons CSS
//
// 两件事：
//  1. 去掉 sourceMappingURL 注释 —— 对应的 .map 不会被打包，留着只会让
//     DevTools 打开时白发一次 404 请求。
//  2. 只保留源码里真正用到的图标规则。全量 MDI 有 7447 条 `.mdi-xxx::before`
//     规则 / 340KB，而这��面板一共只用 100 个左右。CSS 是无条件全量解析的，
//     这些多余规则会在游戏启动时白白付出解析和选择器匹配开销，并伴随整个
//     游戏会话（这张表是被 import.js 注入游戏 <head> 的）。
const mdiFile = useDev ? 'materialdesignicons.css' : 'materialdesignicons.min.css';
const mdiSrc = resolve(root, 'node_modules/@mdi/font/css', mdiFile);
const mdiDest = resolve(destCss, 'materialdesignicons.css');
let mdiCss = readFileSync(mdiSrc, 'utf8');

mdiCss = mdiCss.replace(/\/\*#\s*sourceMappingURL=[^*]*\*\/\s*$/, '');

// 收集用到的图标名。
//
// 必须连 `libs/vuetify.js` 一起扫：Vuetify 自己的默认图标别名
// （$close / $checkboxOn / $radioOn / $menu / $dropdown / $first / …）也是
// `mdi-*` class 形式，关闭按钮、下拉箭头、单选框这些都由它渲染。
// 只扫本项目的 panels/components 会漏掉这 55 个，图标直接变空白方块。
// Makefile 的 ui-vendor 顺序是 shiki → vue → vuetify → assets，所以到这一步
// vuetify.js 一定已经构建好了。
const cheatDirForScan = resolve(root, 'cheat-engine/www/cheat');
// 本脚本的产物 css/ 里没有任何源码图标，且 materialdesignicons.css 里
// 装的是上一次的子集结果 —— 扫它等于用自己的输出决定输出。这里直接排除。
const SCAN_SKIP_DIR = resolve(cheatDirForScan, 'css').toLowerCase();

function collectUsedMdiIcons(dir, used = new Set(), stats = { files: 0 }) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);

    if (full.toLowerCase() === SCAN_SKIP_DIR) continue;

    if (entry.isDirectory()) {
      collectUsedMdiIcons(full, used, stats);
      continue;
    }

    if (!['.js', '.mjs'].includes(extname(entry.name))) continue;

    const text = readFileSync(full, 'utf8');
    stats.files++;
    for (const m of text.matchAll(/mdi-[a-z0-9-]+/g)) {
      used.add(m[0]);
    }
  }

  return { used, files: stats.files };
}

const vuetifyBundle = resolve(cheatDirForScan, 'libs/vuetify.js');
if (!existsSync(vuetifyBundle)) {
  console.warn(
    'WARNING: libs/vuetify.js not found — Vuetify 的内置 mdi-* 图标不会被计入，' +
      'VCheckbox/VSelect/VDialog 等控件的图标可能变空白。先跑 vendor:vuetify。',
  );
}
const { used: usedMdi, files: mdiScannedFiles } = collectUsedMdiIcons(cheatDirForScan);

// 只匹配「单选择器 + 只有 content 声明」的图标规则；.mdi-18px / .mdi-dark /
// .mdi-rotate-90 / @keyframes 这类工具规则没有 content，全部保留。
// 捕获组必须带上 `mdi-` 前缀，才能和扫描出来的图标名（mdi-close）对上。
const MDI_ICON_RULE = /\.(mdi-[a-z0-9-]+)::before\s*\{\s*content:\s*"[^"]*"\s*;?\s*\}/g;

let mdiTotal = 0;
let mdiKept = 0;
{
  let out = '';
  let cursor = 0;

  for (const m of mdiCss.matchAll(MDI_ICON_RULE)) {
    out += mdiCss.slice(cursor, m.index);
    mdiTotal++;
    if (usedMdi.has(m[1])) {
      out += m[0];
      mdiKept++;
    }
    cursor = m.index + m[0].length;
  }

  out += mdiCss.slice(cursor);
  mdiCss = out;
}

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

const mdiPct = ((1 - mdiKept / mdiTotal) * 100).toFixed(1);
console.log(
  `Copied ${mdiFile} (woff2 only, kept ${mdiKept}/${mdiTotal} icons, dropped ${mdiPct}%, ` +
    `${usedMdi.size} referenced in ${mdiScannedFiles} files, ${mode}) -> ${mdiDest}`,
);

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
