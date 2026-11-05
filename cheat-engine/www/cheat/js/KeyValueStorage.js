// 模块级内存缓存（按文件路径共享）：消除定时器/高频调用的同步读盘。
// 注意：缓存生效期间外部手工修改同一 JSON 文件不会被感知；
// 写入始终直写磁盘并同步更新缓存，崩溃时最多丢最后一次写。
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
    if (isNwjs()) {
      this.filePath = filePath;
      this.fileEncoding = "utf-8";
      this.fileSystem = require("fs");
      this.pathModule = require("path");
    }
  }

  getItem(key) {
    if (!isNwjs()) {
      if (
        typeof window === "undefined" ||
        typeof localStorage === "undefined"
      ) {
        return null;
      }

      return localStorage.getItem(key);
    }

    return this.__getItemFromFile(key);
  }

  setItem(key, value) {
    if (!isNwjs()) {
      if (
        typeof window !== "undefined" &&
        typeof localStorage !== "undefined"
      ) {
        localStorage.setItem(key, value);
      }
      return;
    }

    this.__setItemToFile(key, value);
  }

  __readFile() {
    const cached = fileCache.get(this.filePath);
    if (cached !== undefined) {
      return cached;
    }

    let data = {};
    if (this.fileSystem.existsSync(this.filePath)) {
      try {
        const parsed = JSON.parse(
          this.fileSystem.readFileSync(this.filePath, this.fileEncoding),
        );
        // 只接受普通对象；数组/字符串等损坏内容按空数据处理
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          data = parsed;
        }
      } catch (e) {
        data = {};
      }
    }

    fileCache.set(this.filePath, data);
    return data;
  }

  __getItemFromFile(key) {
    return this.__readFile()[key];
  }

  __setItemToFile(key, value) {
    const data = this.__readFile();
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
