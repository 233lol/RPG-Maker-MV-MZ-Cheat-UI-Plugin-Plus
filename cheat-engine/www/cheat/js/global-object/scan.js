/**
 * 扫描 window 全局变量、按路径读取、递归搜索。
 */

import { RPG_GLOBAL_NAMES, BUILTIN_GLOBAL_NAMES } from "./names.js";
import {
  getValueKind,
  isContainerKind,
  isEditableKind,
  isHiddenKind,
  getKindText,
  getKindIcon,
  formatValuePreview,
} from "./format.js";
import {
  MAX_ENUMERATED_KEYS,
  getChildValue,
  getContainerKeys,
  isTraversableContainer,
} from "./edit.js";

const UNSAFE_TRAVERSAL_NAMES = new Set([
  "window",
  "self",
  "top",
  "parent",
  "frames",
  "globalThis",
  "global",
  "document",
  "location",
  "navigator",
  "history",
  "screen",
  "performance",
  "crypto",
  "caches",
  "indexedDB",
  "localStorage",
  "sessionStorage",
  "console",
  "customElements",
  "visualViewport",
  "speechSynthesis",
  "external",
  "frameElement",
  "clientInformation",
  "applicationCache",
  "styleMedia",
  "trustedTypes",
  "launchQueue",
  "scheduler",
  "cookieStore",
  "navigation",
  "chrome",
  "webkitStorageInfo",
  "nw",
  "process",
  "require",
  "module",
  "exports",
  "Buffer",
]);

const SEARCH_DEFAULT_OPTIONS = {
  maxDepth: 4,
  maxResults: 300,
  maxNodes: 30000,
  maxKeysPerNode: MAX_ENUMERATED_KEYS,
  maxTimeMs: 2000,
};

// RPG Maker 内置全局变量的命名规则（$dataXxx / $gameXxx / $plugins 等）
const RPG_GLOBAL_NAME_PATTERN = /^\$(data|game|plugins)/;

// 浏览器内置全局变量名（静态兜底 + 空白 iframe 动态检测）
let builtinGlobalNameCache = null;

// 测试 / 预热重新探测时使用；正常运行期间缓存会一直保留。
export function invalidateBuiltinGlobalNamesCache() {
  builtinGlobalNameCache = null;
}

export function getBuiltinGlobalNames() {
  if (builtinGlobalNameCache) {
    return builtinGlobalNameCache;
  }

  const names = new Set(BUILTIN_GLOBAL_NAMES);

  // 空白 iframe 里只有浏览器 / NW.js 内置变量，
  // 用它做差集可以准确识别游戏与第三方插件自定义的全局变量
  let iframe = null;

  try {
    iframe = document.createElement("iframe");
    iframe.style.cssText = "display: none; width: 0; height: 0; border: 0;";
    (document.body || document.documentElement).appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    if (frameWindow) {
      Object.getOwnPropertyNames(frameWindow).forEach((name) => {
        names.add(name);
      });
    }
  } catch (error) {
    // 无法创建 iframe 时仅使用静态列表
  } finally {
    // 枚举 contentWindow 抛错时也要移除，避免留下一个隐藏 iframe。
    if (iframe) {
      try {
        iframe.remove();
      } catch (error) {
        // 已被外部移除 / 环境不支持 remove 时忽略
      }
    }
  }

  builtinGlobalNameCache = names;
  return names;
}

function isPluginGlobalCandidate(name, value, builtinNames) {
  if (builtinNames.has(name)) {
    return false;
  }

  const kind = getValueKind(value);

  // 只收集对象 / 数组：函数（方法）不作为全局变量显示与处理
  return isContainerKind(kind) && !isHiddenKind(kind);
}

// 扫描 window，分离出「RPG Maker 全局变量」与「第三方插件 / 自定义全局变量」
export function scanRootGlobals(root = window) {
  const builtinNames = getBuiltinGlobalNames();
  const rpgNames = [];
  const pluginNames = [];
  const seen = new Set();

  const push = (list, name) => {
    if (!name || seen.has(name)) {
      return;
    }

    seen.add(name);
    list.push(name);
  };

  RPG_GLOBAL_NAMES.forEach((name) => {
    try {
      if (name in root) {
        push(rpgNames, name);
      }
    } catch (error) {
      // 忽略无法访问的属性
    }
  });

  let ownNames;
  try {
    ownNames = Object.getOwnPropertyNames(root);
  } catch (error) {
    ownNames = [];
  }

  const extraRpgNames = [];
  const otherPluginNames = [];

  ownNames.forEach((name) => {
    // 先按名字过滤再读值：window 上的浏览器 / NW.js 内置属性大多是原生
    // getter，逐个触发既没有意义也不便宜。
    if (builtinNames.has(name)) {
      return;
    }

    if (name.startsWith("$")) {
      // $dataXxx / $gameXxx / $plugins 归入游戏内置，其余 $Xxx 视为插件全局变量
      if (RPG_GLOBAL_NAME_PATTERN.test(name)) {
        extraRpgNames.push(name);
      } else {
        otherPluginNames.push(name);
      }
      return;
    }

    let value;
    try {
      value = root[name];
    } catch (error) {
      return;
    }

    if (isPluginGlobalCandidate(name, value, builtinNames)) {
      otherPluginNames.push(name);
    }
  });

  const compare = (a, b) => a.localeCompare(b);
  extraRpgNames.sort(compare);
  otherPluginNames.sort(compare);

  extraRpgNames.forEach((name) => push(rpgNames, name));
  otherPluginNames.forEach((name) => push(pluginNames, name));

  return { rpg: rpgNames, plugin: pluginNames };
}

// scanRootGlobals 的模块级缓存：重复打开面板（关掉再开、或 keep-alive
// 未命中）时不必重新遍历 window。TTL 内直接复用，reloadAll 会强制失效。
const ROOT_SCAN_CACHE_TTL = 5000;
let rootScanCache = null;

export function scanRootGlobalsCached(root = window) {
  const now = Date.now();

  if (rootScanCache && now - rootScanCache.time < ROOT_SCAN_CACHE_TTL) {
    return rootScanCache.result;
  }

  const result = scanRootGlobals(root);
  rootScanCache = { result, time: now };
  return result;
}

export function invalidateRootScanCache() {
  rootScanCache = null;
}

// 预热：把「创建隐藏 iframe 检测内置全局名」挪到空闲时段执行，
// 避免第一次扫描全局变量时才创建 iframe 卡一下。
export function prewarmGlobalObjectHelper() {
  if (builtinGlobalNameCache) {
    return;
  }

  const run = () => {
    try {
      getBuiltinGlobalNames();
    } catch (error) {
      // 预热失败不影响后续扫描（真正扫描时会再走一次兜底逻辑）
    }
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 5000 });
  } else {
    window.setTimeout(run, 2000);
  }
}

export const ROOT_FILTERS = {
  all: "all",
  rpg: "rpg",
  plugin: "plugin",
};

// 按顶层筛选条件取出要显示的全局变量名
export function getRootNamesByFilter(scanResult, filter) {
  const rpg = (scanResult && scanResult.rpg) || [];
  const plugin = (scanResult && scanResult.plugin) || [];

  if (filter === ROOT_FILTERS.rpg) {
    return rpg.slice();
  }

  if (filter === ROOT_FILTERS.plugin) {
    return plugin.slice();
  }

  return rpg.concat(plugin);
}

// 根据路径取出对象（path 为空时返回 root 本身）
export function resolvePathValue(root, path) {
  let value = root;

  for (const key of path) {
    const child = getChildValue(value, key);
    if (!child.ok) {
      return { ok: false, message: child.message };
    }

    value = child.value;
  }

  return { ok: true, value };
}

// 路径的可读文本，例如 $gameParty._actors[0]._name
export function formatPathText(path, rootLabel = "window") {
  if (!path || path.length === 0) {
    return rootLabel;
  }

  let text = "";

  path.forEach((key, index) => {
    const name = String(key);
    if (/^\d+$/.test(name)) {
      text += `[${name}]`;
      return;
    }

    text += index === 0 ? name : `.${name}`;
  });

  return text;
}
// 递归搜索：返回名称或值匹配的属性路径
export function searchGlobalTree(root, keyword, options = {}) {
  const keywordText = String(keyword || "")
    .trim()
    .toLowerCase();

  if (!keywordText) {
    return { results: [], truncated: false, reason: null };
  }

  const settings = Object.assign({}, SEARCH_DEFAULT_OPTIONS, options);
  const basePath = Array.isArray(options.basePath) ? options.basePath : [];
  const results = [];
  const visited = new WeakSet();
  const queue = [{ value: root, depth: 0, path: basePath }];
  const deadline =
    settings.maxTimeMs > 0 ? Date.now() + settings.maxTimeMs : Infinity;
  let queueIndex = 0;
  let nodeCount = 0;
  let reason = null;

  const reachLimit = () => {
    if (results.length >= settings.maxResults) {
      reason = "results";
      return true;
    }

    if (nodeCount >= settings.maxNodes) {
      reason = "nodes";
      return true;
    }

    if (Date.now() >= deadline) {
      reason = "time";
      return true;
    }

    return false;
  };

  while (queueIndex < queue.length) {
    if (reachLimit()) {
      break;
    }

    const node = queue[queueIndex++];
    const container = node.value;

    if (!isContainerKind(getValueKind(container))) {
      continue;
    }

    if (visited.has(container)) {
      continue;
    }

    visited.add(container);

    const remainingBudget = Math.max(1, settings.maxNodes - nodeCount);
    const keyLimit = Math.min(settings.maxKeysPerNode, remainingBudget);

    for (const key of getContainerKeys(container, keyLimit)) {
      if (reachLimit()) {
        break;
      }

      nodeCount++;

      const name = String(key);

      if (UNSAFE_TRAVERSAL_NAMES.has(name)) {
        continue;
      }

      const child = getChildValue(container, key);
      if (!child.ok) {
        continue;
      }

      const value = child.value;
      const kind = getValueKind(value);

      if (isHiddenKind(kind)) {
        continue;
      }

      const preview = formatValuePreview(value, kind);
      const childPath = [...node.path, key];
      const matched =
        name.toLowerCase().includes(keywordText) ||
        (isEditableKind(kind) && preview.toLowerCase().includes(keywordText));

      if (matched) {
        results.push({
          key,
          name,
          kind,
          typeText: getKindText(kind),
          icon: getKindIcon(kind),
          preview,
          path: childPath,
          pathText: formatPathText(childPath),
          isContainer: isContainerKind(kind),
        });
      }

      if (
        node.depth < settings.maxDepth &&
        isContainerKind(kind) &&
        isTraversableContainer(value)
      ) {
        queue.push({ value, depth: node.depth + 1, path: childPath });
      }
    }
  }

  return { results, truncated: reason !== null, reason };
}

// 深度搜索的默认上限（供 UI 显示 / 手动调整）
export const SEARCH_LIMITS = {
  maxDepth: SEARCH_DEFAULT_OPTIONS.maxDepth,
  maxResults: SEARCH_DEFAULT_OPTIONS.maxResults,
  maxNodes: SEARCH_DEFAULT_OPTIONS.maxNodes,
  maxKeysPerNode: SEARCH_DEFAULT_OPTIONS.maxKeysPerNode,
  maxTimeMs: SEARCH_DEFAULT_OPTIONS.maxTimeMs,
};

// 这里是翻译 key，由面板在展示时解析（见 GlobalVariablePanel）
export const SEARCH_LIMIT_REASONS = {
  results: "globalVariable.limitMaxResults",
  nodes: "globalVariable.limitMaxNodes",
  time: "globalVariable.limitMaxTime",
};
