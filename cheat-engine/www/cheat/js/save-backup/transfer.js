/**
 * 快照集合的导入 / 导出。
 */

import { writeTextAtomic } from "../AtomicFile.js";
import {
  BACKUP_KIND_AUTO,
  BACKUP_KIND_MANUAL,
  IMPORT_EXPORT_FORMAT,
  IMPORT_EXPORT_VERSION,
  MAX_IMPORT_BACKUPS,
  MAX_IMPORT_BYTES,
  MAX_NAME_LENGTH,
  WARN_NO_NWJS,
} from "./constants.js";

export class SaveBackupTransfer {
  /* --------------------------------------------------------- 导入 / 导出 */

  // 导出到快照目录下的一个 json 文件（含全部快照的原始数据），返回值供界面展示路径
  static exportAll() {
    if (!this.isLocalMode()) {
      throw new Error(WARN_NO_NWJS);
    }

    const path = require("path");
    const dir = this.ensureBackupDir();

    const stamp = this.formatFileTimestamp(Date.now());
    const file = path.join(dir, `cheat-save-backups-${stamp}.json`);
    const payload = {
      format: IMPORT_EXPORT_FORMAT,
      version: IMPORT_EXPORT_VERSION,
      exportedAt: Date.now(),
      gameVersion: this.getGameVersion(),
      backups: this.readIndex().map((entry) => {
        let data = null;

        try {
          data = this.readPayload(entry);
        } catch (error) {
          console.warn("[cheat plugin] 导出时读取快照失败", entry.id, error);
        }

        return { meta: entry, data: data };
      }),
    };

    // 导出文件可能很大，写一半崩溃时用原子写至少不会留下损坏的 JSON
    writeTextAtomic(file, JSON.stringify(payload), "utf-8");

    return file;
  }

  // 返回 { added, skipped }；不覆盖已有快照，避免导入把现有记录冲掉
  static importFromJson(text) {
    if (!this.isLocalMode()) {
      throw new Error(WARN_NO_NWJS);
    }

    const textValue = String(text ?? "");
    const byteLength =
      typeof Buffer !== "undefined"
        ? Buffer.byteLength(textValue, "utf8")
        : textValue.length;

    if (byteLength > MAX_IMPORT_BYTES) {
      throw new Error(
        `导入文件过大（${Math.ceil(byteLength / 1024 / 1024)} MB，` +
          `上限 ${MAX_IMPORT_BYTES / 1024 / 1024} MB）`,
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(textValue);
    } catch (error) {
      throw new Error("文件不是合法的 JSON", { cause: error });
    }

    if (
      !parsed ||
      parsed.format !== IMPORT_EXPORT_FORMAT ||
      !Array.isArray(parsed.backups)
    ) {
      throw new Error("不是本插件导出的存档快照文件");
    }

    if (parsed.version !== IMPORT_EXPORT_VERSION) {
      throw new Error(
        `不支持的快照文件版本：${parsed.version}（当前支持 ${IMPORT_EXPORT_VERSION}）`,
      );
    }

    if (parsed.backups.length > MAX_IMPORT_BACKUPS) {
      throw new Error(
        `快照数量过多（${parsed.backups.length}，上限 ${MAX_IMPORT_BACKUPS}）`,
      );
    }

    const entries = this.readIndex();
    const knownIds = new Set(entries.map((entry) => entry.id));
    let added = 0;
    let skipped = 0;

    try {
      for (const item of parsed.backups) {
        if (!item || !item.meta || typeof item.data !== "string") {
          skipped++;
          continue;
        }

        const slot = Number(item.meta.slot);
        if (!Number.isInteger(slot) || slot < 1) {
          skipped++;
          continue;
        }

        // 导入文件可能来自别处 / 被手工改坏，校验不过就跳过这一条，
        // 不要写出一份读档必崩的快照。
        try {
          this.validateSaveText(item.data, "导入的快照数据");
        } catch (error) {
          console.warn("[cheat plugin] 跳过无效的导入快照", slot, error);
          skipped++;
          continue;
        }

        const id = this.generateId(
          item.meta.kind === BACKUP_KIND_AUTO
            ? BACKUP_KIND_AUTO
            : BACKUP_KIND_MANUAL,
          slot,
          knownIds,
        );

        knownIds.add(id);

        const meta = {
          id: id,
          slot: slot,
          kind:
            item.meta.kind === BACKUP_KIND_AUTO
              ? BACKUP_KIND_AUTO
              : BACKUP_KIND_MANUAL,
          createdAt: Number(item.meta.createdAt) || Date.now(),
          label: String(item.meta.label || "").slice(0, MAX_NAME_LENGTH),
          sizeBytes: this.getTextByteLength(item.data),
          codec: this.getSnapshotCodec(),
          saveExt: this.getPayloadExtension(this.getSnapshotCodec()),
          mapId: Number(item.meta.mapId) || 0,
          mapName: String(item.meta.mapName || ""),
          // 兼容旧版本导出的文件（只有 saveTime 字符串）
          savefileTime: Number(item.meta.savefileTime) || 0,
          savefileTimeText: String(
            item.meta.savefileTimeText || item.meta.saveTime || "",
          ),
          playtimeFrames: Number(item.meta.playtimeFrames) || 0,
          playtime: String(item.meta.playtime || ""),
          gameVersion: String(item.meta.gameVersion || ""),
          importedAt: Date.now(),
        };

        // 保留自动快照的存档次数，导入后仍能参与去重
        const saveCount = Number(item.meta.saveCount);

        if (Number.isFinite(saveCount)) {
          meta.saveCount = saveCount;
        }

        this.writePayload(meta, item.data);

        entries.push({
          ...meta,
          payloadFile: meta.payloadFile,
        });

        added++;
      }
    } finally {
      // 中途某条写入失败时，已经成功的 payload 也必须登记进索引，
      // 否则会变成永远找不到的孤儿文件。
      try {
        this.writeIndex(entries);
      } catch (error) {
        console.warn("[cheat plugin] 写入导入后的索引失败", error);
      }
    }

    return { added: added, skipped: skipped };
  }
}
