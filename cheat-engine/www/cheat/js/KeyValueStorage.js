// 模块级内存缓存（按文件路径共享）：消除定时器/高频调用的同步读盘。
// 注意：缓存生效期间外部手工修改同一 JSON 文件不会被读取感知；
// 但每次写入前都会重新读盘合并，避免用旧缓存把别人刚写入的 key 覆盖掉。
// 写入始终原子写盘并同步更新缓存，崩溃时最多丢最后一次写。
import { getCheatSettingsPath } from "./SettingsPath.js";
import { writeJsonAtomic } from "./AtomicFile.js";

const fileCache = new Map();

function isNwjs() {
  return (
    typeof Utils !== "undefined" &&
    typeof Utils.isNwjs === "function" &&
    Utils.isNwjs()
  );
}

export class KeyValueStorage {
  constructor(filePath) {
    this.filePath = filePath;

    if (isNwjs()) {
      this.fileEncoding = "utf-8";
      this.fileSystem = require("fs");
      this.pathModule = require("path");
    }
  }

  // 浏览器模式下没有文件路径可用，必须把文件名拼进 localStorage key。
  // 否则 switch-locks.json / variable-locks.json / gameSpeed.json 等
  // 所有实例都读写同一个 "data"，会互相覆盖。
  __browserStorageKey(key) {
    return `${this.filePath || "cheat"}:${key}`;
  }

  getItem(key) {
    if (!isNwjs()) {
      if (
        typeof window === "undefined" ||
        typeof localStorage === "undefined"
      ) {
        return null;
      }

      const storageKey = this.__browserStorageKey(key);
      const value = localStorage.getItem(storageKey);

      if (value === null && localStorage.getItem(key) !== null) {
        console.warn(
          `[cheat plugin] 忽略旧版未按文件隔离的 localStorage 数据: ${key}`,
        );
      }

      return value;
    }

    return this.__getItemFromFile(key);
  }

  setItem(key, value) {
    if (!isNwjs()) {
      if (
        typeof window !== "undefined" &&
        typeof localStorage !== "undefined"
      ) {
        localStorage.setItem(this.__browserStorageKey(key), value);
      }
      return;
    }

    this.__setItemToFile(key, value);
  }

  // 构造时可能还没有 Utils（模块在引擎初始化前被 import），
  // 之后环境变成 nw.js 时再按需补上 fs，避免 fileSystem 为 undefined。
  __ensureFileSystem() {
    if (!this.fileSystem) {
      this.fileEncoding = "utf-8";
      this.fileSystem = require("fs");
      this.pathModule = require("path");
    }
  }

  __readFile() {
    this.__ensureFileSystem();

    const cached = fileCache.get(this.filePath);
    if (cached !== undefined) {
      return cached;
    }

    return this.__readFileFromDisk();
  }

  // 绕过缓存重新读盘。写入前用它做一次读改写，避免另一个游戏实例 /
  // 外部编辑器刚写入的 key 被本实例的旧缓存整文件覆盖掉。
  __readFileFromDisk() {
    this.__ensureFileSystem();

    let data = {};
    if (this.fileSystem.existsSync(this.filePath)) {
      try {
        const parsed = JSON.parse(
          this.fileSystem.readFileSync(this.filePath, this.fileEncoding),
        );
        // 只接受普通对象；数组/字符串等损坏内容按空数据处理
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          data = parsed;
        } else {
          this.__quarantineCorruptFile(new Error("设置文件的顶层结构不是对象"));
        }
      } catch (e) {
        this.__quarantineCorruptFile(e);
      }
    }

    fileCache.set(this.filePath, data);
    return data;
  }

  // 文件损坏时先改名留档再当成空数据，避免下一次 setItem 用新对象
  // 直接把原文件（里面可能还有其它可恢复的 key）整个覆盖掉。
  __quarantineCorruptFile(error) {
    try {
      if (!this.fileSystem.existsSync(this.filePath)) {
        return;
      }

      const backupPath = `${this.filePath}.corrupt-${Date.now()}`;
      this.fileSystem.renameSync(this.filePath, backupPath);
      console.warn(
        `[cheat plugin] 设置文件损坏，已备份到 ${backupPath}`,
        error,
      );
    } catch (renameError) {
      console.warn("[cheat plugin] 设置文件损坏且无法备份", renameError);
    }
  }

  __getItemFromFile(key) {
    return this.__readFile()[key];
  }

  __setItemToFile(key, value) {
    const data = this.__readFileFromDisk();
    const next = { ...data, [key]: value };

    // 先原子写盘，成功后再替换缓存；写失败时内存里仍是旧值，
    // 不会出现「缓存说写成功、磁盘还是半截文件」的状态。
    writeJsonAtomic(this.filePath, next);
    fileCache.set(this.filePath, next);
  }
}

export const KEY_VALUE_STORAGE = new KeyValueStorage(
  getCheatSettingsPath("kv-storage.json"),
);
