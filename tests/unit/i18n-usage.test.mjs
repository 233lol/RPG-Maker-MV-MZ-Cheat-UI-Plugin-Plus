import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import zhCN from "../../cheat-engine/www/cheat/js/locales/zh-CN.js";
import en from "../../cheat-engine/www/cheat/js/locales/en.js";
import ja from "../../cheat-engine/www/cheat/js/locales/ja.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const cheatRoot = path.join(repoRoot, "cheat-engine", "www", "cheat");

function collectFiles(dir) {
  const files = [];

  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);

    if (statSync(full).isDirectory()) {
      if (name === "libs" || name === "locales") continue;
      files.push(...collectFiles(full));
    } else if (name.endsWith(".js")) {
      files.push(full);
    }
  }

  return files;
}

function collectKeys(value, prefix = "", result = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const pathText = prefix ? `${prefix}.${key}` : key;

    if (child && typeof child === "object" && !Array.isArray(child)) {
      collectKeys(child, pathText, result);
    } else {
      result.set(pathText, child);
    }
  }

  return result;
}

function readKey(keys, key) {
  // 支持直接命中，或命中复数条目的子形式
  if (keys.has(key)) {
    return true;
  }

  return ["one", "two", "few", "many", "other", "zero"].some((form) =>
    keys.has(`${key}.${form}`),
  );
}

test('源码里用到的 t("...") key 都存在于三种语言文案里', () => {
  const zhKeys = collectKeys(zhCN);
  const enKeys = collectKeys(en);
  const jaKeys = collectKeys(ja);
  const used = new Map();

  for (const file of collectFiles(cheatRoot)) {
    const source = readFileSync(file, "utf8");
    const regex = /\bt\(\s*["']([\w.]+)["']/g;
    let match;

    while ((match = regex.exec(source)) !== null) {
      const key = match[1];
      const list = used.get(key) || [];
      list.push(path.relative(repoRoot, file));
      used.set(key, list);
    }
  }

  assert.ok(used.size > 100, `扫描到的 key 太少: ${used.size}`);

  for (const [key, files] of used) {
    const where = `${key}（${[...new Set(files)].join(", ")}）`;

    assert.equal(readKey(zhKeys, key), true, `中文缺少 ${where}`);
    assert.equal(readKey(enKeys, key), true, `英文缺少 ${where}`);
    assert.equal(readKey(jaKeys, key), true, `日文缺少 ${where}`);
  }
});

const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;

test("面板模板里不再写死中日韩文案", () => {
  const offenders = [];

  for (const file of collectFiles(cheatRoot)) {
    const source = readFileSync(file, "utf8");
    const regex = /template:\s*`([\s\S]*?)`,\s*\n/g;
    let match;

    while ((match = regex.exec(source)) !== null) {
      // 去掉模板里的 HTML 注释，只检查真正会渲染的文本
      const template = match[1].replace(/<!--[\s\S]*?-->/g, "");
      const lines = template.split(/\r?\n/);

      for (const line of lines) {
        const text = line.trim();

        if (!CJK.test(text)) continue;

        offenders.push(
          `${path.relative(repoRoot, file)}: ${text.slice(0, 80)}`,
        );
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("面向用户的提示（Alert / ConfirmDialog / prompt）不再写死中文", () => {
  const offenders = [];

  for (const file of collectFiles(cheatRoot)) {
    const source = readFileSync(file, "utf8");

    source.split(/\r?\n/).forEach((line, index) => {
      if (!CJK.test(line)) return;
      if (line.includes("console.")) return;
      if (!/Alert\.|ConfirmDialog\.|window\.prompt|\.prompt\(/.test(line))
        return;

      offenders.push(
        `${path.relative(repoRoot, file)}:${index + 1}: ${line.trim()}`,
      );
    });
  }

  assert.deepEqual(offenders, []);
});
