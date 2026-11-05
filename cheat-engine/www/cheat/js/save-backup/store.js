/**
 * 快照索引 / 元数据 / 载荷文件的读写。
 */

import { writeJsonAtomic, writeTextAtomic } from "../AtomicFile.js";
import { getBackupDir, getIndexFile } from "./constants.js";

export class SaveBackupStore {
  /* ----------------------------------------------------------- 索引读写 */

  static readIndex() {
    const fs = this.requireFs();
    let data = [];

    try {
      if (fs.existsSync(getIndexFile())) {
        const parsed = JSON.parse(fs.readFileSync(getIndexFile(), "utf-8"));
        if (Array.isArray(parsed)) {
          data = parsed;
        } else {
          console.warn("[cheat plugin] 快照索引结构异常，已忽略");
        }
      }
    } catch (error) {
      // 索引损坏不能连累存档本身：退化成空索引，原始快照文件仍在磁盘上
      console.warn("[cheat plugin] 读取快照索引失败，按空索引处理", error);
      data = [];
    }

    return data.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        this.isValidSnapshotId(item.id) &&
        Number.isInteger(item.slot) &&
        item.slot >= 1,
    );
  }

  // 快照 ID 会直接拼进文件路径，必须挡住 ../、绝对路径、盘符等写法。
  static isValidSnapshotId(id) {
    return (
      typeof id === "string" &&
      id.length > 0 &&
      id !== "." &&
      id !== ".." &&
      /^[A-Za-z0-9._-]+$/.test(id)
    );
  }

  static assertSnapshotId(id) {
    if (!this.isValidSnapshotId(id)) {
      throw new Error("快照 ID 无效");
    }

    return id;
  }

  // 手工改过 index.json 时 payloadFile 可能指向快照目录以外。
  // 读取 / 删除 / 展示前都必须确认目标仍在 save-backups/ 内。
  static isPathInsideBackupDir(file) {
    try {
      if (typeof file !== "string" || file.length === 0) {
        return false;
      }

      const path = require("path");
      const base = path.resolve(getBackupDir());
      const target = path.resolve(file);

      return target === base || target.startsWith(base + path.sep);
    } catch (error) {
      return false;
    }
  }

  static writeIndex(entries) {
    this.ensureBackupDir();

    const data = Array.isArray(entries) ? entries : [];

    writeJsonAtomic(getIndexFile(), data);
  }

  static getMetaPath(id) {
    return `${getBackupDir()}/${this.assertSnapshotId(id)}.json`;
  }

  static getSnapshotCodec() {
    if (this.isMZ()) {
      return this.getPako() ? "pako" : "base64";
    }

    return this.getLZString() ? "lzstring" : "base64";
  }

  static getPayloadExtension(codec = this.getSnapshotCodec()) {
    return codec === "pako" ? ".rmmzsave" : ".rpgsave";
  }

  static getPayloadPath(id, meta = null) {
    const safeId = this.assertSnapshotId(id);
    const codec =
      (meta && meta.codec) ||
      (meta && meta.saveExt === ".rmmzsave" ? "pako" : null) ||
      this.getSnapshotCodec();
    const extension = (meta && meta.saveExt) || this.getPayloadExtension(codec);

    return `${getBackupDir()}/${safeId}${extension}`;
  }

  // 旧索引可能没有 payloadFile（或者扩展名与当前引擎不同），读取时按候选顺序探测。
  static findPayloadPath(meta) {
    const fs = this.requireFs();

    if (!meta || !this.isValidSnapshotId(meta.id)) {
      return null;
    }

    if (meta.payloadFile) {
      if (this.isPathInsideBackupDir(meta.payloadFile)) {
        if (fs.existsSync(meta.payloadFile)) {
          return meta.payloadFile;
        }
      } else {
        console.warn(
          "[cheat plugin] 忽略指向快照目录外的 payloadFile",
          meta.payloadFile,
        );
      }
    }

    const candidates = [];
    const add = (file) => {
      if (file && !candidates.includes(file)) candidates.push(file);
    };

    add(this.getPayloadPath(meta.id, meta));
    add(this.getPayloadPath(meta.id, { codec: "pako", saveExt: ".rmmzsave" }));
    add(
      this.getPayloadPath(meta.id, { codec: "lzstring", saveExt: ".rpgsave" }),
    );

    for (const file of candidates) {
      if (fs.existsSync(file)) {
        return file;
      }
    }

    return candidates[0] || null;
  }

  static ensureBackupDir() {
    const fs = this.requireFs();
    const path = require("path");
    const dir = path.dirname(getIndexFile());

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return dir;
  }

  static writeMeta(meta) {
    writeJsonAtomic(this.getMetaPath(meta.id), meta);
  }

  static readMeta(id) {
    const fs = this.requireFs();
    let file;
    let meta = null;

    try {
      file = this.getMetaPath(id);
      if (fs.existsSync(file)) {
        meta = JSON.parse(fs.readFileSync(file, "utf-8"));
      }
    } catch (error) {
      console.warn("[cheat plugin] 读取快照元数据失败", error);
    }

    if (!meta || typeof meta !== "object" || typeof meta.id !== "string") {
      // 元数据丢了也要能还原：用索引里的信息重建一份最小元数据
      const entry = this.readIndex().find((item) => item.id === id);
      if (!entry) {
        return null;
      }

      meta = { ...entry, recovered: true };
    }

    return meta;
  }

  static writePayload(meta, jsonText) {
    if (!meta.codec) {
      meta.codec = this.getSnapshotCodec();
    }
    if (!meta.saveExt) {
      meta.saveExt = this.getPayloadExtension(meta.codec);
    }

    const payloadFile = this.getPayloadPath(meta.id, meta);

    const encoded = this.encodePayloadText(jsonText, meta.codec);
    if (!encoded) {
      throw new Error("压缩存档数据失败，无法写入快照");
    }

    writeTextAtomic(payloadFile, encoded, "utf-8");

    meta.payloadFile = payloadFile;
    meta.payloadSize = encoded.length;
    this.writeMeta(meta);
  }

  // 返回快照里存的明文 JSON 文本，直接可以交给 writeSaveText
  static readPayload(meta) {
    const fs = this.requireFs();
    const payloadFile = this.findPayloadPath(meta);

    if (!payloadFile || !fs.existsSync(payloadFile)) {
      throw new Error("快照数据文件已被删除或移动");
    }

    const raw = fs.readFileSync(payloadFile, "utf-8");
    const codec =
      meta.codec || (payloadFile.endsWith(".rmmzsave") ? "pako" : null);

    const jsonText = this.decodePayloadText(raw, codec, "快照数据");

    if (typeof jsonText !== "string" || jsonText.length === 0) {
      throw new Error("快照数据解压失败（编码格式不兼容）");
    }

    return jsonText;
  }
}
