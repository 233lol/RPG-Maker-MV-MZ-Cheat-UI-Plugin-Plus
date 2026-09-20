/**
 * 全局变量（JS 全局对象树）辅助函数。
 *
 * 用于 GlobalVariablePanel：
 * - 扫描 window 上与游戏相关的全局变量（$gameXxx / $dataXxx / 各 Manager / 插件全局）
 * - 读取每个值的类型并生成预览文本
 * - 安全地读取 / 修改 / 新增 / 删除嵌套属性
 * - 递归搜索深层属性
 */

// RPG Maker 常见的全局变量（按显示顺序排列）
export const RPG_GLOBAL_NAMES = [
  // 数据库数据
  "$dataSystem",
  "$dataActors",
  "$dataClasses",
  "$dataSkills",
  "$dataItems",
  "$dataWeapons",
  "$dataArmors",
  "$dataEnemies",
  "$dataTroops",
  "$dataStates",
  "$dataAnimations",
  "$dataTilesets",
  "$dataCommonEvents",
  "$dataMapInfos",
  "$dataMap",
  // 运行时数据
  "$gameTemp",
  "$gameSystem",
  "$gameScreen",
  "$gameTimer",
  "$gameSwitches",
  "$gameVariables",
  "$gameSelfSwitches",
  "$gameActors",
  "$gameParty",
  "$gameTroop",
  "$gameMap",
  "$gamePlayer",
  "$gameMessage",
  // 管理器 / 单例
  "DataManager",
  "ConfigManager",
  "StorageManager",
  "ImageManager",
  "EffectManager",
  "AudioManager",
  "SoundManager",
  "TextManager",
  "ColorManager",
  "SceneManager",
  "BattleManager",
  "PluginManager",
  "FontManager",
  "ResourceHandler",
  "LanguageManager",
  "Graphics",
  "Input",
  "TouchInput",
  "Utils",
  "JsonEx",
  "Decrypter",
  "Video",
];

// 浏览器 / NW.js 内置的全局变量（默认不显示，避免污染列表）
export const BUILTIN_GLOBAL_NAMES = new Set([
  // 对象型内置全局
  "window",
  "self",
  "top",
  "parent",
  "frames",
  "document",
  "location",
  "navigator",
  "clientInformation",
  "screen",
  "history",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "crypto",
  "performance",
  "console",
  "customElements",
  "visualViewport",
  "speechSynthesis",
  "external",
  "frameElement",
  "menubar",
  "locationbar",
  "personalbar",
  "scrollbars",
  "toolbar",
  "applicationCache",
  "styleMedia",
  "trustedTypes",
  "launchQueue",
  "scheduler",
  "cookieStore",
  "navigation",
  "chrome",
  "webkitStorageInfo",
  "globalThis",
  // NW.js / Node 相关
  "nw",
  "process",
  "require",
  "module",
  "exports",
  "global",
  "Buffer",
  "__dirname",
  "__filename",
  // 基础变量与数值
  "undefined",
  "NaN",
  "Infinity",
  "name",
  "length",
  "status",
  "closed",
  "event",
  "origin",
  "isSecureContext",
  "crossOriginIsolated",
  "devicePixelRatio",
  "innerWidth",
  "innerHeight",
  "outerWidth",
  "outerHeight",
  "screenX",
  "screenY",
  "screenLeft",
  "screenTop",
  "scrollX",
  "scrollY",
  "pageXOffset",
  "pageYOffset",
  // 浏览器内置方法
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "alert",
  "atob",
  "blur",
  "btoa",
  "cancelAnimationFrame",
  "cancelIdleCallback",
  "clearImmediate",
  "clearInterval",
  "clearTimeout",
  "close",
  "confirm",
  "createImageBitmap",
  "fetch",
  "focus",
  "getComputedStyle",
  "getSelection",
  "matchMedia",
  "moveBy",
  "moveTo",
  "open",
  "postMessage",
  "print",
  "prompt",
  "queueMicrotask",
  "reportError",
  "requestAnimationFrame",
  "requestIdleCallback",
  "resizeBy",
  "resizeTo",
  "scroll",
  "scrollBy",
  "scrollTo",
  "setImmediate",
  "setInterval",
  "setTimeout",
  "stop",
  "structuredClone",
  // 语言内置对象
  "eval",
  "isFinite",
  "isNaN",
  "parseFloat",
  "parseInt",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "escape",
  "unescape",
  "Object",
  "Function",
  "Boolean",
  "Symbol",
  "Error",
  "AggregateError",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
  "Number",
  "BigInt",
  "Math",
  "Date",
  "String",
  "RegExp",
  "Array",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "ArrayBuffer",
  "SharedArrayBuffer",
  "Atomics",
  "DataView",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
  "JSON",
  "Promise",
  "Reflect",
  "Proxy",
  "Intl",
  "WebAssembly",
  "FinalizationRegistry",
  "WeakRef",
  "TextDecoder",
  "TextEncoder",
  "TextDecoderStream",
  "TextEncoderStream",
  "CompressionStream",
  "DecompressionStream",
  "DOMException",
  "AbortController",
  "AbortSignal",
  "EventTarget",
  "Event",
  "CustomEvent",
  "MessageEvent",
  "ErrorEvent",
  "PromiseRejectionEvent",
  "ProgressEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "TouchEvent",
  "WheelEvent",
  "DragEvent",
  "ClipboardEvent",
  "FocusEvent",
  "InputEvent",
  "CompositionEvent",
  "UIEvent",
  "StorageEvent",
  "SubmitEvent",
  "HashChangeEvent",
  "PopStateEvent",
  "PageTransitionEvent",
  "Node",
  "NodeList",
  "Element",
  "HTMLElement",
  "DOMParser",
  "XMLSerializer",
  "MutationObserver",
  "ResizeObserver",
  "IntersectionObserver",
  "PerformanceObserver",
  "XMLHttpRequest",
  "WebSocket",
  "Worker",
  "SharedWorker",
  "MessageChannel",
  "MessagePort",
  "BroadcastChannel",
  "Audio",
  "Image",
  "ImageData",
  "ImageBitmap",
  "Blob",
  "File",
  "FileList",
  "FileReader",
  "FormData",
  "Headers",
  "Request",
  "Response",
  "URL",
  "URLSearchParams",
  "Path2D",
  "OffscreenCanvas",
  "CanvasRenderingContext2D",
  "Notification",
  "CSS",
  "CustomElementRegistry",
  "GPU",
  "IdleDeadline",
  "Selection",
  "Range",
  "AudioContext",
  "MediaQueryList",
  "Storage",
  "Crypto",
  "Performance",
  "Navigator",
  "Screen",
  "History",
  "Location",
  "Document",
  "Window",
  "Generator",
  "GeneratorFunction",
  "AsyncFunction",
  "AsyncGenerator",
  "AsyncGeneratorFunction",
]);
// 值的类型文案与图标
const KIND_TEXTS = {
  number: "数字",
  string: "字符串",
  boolean: "布尔",
  null: "null",
  undefined: "undefined",
  bigint: "BigInt",
  symbol: "Symbol",
  function: "函数",
  array: "数组",
  object: "对象",
  date: "日期",
  regexp: "正则",
  map: "Map",
  set: "Set",
  dom: "DOM",
  error: "读取失败",
};

const KIND_ICONS = {
  number: "mdi-numeric",
  string: "mdi-format-text",
  boolean: "mdi-toggle-switch",
  null: "mdi-cancel",
  undefined: "mdi-help-circle-outline",
  bigint: "mdi-numeric",
  symbol: "mdi-alpha-s-circle-outline",
  function: "mdi-function-variant",
  array: "mdi-folder-multiple",
  object: "mdi-folder",
  date: "mdi-calendar-clock",
  regexp: "mdi-regex",
  map: "mdi-folder-star",
  set: "mdi-folder-star",
  dom: "mdi-xml",
  error: "mdi-alert-circle-outline",
};

// 可进入（点击进入下一层）的类型
const CONTAINER_KINDS = new Set(["object", "array"]);

// 可以直接在输入框里修改的类型
const EDITABLE_KINDS = new Set([
  "number",
  "string",
  "boolean",
  "null",
  "undefined",
  "bigint",
]);

// 不显示 / 不处理的类型（函数是方法，不作为变量处理）
const HIDDEN_KINDS = new Set(["function"]);

// 深度搜索时绝不进入的宿主对象：NW.js / Chromium 的内建对象带有原生
// getter，遍历它们可能直接导致渲染进程崩溃（表现为游戏窗口瞬间消失）。
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

// 预览文本的最大长度
const MAX_PREVIEW_LENGTH = 160;

// 单个容器最多枚举多少个键（避免对超大数组 / 对象调用 Object.keys 时撑爆内存）
const MAX_ENUMERATED_KEYS = 10000;

// 统计子项数量时的上限（仅用于预览文案）
const MAX_CHILD_COUNT = 10000;

// 深度搜索的默认限制（避免遍历整个对象图导致卡顿），可在面板里手动调整
const SEARCH_DEFAULT_OPTIONS = {
  maxDepth: 4,
  maxResults: 300,
  maxNodes: 30000,
  maxKeysPerNode: MAX_ENUMERATED_KEYS,
  maxTimeMs: 2000,
};

export function getValueKind(value) {
  if (value === null) {
    return "null";
  }

  const type = typeof value;

  if (type !== "object") {
    return type;
  }

  // 某些宿主对象（被 revoke 的 Proxy、跨域 WindowProxy 等）的 instanceof
  // 会抛出异常，这里统一兜底为 object，后续读取都会被保护。
  try {
    if (Array.isArray(value)) {
      return "array";
    }

    if (isDomNode(value)) {
      return "dom";
    }

    if (value instanceof Date) {
      return "date";
    }

    if (value instanceof RegExp) {
      return "regexp";
    }

    if (value instanceof Map) {
      return "map";
    }

    if (value instanceof Set) {
      return "set";
    }
  } catch (error) {
    return "object";
  }

  return "object";
}

export function isContainerKind(kind) {
  return CONTAINER_KINDS.has(kind);
}

export function isEditableKind(kind) {
  return EDITABLE_KINDS.has(kind);
}

export function isHiddenKind(kind) {
  return HIDDEN_KINDS.has(kind);
}

export function getKindText(kind) {
  return KIND_TEXTS[kind] || kind;
}

export function getKindIcon(kind) {
  return KIND_ICONS[kind] || "mdi-help";
}
function isDomNode(value) {
  if (typeof Node === "undefined") {
    return false;
  }

  try {
    return value instanceof Node;
  } catch (error) {
    return false;
  }
}

function truncate(text) {
  const str = String(text);
  if (str.length <= MAX_PREVIEW_LENGTH) {
    return str;
  }

  return `${str.slice(0, MAX_PREVIEW_LENGTH)}…`;
}

function countChildren(value) {
  try {
    if (Array.isArray(value)) {
      return value.length;
    }

    if (ArrayBuffer.isView(value) && typeof value.length === "number") {
      return value.length;
    }

    let count = 0;
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        continue;
      }

      count++;
      if (count >= MAX_CHILD_COUNT) {
        break;
      }
    }

    return count;
  } catch (error) {
    return 0;
  }
}

export function formatValuePreview(value, kind) {
  try {
    switch (kind) {
      case "null":
        return "null";
      case "undefined":
        return "undefined";
      case "string": {
        if (value.length > MAX_PREVIEW_LENGTH) {
          return `${JSON.stringify(value.slice(0, MAX_PREVIEW_LENGTH))}…`;
        }

        return truncate(JSON.stringify(value));
      }
      case "number":
      case "boolean":
      case "bigint":
        return String(value);
      case "symbol":
      case "function":
        return truncate(String(value));
      case "array":
        return `数组(${countChildren(value)} 项)`;
      case "object":
        return `对象(${countChildren(value)} 个属性)`;
      case "map":
      case "set":
        return `${kind}(${value.size} 项)`;
      case "date":
        return Number.isNaN(value.getTime())
          ? "Invalid Date"
          : value.toISOString();
      case "regexp":
        return String(value);
      case "dom":
        return truncate(`${value.nodeName || "DOM"}`);
      default:
        return truncate(String(value));
    }
  } catch (error) {
    return "（无法读取）";
  }
}

// 输入框里的文本（仅用于可编辑的类型）
export function formatValueText(value, kind) {
  switch (kind) {
    case "null":
      return "null";
    case "undefined":
      return "undefined";
    case "string":
      return value;
    case "bigint":
      return value.toString();
    default:
      return String(value);
  }
}
// 宽松解析：null / undefined / 布尔 / 数字 / 字符串
function parseLooseValue(text) {
  const trimmed = String(text).trim();

  if (trimmed === "") {
    return { ok: false, message: "值不能为空" };
  }

  if (trimmed === "null") {
    return { ok: true, value: null };
  }

  if (trimmed === "undefined") {
    return { ok: true, value: undefined };
  }

  if (trimmed === "true") {
    return { ok: true, value: true };
  }

  if (trimmed === "false") {
    return { ok: true, value: false };
  }

  const num = Number(trimmed);
  if (!Number.isNaN(num)) {
    return { ok: true, value: num };
  }

  return { ok: true, value: String(text) };
}

// 按当前类型解析输入框文本
export function parseValueByKind(text, kind) {
  switch (kind) {
    case "number": {
      const trimmed = String(text).trim();
      if (trimmed === "") {
        return { ok: false, message: "数字不能为空" };
      }

      const num = Number(trimmed);
      if (Number.isNaN(num)) {
        return { ok: false, message: `"${text}" 不是合法数字` };
      }

      return { ok: true, value: num };
    }
    case "string":
      return { ok: true, value: String(text) };
    case "boolean":
      return { ok: true, value: String(text).trim() === "true" };
    case "bigint":
      try {
        return { ok: true, value: BigInt(String(text).trim()) };
      } catch (error) {
        return { ok: false, message: `"${text}" 不是合法 BigInt` };
      }
    default:
      return parseLooseValue(text);
  }
}

export function getContainerKeys(container, limit = MAX_ENUMERATED_KEYS) {
  if (container === null || container === undefined) {
    return [];
  }

  const max =
    Number.isFinite(limit) && limit > 0
      ? Math.floor(limit)
      : MAX_ENUMERATED_KEYS;
  const keys = [];

  try {
    // 对超大数组直接按下标生成键，避免 Object.keys 为每个元素分配字符串而
    // 耗尽内存（游戏里的 $dataMap.data / tile 数组动辄上百万项）。
    if (Array.isArray(container)) {
      const length = container.length;

      if (length <= max) {
        return Object.keys(container);
      }

      for (let index = 0; index < max; index++) {
        keys.push(String(index));
      }

      return keys;
    }

    for (const key in container) {
      if (!Object.prototype.hasOwnProperty.call(container, key)) {
        continue;
      }

      keys.push(key);
      if (keys.length >= max) {
        break;
      }
    }
  } catch (error) {
    return keys;
  }

  return keys;
}

// 判断一个容器是否可以安全地递归进入：
// 原型链上出现「非 Object / Array 的原生构造函数」时（DOM、NW.js、原生扩展
// 对象等）返回 false，避免遍历它们的原生 getter 导致进程崩溃。
const NATIVE_FUNCTION_RE = /\{\s*\[native code\]\s*\}/;
const SAFE_ROOT_CTORS = new Set([Object, Array]);
const protoNativeCache = new WeakMap();

export function isTraversableContainer(value) {
  try {
    let proto = Object.getPrototypeOf(value);

    while (proto !== null) {
      let isNative = protoNativeCache.get(proto);

      if (isNative === undefined) {
        let ctor = null;
        try {
          ctor = Object.prototype.hasOwnProperty.call(proto, "constructor")
            ? proto.constructor
            : null;
        } catch (error) {
          ctor = null;
        }

        isNative =
          typeof ctor === "function" &&
          !SAFE_ROOT_CTORS.has(ctor) &&
          NATIVE_FUNCTION_RE.test(Function.prototype.toString.call(ctor));
        protoNativeCache.set(proto, isNative);
      }

      if (isNative) {
        return false;
      }

      proto = Object.getPrototypeOf(proto);
    }
  } catch (error) {
    return false;
  }

  return true;
}

export function getChildValue(container, key) {
  try {
    return { ok: true, value: container[key] };
  } catch (error) {
    return { ok: false, message: String((error && error.message) || error) };
  }
}

export function setChildValue(container, key, value) {
  try {
    container[key] = value;
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String((error && error.message) || error) };
  }
}

export function deleteChildValue(container, key) {
  try {
    if (Array.isArray(container)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= container.length) {
        return { ok: false, message: `数组下标 ${key} 不存在` };
      }

      container.splice(index, 1);
      return { ok: true };
    }

    delete container[key];
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String((error && error.message) || error) };
  }
}
// 把某个 key 打包成列表里的一行
export function createEntry(container, key, isRoot = false) {
  const name = String(key);
  const child = getChildValue(container, key);

  if (!child.ok) {
    return {
      key,
      name,
      kind: "error",
      typeText: getKindText("error"),
      icon: getKindIcon("error"),
      preview: child.message,
      valueText: "",
      boolValue: false,
      isContainer: false,
      isEditable: false,
      isIndex: false,
      isRoot,
    };
  }

  const value = child.value;
  const kind = getValueKind(value);
  const isContainer = isContainerKind(kind);

  return {
    key,
    name,
    kind,
    typeText: getKindText(kind),
    icon: getKindIcon(kind),
    preview: formatValuePreview(value, kind),
    valueText: isEditableKind(kind) ? formatValueText(value, kind) : "",
    boolValue: value === true,
    isContainer,
    isEditable: isEditableKind(kind),
    isIndex: Array.isArray(container) && /^\d+$/.test(name),
    isRoot,
  };
}

// 序列化（用于 JSON 编辑），自动跳过函数、转换 BigInt
export function toJsonText(value) {
  try {
    const text = JSON.stringify(
      value,
      (key, val) => {
        if (typeof val === "bigint") {
          return val.toString();
        }
        if (typeof val === "function") {
          return undefined;
        }
        return val;
      },
      2,
    );

    if (text === undefined) {
      return { ok: false, message: "该值无法转换为 JSON" };
    }

    return { ok: true, text };
  } catch (error) {
    return {
      ok: false,
      message: `无法转换为 JSON（可能存在循环引用）: ${String(
        (error && error.message) || error,
      )}`,
    };
  }
}
// RPG Maker 内置全局变量的命名规则（$dataXxx / $gameXxx / $plugins 等）
const RPG_GLOBAL_NAME_PATTERN = /^\$(data|game|plugins)/;

// 浏览器内置全局变量名（静态兜底 + 空白 iframe 动态检测）
let builtinGlobalNameCache = null;

export function getBuiltinGlobalNames() {
  if (builtinGlobalNameCache) {
    return builtinGlobalNameCache;
  }

  const names = new Set(BUILTIN_GLOBAL_NAMES);

  // 空白 iframe 里只有浏览器 / NW.js 内置变量，
  // 用它做差集可以准确识别游戏与第三方插件自定义的全局变量
  try {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "display: none; width: 0; height: 0; border: 0;";
    (document.body || document.documentElement).appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    if (frameWindow) {
      Object.getOwnPropertyNames(frameWindow).forEach((name) => {
        names.add(name);
      });
    }

    iframe.remove();
  } catch (error) {
    // 无法创建 iframe 时仅使用静态列表
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

  let ownNames = [];
  try {
    ownNames = Object.getOwnPropertyNames(root);
  } catch (error) {
    ownNames = [];
  }

  const extraRpgNames = [];
  const otherPluginNames = [];

  ownNames.forEach((name) => {
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

export const SEARCH_LIMIT_REASONS = {
  results: "已达到结果数量上限",
  nodes: "已达到遍历节点数上限",
  time: "已达到时间上限",
};

