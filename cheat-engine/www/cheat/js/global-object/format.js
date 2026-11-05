// @ts-check
/**
 * 全局变量值的类型判断、预览与文本解析。
 *
 * 纯函数，不依赖 window / Vue，便于单元测试。
 */

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

// 预览文本的最大长度
const MAX_PREVIEW_LENGTH = 160;

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

    if (ArrayBuffer.isView(value)) {
      const length = /** @type {{ length?: number }} */ (value).length;

      if (typeof length === "number") {
        return length;
      }
    }

    // 只统计自有可枚举键。用 Object.keys 而不是 for...in + hasOwnProperty：
    // 后者会把整条原型链上的可枚举方法（RPG Maker 的原型方法都是可枚举的）
    // 全部遍历一遍再逐个丢弃，对 $gameXxx / Manager 这类深原型链对象很慢。
    // 超大数组走上面的 length 快路径，不会为百万级元素分配键数组。
    return Object.keys(value).length;
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
