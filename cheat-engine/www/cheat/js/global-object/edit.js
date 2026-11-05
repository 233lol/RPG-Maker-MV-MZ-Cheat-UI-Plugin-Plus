// @ts-check
/**
 * 全局变量的读取、修改、删除与 JSON 序列化。
 */

import {
  getValueKind,
  isContainerKind,
  isEditableKind,
  getKindText,
  getKindIcon,
  formatValuePreview,
  formatValueText,
} from "./format.js";
import { t } from "../strings.js";

// 单个容器最多枚举多少个键（避免对超大数组 / 对象调用 Object.keys 时撑爆内存）
const MAX_ENUMERATED_KEYS = 10000;

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

// 写入 / 删除这些键名会改变对象的原型链（而非普通属性），
// 可能直接破坏游戏对象的逻辑，一律拒绝
const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function checkPrototypeKey(key) {
  if (PROTOTYPE_KEYS.has(key)) {
    return {
      ok: false,
      message: t("objectKind.prototypeKey", { key }),
    };
  }
  return null;
}

export function setChildValue(container, key, value) {
  const rejected = checkPrototypeKey(key);
  if (rejected) {
    return rejected;
  }

  try {
    container[key] = value;
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String((error && error.message) || error) };
  }
}

export function deleteChildValue(container, key) {
  const rejected = checkPrototypeKey(key);
  if (rejected) {
    return rejected;
  }

  try {
    if (Array.isArray(container)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= container.length) {
        return { ok: false, message: t("objectKind.indexMissing", { key }) };
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
      return { ok: false, message: t("objectKind.notJson") };
    }

    return { ok: true, text };
  } catch (error) {
    return {
      ok: false,
      message: t("objectKind.notJsonCircular", {
        message: String((error && error.message) || error),
      }),
    };
  }
}

export { MAX_ENUMERATED_KEYS };
