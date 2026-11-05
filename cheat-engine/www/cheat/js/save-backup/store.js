/**
 * 快照索引 / 元数据 / 载荷文件的读写。
 */

import { writeJsonAtomic, writeTextAtomic } from "../AtomicFile.js";
import { getBackupDir, getIndexFile } from "./constants.js";
import { t } from "../strings.js";

export class SaveBackupStore {
  /* ----------------------------------------------------------- 索引读写 */

  static readIndex() {
    const fs = this.requireFs();
    let data = [];
    let indexBroken = false;

    try {
      if (fs.existsSync(getIndexFile())) {
        const parsed = JSON.parse(fs.readFileSync(getIndexFile(), "utf-8"));
        if (Array.isArray(parsed)) {
          data = parsed;
        } else {
          console.warn("[cheat plugin] 快照索引结构异常，尝试从元数据重建");
          indexBroken = true;
        }
      } else {
        // 索引被误删时也从元数据恢复；目录不存在时重建会直接返回空数组。
        indexBroken = true;
      }
    } catch (error) {
      // 索引损坏不能连累存档本身：先尝试从每个快照的 <id>.json 重建，
      // 否则下一次写入会用空索引把磁盘上所有快照「甩出」列表。
      console.warn("[cheat plugin] 读取快照索引失败，尝试重建", error);
      indexBroken = true;
    }

    if (indexBroken) {
      const rebuilt = this.rebuildIndexFromMetas();

      if (rebuilt.length > 0) {
        console.warn(
          `[cheat plugin] 已从 ${rebuilt.length} 份快照元数据重建索引`,
        );

        try {
          this.writeIndex(rebuilt);
        } catch (error) {
          console.warn("[cheat plugin] 写回重建后的索引失败", error);
        }
      }

      return rebuilt;
    }

    const valid = data.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        this.isValidSnapshotId(item.id) &&
        Number.isInteger(item.slot) &&
        item.slot >= 1,
    );

    if (valid.length !== data.length) {
      // 只丢弃坏条目不值得整份重建，但可以从 meta 里把能恢复的补回来，
      // 避免下一次 writeIndex 把它们永久删掉。
      const known = new Set(valid.map((item) => item.id));

      for (const meta of this.rebuildIndexFromMetas()) {
        if (!known.has(meta.id)) {
          valid.push(meta);
          known.add(meta.id);
        }
      }
    }

    return valid;
  }

  // 从 <id>.json 元数据重建索引。读取时不反向调用 readMeta/readIndex，
  // 避免递归；损坏的元数据直接跳过。
  static rebuildIndexFromMetas() {
    const fs = this.requireFs();
    const path = require("path");
    const dir = getBackupDir();

    if (!fs.existsSync(dir)) {
      return [];
    }

    let names;

    try {
      names = fs.readdirSync(dir);
    } catch (error) {
      console.warn("[cheat plugin] 扫描快照目录失败", error);
      return [];
    }

    const indexName = path.basename(getIndexFile());
    const entries = [];
    const seen = new Set();

    for (const name of names) {
      if (!name.endsWith(".json") || name === indexName) {
        continue;
      }

      const id = name.slice(0, -".json".length);

      if (!this.isValidSnapshotId(id) || seen.has(id)) {
        continue;
      }

      let meta;

      try {
        meta = JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8"));
      } catch (error) {
        continue;
      }

      if (!meta || typeof meta !== "object" || meta.id !== id) {
        continue;
      }

      const slot = Number(meta.slot);

      if (!Number.isInteger(slot) || slot < 1) {
        continue;
      }

      seen.add(id);
      entries.push({ ...meta, id: id, slot: slot });
    }

    return entries;
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
      throw new Error(t("saveBackup.snapshotIdInvalid"));
    }

    return id;
  }

  // saveExt 会被直接拼进文件路径，必须限制成 ".rmmzsave" / ".rpgsave"
  // 这种单段扩展名，挡住被篡改 meta 里的 "/../../"。
  static isSafeSaveExt(extension) {
    return (
      typeof extension === "string" && /^\.[A-Za-z0-9]{1,16}$/.test(extension)
    );
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
    const extension =
      meta && this.isSafeSaveExt(meta.saveExt)
        ? meta.saveExt
        : this.getPayloadExtension(codec);

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
      throw new Error(t("saveBackup.compressFailed"));
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
      throw new Error(t("saveBackup.payloadMissing"));
    }

    const raw = fs.readFileSync(payloadFile, "utf-8");
    const codec =
      meta.codec || (payloadFile.endsWith(".rmmzsave") ? "pako" : null);

    const jsonText = this.decodePayloadText(raw, codec);

    if (typeof jsonText !== "string" || jsonText.length === 0) {
      throw new Error(t("saveBackup.payloadDecodeFailed"));
    }

    return jsonText;
  }
}
