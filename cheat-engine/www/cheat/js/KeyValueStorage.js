// 模块级内存缓存（按文件路径共享）：消除定时器/高频调用的同步读盘。
// 注意：缓存生效期间外部手工修改同一 JSON 文件不会被感知；
// 写入始终直写磁盘并同步更新缓存，崩溃时最多丢最后一次写。
const fileCache = new Map();

export class KeyValueStorage {
  constructor(filePath) {
    if (Utils.isNwjs()) {
      this.filePath = filePath;
      this.fileEncoding = "utf-8";
      this.fileSystem = require("fs");
      this.pathModule = require("path");
    }
  }

  getItem(key) {
    if (!Utils.isNwjs()) {
      return localStorage.getItem(key);
    }

    return this.__getItemFromFile(key);
  }

  setItem(key, value) {
    if (!Utils.isNwjs()) {
      localStorage.setItem(key, value);
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
    const parentDir = this.pathModule.dirname(this.filePath);
    if (!this.fileSystem.existsSync(parentDir)) {
      this.fileSystem.mkdirSync(parentDir, { recursive: true });
    }

    // __readFile 返回的即是缓存对象，修改后写盘，缓存自动保持最新
    const data = this.__readFile();

    data[key] = value;

    this.fileSystem.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}

export const KEY_VALUE_STORAGE = new KeyValueStorage(
  "./www/cheat-settings/kv-storage.json",
);
