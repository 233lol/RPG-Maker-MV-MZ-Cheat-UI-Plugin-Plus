import { Alert } from "./AlertHelper.js";
import { ConfirmDialog } from "./DialogHelper.js";

import {
  BACKUP_KIND_AUTO,
  BACKUP_KIND_MANUAL,
  MAX_IMPORT_BYTES,
  MAX_NAME_LENGTH,
  WARN_NO_NWJS,
} from "./save-backup/constants.js";
import { SaveBackupCodec } from "./save-backup/codec.js";
import { SaveBackupFormat } from "./save-backup/format.js";
import { SaveBackupMetadata } from "./save-backup/metadata.js";
import { applyStaticMethods } from "./save-backup/mixin.js";
import { SaveBackupSettings } from "./save-backup/settings.js";
import { SaveBackupStore } from "./save-backup/store.js";
import { SaveBackupTransfer } from "./save-backup/transfer.js";

/**
 * 存档时间机器入口。
 *
 * 具体实现按职责拆到 `save-backup/` 下：
 * - constants.js：常量与路径
 * - format.js：时间 / 大小格式化、快照 ID
 * - codec.js：MV LZString / MZ pako 编解码
 * - store.js：索引、元数据、载荷文件读写
 * - metadata.js：存档数据解析与校验
 * - transfer.js：导入 / 导出
 * - settings.js：设置与自动快照钩子
 *
 * 本文件保留环境探测、StorageManager 读写、快照列表 / 还原等核心流程，
 * 并通过 applyStaticMethods 把拆分模块的静态方法挂回 SaveBackupCheat，
 * 因此面板和测试继续调用 SaveBackupCheat.xxx() 即可。
 */
export class SaveBackupCheat {
  /* ------------------------------------------------------------------ 环境 */

  // 供面板在 FileReader 读取前先拦一次超大文件
  static getMaxImportBytes() {
    return MAX_IMPORT_BYTES;
  }

  static isLocalMode() {
    try {
      // 快照功能依赖文件系统：真正决定能否用的是 require("fs") 能不能拿到，
      // 而不是 Utils.isNwjs()（后者只说明跑在 nw.js 里）
      return typeof require === "function" && !!this.requireFs();
    } catch (error) {
      return false;
    }
  }

  // MZ 与 MV 的存档 API 不同：
  //   MV：savefileId -> fileN.rpgsave，StorageManager.saveToLocalFile(id, json) 内部 LZString
  //   MZ：saveName  -> fileN.rmmzsave，StorageManager.saveToLocalFile(name, zip) 要求 pako 压缩后的数据
  // 这里只做能力探测，不依赖 Utils 是否已经加载。
  static isMZ() {
    try {
      if (typeof Utils !== "undefined" && Utils.RPGMAKER_NAME) {
        return Utils.RPGMAKER_NAME === "MZ";
      }
    } catch (error) {
      // 继续按 API 探测
    }

    try {
      return (
        typeof DataManager !== "undefined" &&
        typeof DataManager.makeSavename === "function"
      );
    } catch (error) {
      return false;
    }
  }

  static getSaveName(slot) {
    slot = Number(slot);

    try {
      if (typeof DataManager !== "undefined") {
        if (typeof DataManager.makeSavename === "function") {
          return DataManager.makeSavename(slot);
        }
        if (typeof DataManager.makeSaveName === "function") {
          return DataManager.makeSaveName(slot);
        }
      }
    } catch (error) {
      // 退回引擎默认命名
    }

    return `file${slot}`;
  }

  static maxSavefiles() {
    try {
      if (typeof DataManager === "undefined") {
        return 0;
      }

      const max =
        typeof DataManager.maxSavefiles === "function"
          ? DataManager.maxSavefiles()
          : DataManager._maxSavefiles;

      return Number.isFinite(max) && max > 0 ? max : 0;
    } catch (error) {
      return 0;
    }
  }

  // 已经读进内存的槽位。
  // 顺序很重要：$gameSystem._savefileId 只有部分游戏 / 插件会写，
  // 而 DataManager._lastAccessedId 是引擎自己在存档 / 读档时维护的，
  // 两个都拿不到才返回 -1（未知）。
  static getLoadedSlot() {
    const isUsableSlot = (value) => Number.isInteger(value) && value > 0;

    try {
      const fromSystem = Number($gameSystem && $gameSystem._savefileId);
      if (isUsableSlot(fromSystem)) {
        return fromSystem;
      }
    } catch (error) {
      // $gameSystem 还没初始化，继续往下试
    }

    try {
      const lastAccessed = Number(
        typeof DataManager !== "undefined" ? DataManager._lastAccessedId : NaN,
      );
      if (isUsableSlot(lastAccessed)) {
        return lastAccessed;
      }
    } catch (error) {
      // 忽略，走匿名分支
    }

    return -1;
  }

  // 引擎自己的存档头读取：json 尾部带 {system:{_playtime,_savefileId},...} 摘要，
  // 不需要解压整个存档。菜单里的「读取」列表用的就是它，所以展示值与游戏一致，
  // 而且对 pako 等其他压缩方式的游戏同样有效（读不出完整 JSON 也能读头）。
  static readSavefileInfo(slot) {
    if (typeof DataManager === "undefined") {
      return null;
    }

    try {
      // MV: loadSavefileInfo(savefileId)；MZ: savefileInfo(savefileId)
      // 两者都直接读 global 存档头，不需要解压整份存档。
      let info = null;

      if (typeof DataManager.loadSavefileInfo === "function") {
        info = DataManager.loadSavefileInfo(Number(slot));
      } else if (typeof DataManager.savefileInfo === "function") {
        info = DataManager.savefileInfo(Number(slot));
      }

      if (!info || typeof info !== "object") {
        return null;
      }

      // MZ 的存档头里 playtime 已经是 "HH:MM:SS" 字符串；MV 是帧数。
      const playtimeValue = info.playtime;
      const playtime = Number(playtimeValue);
      const timestamp = Number(info.timestamp);

      return {
        playtimeFrames: Number.isFinite(playtime) ? playtime : 0,
        playtimeText:
          typeof playtimeValue === "string"
            ? playtimeValue
            : Number.isFinite(playtime)
              ? this.formatFrames(playtime)
              : "",
        timestamp: Number.isFinite(timestamp) ? timestamp : 0,
        timestampText: Number.isFinite(timestamp)
          ? this.formatDateTime(timestamp)
          : "",
      };
    } catch (error) {
      console.warn(
        "[cheat plugin] DataManager.loadSavefileInfo 读取失败",
        error,
      );
      return null;
    }
  }

  static getPlaytimeText() {
    try {
      if (!$gameSystem) {
        return "";
      }

      return $gameSystem.playtimeText();
    } catch (error) {
      return "";
    }
  }

  /* ------------------------------------------------------- StorageManager */

  static hasSave(slot) {
    slot = Number(slot);
    if (!Number.isInteger(slot) || slot < 1) {
      return false;
    }

    try {
      // MZ 的 DataManager.savefileExists / MV 的 StorageManager.localFileExists
      // 对参数语义不同（MZ 用 saveName，MV 用 savefileId），优先用引擎自己的
      // DataManager 接口，避免把槽号当成文件名。
      if (
        typeof DataManager !== "undefined" &&
        typeof DataManager.savefileExists === "function"
      ) {
        return !!DataManager.savefileExists(slot);
      }

      if (this.isLocalMode()) {
        if (typeof StorageManager.localFileExists === "function") {
          return !!StorageManager.localFileExists(slot);
        }
        return this.readSaveText(slot) !== null;
      }

      if (typeof StorageManager.webStorageExists === "function") {
        return !!StorageManager.webStorageExists(slot);
      }
    } catch (error) {
      console.warn("[cheat plugin] 检查存档是否存在失败", error);
    }

    return false;
  }

  // 取回存档的 JSON 文本；不存在返回 null，压缩方式不认识时抛错。
  //
  // 只在「读」的时候解压一次：快照里存的是明文 JSON，还原时再压缩一次写盘。
  // （早期实现把 .rpgsave 的 base64 直接再压缩一层存起来，快照体积翻倍且
  //  语义混乱 —— 现在快照文件本身就是 JSON + LZString 压缩，可以直接查看。）
  static readSaveText(slot) {
    slot = Number(slot);
    if (!Number.isInteger(slot) || slot < 1) {
      return null;
    }

    try {
      if (this.isLocalMode()) {
        const filePath = this.getSaveFilePath(slot);
        const fs = this.requireFs();

        if (!filePath || !fs.existsSync(filePath)) {
          return null;
        }

        return this.decodeEngineSaveText(
          fs.readFileSync(filePath, { encoding: "utf8" }),
        );
      }

      // 浏览器 / 手机：MV 的 web storage 返回已解压的 JSON；MZ 没有同步 API，
      // 且快照功能本来就依赖文件系统，这里直接返回 null。
      if (this.isMZ()) {
        return null;
      }

      return StorageManager.loadFromWebStorage(slot);
    } catch (error) {
      console.warn("[cheat plugin] 读取存档数据失败", error);
      return null;
    }
  }

  // 把引擎存档文件内容解成明文 JSON：
  //   MV  ：LZString base64（个别游戏 / 旧版本是裸 base64 或明文）
  //   MZ  ：pako 压缩后的二进制字符串
  // 只有解出来确实像 JSON 才认，避免把乱码当成存档。
  static decodeEngineSaveText(raw) {
    if (raw === null || raw === undefined || raw === "") {
      return null;
    }

    const looksLikeJson = (text) => {
      if (typeof text !== "string") {
        return false;
      }
      const trimmed = text.trimStart();
      return trimmed.startsWith("{") || trimmed.startsWith("[");
    };

    if (looksLikeJson(raw)) {
      return raw;
    }

    const lz = this.getLZString();
    if (lz && typeof lz.decompressFromBase64 === "function") {
      try {
        const text = lz.decompressFromBase64(raw);
        if (looksLikeJson(text)) {
          return text;
        }
      } catch (error) {
        // 不是 LZString 压缩的，继续试下一种
      }
    }

    try {
      const pakoLib = this.getPako();
      if (pakoLib && typeof pakoLib.inflate === "function") {
        const text = pakoLib.inflate(raw, { to: "string" });
        if (looksLikeJson(text)) {
          return text;
        }
      }
    } catch (error) {
      // 不是 pako 压缩的，继续试下一种
    }

    try {
      const text = new TextDecoder().decode(
        Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)),
      );
      if (looksLikeJson(text)) {
        return text;
      }
    } catch (error) {
      // 也不是裸 base64
    }

    console.warn("[cheat plugin] 无法识别的存档压缩格式，快照元数据将不完整");
    return null;
  }

  // jsonText 必须是 readSaveText / readPayload 得到的明文 JSON 文本
  static writeSaveText(slot, jsonText) {
    slot = Number(slot);
    if (!Number.isInteger(slot) || slot < 1) {
      throw new Error("存档槽必须是正整数");
    }

    if (typeof jsonText !== "string" || jsonText.length === 0) {
      throw new Error("存档数据为空");
    }

    // 交给引擎自己的 API 写，压缩方式与 .bak 维护都由引擎负责。
    // MZ 的 saveToLocalFile 要求传入 pako 压缩后的 zip，MV 则要求明文 JSON。
    if (this.isLocalMode()) {
      if (this.isMZ()) {
        const pakoLib = this.getPako();
        if (!pakoLib || typeof pakoLib.deflate !== "function") {
          throw new Error("当前游戏未提供 pako，无法写入 MZ 存档");
        }

        const zip = pakoLib.deflate(jsonText, { to: "string", level: 1 });
        StorageManager.saveToLocalFile(this.getSaveName(slot), zip);
        return;
      }

      StorageManager.saveToLocalFile(slot, jsonText);
      return;
    }

    if (this.isMZ()) {
      throw new Error("MZ 浏览器模式暂不支持写入存档");
    }

    StorageManager.saveToWebStorage(slot, jsonText);
  }

  // 快照数据文件在磁盘上是否存在（用于「文件丢失」提示，不读内容）
  static isSnapshotPresent(entry) {
    if (!entry) {
      return false;
    }

    try {
      const fs = this.requireFs();
      const payloadFile = this.findPayloadPath(entry);
      return !!(payloadFile && fs.existsSync(payloadFile));
    } catch (error) {
      return false;
    }
  }

  static getSaveFilePath(slot) {
    if (!this.isLocalMode()) {
      return null;
    }

    // MV：localFilePath(savefileId) 直接给出 fileN.rpgsave 的绝对路径
    try {
      if (typeof StorageManager.localFilePath === "function") {
        const filePath = StorageManager.localFilePath(slot);
        if (typeof filePath === "string" && filePath.length > 0) {
          return filePath;
        }
      }
    } catch (error) {
      console.warn(
        "[cheat plugin] StorageManager.localFilePath 调用失败",
        error,
      );
    }

    // MZ：只有 filePath(saveName)，传入 "fileN" 才会得到 fileN.rmmzsave
    try {
      if (typeof StorageManager.filePath === "function") {
        const filePath = StorageManager.filePath(this.getSaveName(slot));
        if (typeof filePath === "string" && filePath.length > 0) {
          return filePath;
        }
      }
    } catch (error) {
      console.warn("[cheat plugin] StorageManager.filePath 调用失败", error);
    }

    // 兜底：MV 是 <游戏根>/www/save/fileN.rpgsave，
    //       MZ 是 <游戏根>/save/fileN.rmmzsave。
    // localFileDirectoryPath 内部用 process.mainModule（新版 nw.js 已移除该字段），
    // 部分游戏在这里会抛错，所以必须留这条路径。
    try {
      const path = require("path");
      const base = process.cwd();
      const saveName = this.getSaveName(slot);

      if (this.isMZ()) {
        return path.join(base, "save", `${saveName}.rmmzsave`);
      }

      return path.join(base, "www", "save", `${saveName}.rpgsave`);
    } catch (error) {
      return null;
    }
  }

  /* ------------------------------------------------------------- 快照 */

  static listBackups() {
    if (!this.isLocalMode()) {
      return [];
    }

    try {
      return this.readIndex()
        .map((entry) => {
          const payloadFile = this.findPayloadPath(entry);
          // 统一用记录里的快照大小，避免把磁盘上可能残留的孤儿文件算进来
          const size = Number(entry.sizeBytes) || 0;
          const playtimeFrames = Number(entry.playtimeFrames) || 0;
          const playtimeText =
            entry.playtime || this.formatFrames(playtimeFrames) || "";
          const present = this.isSnapshotPresent(entry);

          return {
            ...entry,
            payloadFile: payloadFile,
            exists: present,
            size: size,
            sizeText: present ? this.formatBytes(size) : "文件丢失",
            createdText: this.formatTime(entry.createdAt),
            relativeText: this.formatRelative(entry.createdAt),
            kindText: entry.kind === BACKUP_KIND_AUTO ? "自动" : "手动",
            // 存档头里的时间优先，其次退回快照里记的字符串
            savefileTimeText: this.getSaveTimeText(entry),
            playtimeText: playtimeText,
          };
        })
        .sort((a, b) => {
          const diff = Number(b.createdAt) - Number(a.createdAt);
          return diff !== 0 ? diff : String(b.id).localeCompare(String(a.id));
        });
    } catch (error) {
      console.warn("[cheat plugin] 列出快照失败", error);
      return [];
    }
  }

  // 用引擎存档头把「同一槽位」快照缺失的时长 / 存档时间补上。
  //
  // 用途：早期版本建的快照没记这两个字段，若该槽位现在还是那个存档
  // （游戏里读的就是它），用存档头的值补进去是准确的 —— 比永远显示
  // 「未记录」有用得多。地图名无法这样补（存档头里没有），只能保持未知。
  //
  // 两种「补不到」要区分开：
  //   a. 存档头临时读不到（磁盘忙 / 槽位刚被删）→ 下次还能再试；
  //   b. 存档头明确没有时长（老版本 MV 的存档本来就不写 _playtime）→
  //      打上 backfillChecked 标记，避免每次刷新都白写一遍元数据文件。
  // 只改元数据、绝不碰快照数据本身。
  static backfillFromSavefileInfo() {
    if (!this.isLocalMode()) {
      return 0;
    }

    const entries = this.readIndex();
    const infoCache = new Map();
    let patched = 0;

    for (const entry of entries) {
      if (entry.backfillChecked) {
        continue;
      }

      const hasPlaytime = Number(entry.playtimeFrames) > 0 || !!entry.playtime;
      const hasSaveTime =
        Number(entry.savefileTime) > 0 || !!entry.savefileTimeText;

      if (hasPlaytime && hasSaveTime) {
        continue;
      }

      const slot = Number(entry.slot);
      if (!Number.isInteger(slot) || slot < 1) {
        continue;
      }

      if (!infoCache.has(slot)) {
        infoCache.set(slot, this.readSavefileInfo(slot));
      }

      const info = infoCache.get(slot);
      if (!info) {
        continue;
      }

      if (!hasPlaytime && info.playtimeFrames > 0) {
        entry.playtimeFrames = info.playtimeFrames;
        entry.playtime = info.playtimeText;
      }

      if (!hasSaveTime && info.timestamp > 0) {
        entry.savefileTime = info.timestamp;
        entry.savefileTimeText = info.timestampText;
      }

      // 存档头里确实没有时长 / 时间：记下来别再反复尝试
      entry.backfillChecked = true;

      const meta = this.readMeta(entry.id);
      if (meta) {
        meta.playtimeFrames = entry.playtimeFrames;
        meta.playtime = entry.playtime;
        meta.savefileTime = entry.savefileTime;
        meta.savefileTimeText = entry.savefileTimeText;
        this.writeMeta(meta);
      }

      patched++;
    }

    // 地图信息存档头里没有，只能从快照自己那份存档数据里读回来。
    // 老快照的载荷是「整个存档的解压结果」，地图名往往就在里面。
    if (this.backfillMapFromIndex(entries)) {
      patched++;
    }

    if (patched > 0) {
      this.writeIndex(entries);
    }

    return patched;
  }

  // 给缺地图信息 / 缺时长的快照补元数据（读自己的载荷，只写元数据）。
  //
  // 标记用 payloadBackfillChecked（旧版本叫 backfillMapChecked）：
  // 老版本只补过地图、没补过时长，如果沿用旧标记，这些快照的时长会永远补不上。
  static backfillMapFromIndex(entries) {
    const fs = this.requireFs();
    let anyChanged = false;

    for (const entry of entries) {
      const needsMap = !(Number(entry.mapId) > 0);
      const needsPlaytime =
        !(Number(entry.playtimeFrames) > 0) && !entry.playtime;

      if ((!needsMap && !needsPlaytime) || entry.payloadBackfillChecked) {
        continue;
      }

      const slot = Number(entry.slot);
      const payloadFile = this.findPayloadPath(entry);
      if (!Number.isInteger(slot) || slot < 1 || !payloadFile) {
        continue;
      }

      // 只有「快照之后这个槽位被重新存过档」时，当前存档里的地图才代表快照里的地图。
      // 否则（快照比存档新）说明快照拍的进度比磁盘上那份更靠后，回填会写错。
      const savePath = this.getSaveFilePath(slot);
      if (
        !savePath ||
        !fs.existsSync(savePath) ||
        !fs.existsSync(payloadFile)
      ) {
        continue;
      }

      let changed = false;

      try {
        const saveMtime = fs.statSync(savePath).mtimeMs;
        const snapshotTime = Number(entry.createdAt) || 0;

        if (!(saveMtime >= snapshotTime - 2000)) {
          continue;
        }

        const jsonText = this.readPayload(entry);
        const saveObject = this.parseAnySaveData(jsonText);

        if (!saveObject || typeof saveObject !== "object") {
          continue;
        }

        const mapId =
          Number(saveObject.map && saveObject.map._mapId) ||
          Number(
            saveObject.player &&
              saveObject.player.map &&
              saveObject.player.map._mapId,
          ) ||
          0;

        if (needsMap && mapId > 0) {
          entry.mapId = mapId;
          const mapInfo = this.getMapInfo(mapId);
          entry.mapName = mapInfo ? mapInfo.name : "";
          changed = true;
        }

        // 老版本 MV 的 Game_System 只有 _framesOnSave（没有 _playtime）。
        // 引擎自己的算法是 _framesOnSave + _frames，存档那一刻 _frames 归零，
        // 所以 _framesOnSave 就是该存档的游玩时长 —— global.rpgsave 里的
        // playtime 也正是这么算出来的。
        //
        // 只在没有任何时长记录、且存档头也没给出更长时长时才补：
        // 存档头是引擎权威值，_framesOnSave 只是近似（载入后再存档会偏小），
        // 不能让近似值把权威值覆盖掉。
        const framesOnSave = Number(
          saveObject.system && saveObject.system._framesOnSave,
        );
        const entryFrames = Number(entry.playtimeFrames) || 0;
        const entryHasPlaytime = entryFrames > 0 || !!entry.playtime;
        const headerInfo = this.readSavefileInfo(slot);
        const headerFrames = headerInfo ? headerInfo.playtimeFrames : 0;

        if (
          !entryHasPlaytime &&
          Number.isFinite(framesOnSave) &&
          framesOnSave > 0 &&
          framesOnSave >= headerFrames
        ) {
          entry.playtimeFrames = framesOnSave;
          entry.playtime = this.formatFrames(framesOnSave);
          changed = true;
        }

        // 成功读出快照内容后，无论有没有补到字段都记上标记：
        // 老快照可能本来就没有地图 / 时长，反复解压整份存档没有意义。
        entry.payloadBackfillChecked = true;
        anyChanged = true;

        const meta = this.readMeta(entry.id);
        if (meta) {
          if (changed) {
            meta.mapId = entry.mapId;
            meta.mapName = entry.mapName;
            meta.playtimeFrames = entry.playtimeFrames;
            meta.playtime = entry.playtime;
          }
          meta.payloadBackfillChecked = true;
          this.writeMeta(meta);
        }
      } catch (error) {
        console.warn(
          "[cheat plugin] 从快照数据回填元数据失败",
          entry.id,
          error,
        );
      }
    }

    return anyChanged;
  }

  static getStats() {
    if (!this.isLocalMode()) {
      return {
        count: 0,
        autoCount: 0,
        manualCount: 0,
        missingCount: 0,
        bytes: 0,
      };
    }

    // 直接读索引，不经过 listBackups：统计只关心记录本身，
    // 没必要为了数字去 stat 每个快照文件
    const entries = this.readIndex();

    return {
      count: entries.length,
      autoCount: entries.filter((item) => item.kind === BACKUP_KIND_AUTO)
        .length,
      manualCount: entries.filter((item) => item.kind === BACKUP_KIND_MANUAL)
        .length,
      missingCount: entries.filter((item) => !this.isSnapshotPresent(item))
        .length,
      bytes: entries.reduce(
        (sum, item) => sum + (Number(item.sizeBytes) || 0),
        0,
      ),
    };
  }

  static createSnapshot(
    slot,
    kind = BACKUP_KIND_MANUAL,
    label = "",
    options = {},
  ) {
    slot = Number(slot);

    if (!this.isLocalMode()) {
      throw new Error(WARN_NO_NWJS);
    }

    if (!Number.isInteger(slot) || slot < 1) {
      throw new Error("存档槽必须是正整数");
    }

    const text = this.readSaveText(slot);
    if (!text) {
      throw new Error(`存档 ${slot} 不存在或无法读取`);
    }

    const saveMeta = this.parseSaveMeta(slot);
    const entries = this.readIndex();
    const codec = this.getSnapshotCodec();
    const meta = {
      id: this.generateId(kind, slot, new Set(entries.map((e) => e.id))),
      slot: slot,
      kind: kind,
      createdAt: Date.now(),
      label: String(label || "").slice(0, MAX_NAME_LENGTH),
      sizeBytes: text.length,
      // 快照载荷使用与当前引擎一致的编码，方便直接改名为存档文件
      codec: codec,
      saveExt: this.getPayloadExtension(codec),
      // 快照对应的存档信息：地图 / 时长 / 存档时间，来源见 parseSaveMeta
      mapId: saveMeta.mapId,
      mapName: saveMeta.mapName,
      savefileTime: saveMeta.savefileTime,
      savefileTimeText: saveMeta.savefileTimeText,
      playtimeFrames: saveMeta.playtimeFrames,
      playtime: saveMeta.playtime,
      gameVersion: this.getGameVersion(),
    };

    // 只有自动快照需要记「是内存档之后第几次自动快照」，手动快照不参与节流
    if (Number.isFinite(options.saveCount)) {
      meta.saveCount = Number(options.saveCount);
    }

    this.writePayload(meta, text);

    entries.push({
      id: meta.id,
      slot: meta.slot,
      kind: meta.kind,
      createdAt: meta.createdAt,
      label: meta.label,
      sizeBytes: meta.sizeBytes,
      codec: meta.codec,
      saveExt: meta.saveExt,
      mapId: meta.mapId,
      mapName: meta.mapName,
      savefileTime: meta.savefileTime,
      savefileTimeText: meta.savefileTimeText,
      playtimeFrames: meta.playtimeFrames,
      playtime: meta.playtime,
      gameVersion: meta.gameVersion,
      saveCount: meta.saveCount,
      payloadFile: meta.payloadFile,
    });

    this.writeIndex(entries);
    this.pruneAutoBackups(slot);

    return meta;
  }

  static getGameVersion() {
    try {
      const version = $dataSystem && $dataSystem.versionId;
      return typeof version === "string" || typeof version === "number"
        ? String(version)
        : "";
    } catch (error) {
      return "";
    }
  }

  // 每个槽只保留最近 N 份自动快照（N 取自设置），超出部分连磁盘文件一起删。
  // 按槽分别裁剪，手动快照永远不会被自动清理。
  static pruneAutoBackups(slot) {
    const keepCount = this.getSettings().autoKeep;
    const all = this.readIndex();
    const autos = all
      .filter((entry) => entry.slot === slot && entry.kind === BACKUP_KIND_AUTO)
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));

    const removable = autos.slice(keepCount);
    if (removable.length === 0) {
      return 0;
    }

    const removedIds = new Set(removable.map((entry) => entry.id));

    // 先删文件再写索引：中途失败最多留下孤儿文件，不会出现「索引指向空文件」
    for (const entry of removable) {
      this.removeSnapshotFiles(entry);
    }

    this.writeIndex(all.filter((entry) => !removedIds.has(entry.id)));

    return removable.length;
  }

  static removeSnapshotFiles(entry) {
    const fs = this.requireFs();
    const payloadFile = this.findPayloadPath(entry);
    const files = [payloadFile, this.getMetaPath(entry.id)];

    for (const file of files) {
      try {
        if (!file || !this.isPathInsideBackupDir(file)) {
          continue;
        }

        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        console.warn("[cheat plugin] 删除快照文件失败", file, error);
      }
    }
  }

  static renameBackup(id, newLabel) {
    const label = String(newLabel || "")
      .trim()
      .slice(0, MAX_NAME_LENGTH);
    const entries = this.readIndex();
    const entry = entries.find((item) => item.id === id);

    if (!entry) {
      throw new Error("快照不存在");
    }

    entry.label = label;

    if (!this.isLocalMode()) {
      throw new Error(WARN_NO_NWJS);
    }

    this.writeIndex(entries);

    const meta = this.readMeta(id);
    if (meta) {
      meta.label = label;
      this.writeMeta(meta);
    }

    return label;
  }

  static deleteBackup(id) {
    if (!this.isLocalMode()) {
      throw new Error(WARN_NO_NWJS);
    }

    const entries = this.readIndex();
    const entry = entries.find((item) => item.id === id);

    if (!entry) {
      throw new Error("快照不存在");
    }

    this.removeSnapshotFiles(entry);
    this.writeIndex(entries.filter((item) => item.id !== id));
  }

  static clearBackups(kind = null) {
    if (!this.isLocalMode()) {
      throw new Error(WARN_NO_NWJS);
    }

    const entries = this.readIndex();
    const targets = kind
      ? entries.filter((item) => item.kind === kind)
      : entries;

    for (const entry of targets) {
      this.removeSnapshotFiles(entry);
    }

    this.writeIndex(kind ? entries.filter((item) => item.kind !== kind) : []);

    return targets.length;
  }

  /* ------------------------------------------------------------- 还原 */

  // 还原前给「将被覆盖的存档」留一份自动快照 —— 这是还原可回退的保证。
  // 但如果这份存档刚被留过快照（记录里的 saveCount 与当前一致），就不再重复留。
  static backupCurrentSave(slot) {
    if (!this.hasSave(slot)) {
      return null;
    }

    const saveCount = this.getSaveCount();
    const newest = this.findNewestAutoSnapshot(slot);

    if (newest && Number(newest.saveCount) === saveCount) {
      return null;
    }

    try {
      return this.createSnapshot(slot, BACKUP_KIND_AUTO, "", {
        saveCount: saveCount,
      });
    } catch (error) {
      console.warn("[cheat plugin] 还原前自动快照失败", error);
      return null;
    }
  }

  // 该槽位最近的一份自动快照（用来判断「当前存档是否已经留过档」）
  static findNewestAutoSnapshot(slot) {
    const key = Number(slot);

    if (!Number.isInteger(key) || key < 1) {
      return null;
    }

    const autos = this.readIndex()
      .filter(
        (entry) =>
          Number(entry.slot) === key && entry.kind === BACKUP_KIND_AUTO,
      )
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));

    return autos.length > 0 ? autos[0] : null;
  }

  // 还原只是替换了磁盘上的 fileN 存档，游戏的读档列表读的是 global 索引。
  // 不更新索引会出现两种问题：
  //   1. 还原到空槽位后，读档列表里看不到这个新存档；
  //   2. 还原到已有槽位后，列表里的时长 / 头像 / 时间还是旧存档的。
  static updateGlobalInfoAfterRestore(slot, sourceSlot, jsonText) {
    try {
      const saveObject = this.parseAnySaveData(jsonText) || {};
      const system = saveObject.system || {};
      const rawFrames =
        system._framesOnSave !== undefined
          ? Number(system._framesOnSave)
          : system._playtime !== undefined
            ? Number(system._playtime)
            : NaN;
      const playtimeText = this.formatFrames(rawFrames) || "";
      const now = Date.now();

      // MZ：DataManager._globalInfo 是数组，savefileInfo(slot) 取条目
      if (this.isMZ()) {
        const all = DataManager._globalInfo;

        if (!Array.isArray(all)) {
          return;
        }

        const source = all[sourceSlot] || all[slot] || {};
        const next = { ...source };

        next.title = next.title || $dataSystem?.gameTitle || "";
        next.characters = next.characters || [];
        next.faces = next.faces || [];
        next.playtime = playtimeText || next.playtime || "";
        next.timestamp = now;
        all[slot] = next;

        const result = DataManager.saveGlobalInfo();
        if (result && typeof result.catch === "function") {
          result.catch((error) => {
            console.warn("[cheat plugin] 更新 MZ global 存档索引失败", error);
          });
        }

        return;
      }

      // MV：loadGlobalInfo / saveGlobalInfo 同步读写 global.rpgsave
      if (typeof DataManager.loadGlobalInfo !== "function") {
        return;
      }

      const all = DataManager.loadGlobalInfo() || [];
      const source = all[sourceSlot] || all[slot] || {};
      const next = { ...source };

      next.globalId = next.globalId ?? DataManager._globalId;
      next.title = next.title || $dataSystem?.gameTitle || "";
      next.characters = next.characters || [];
      next.faces = next.faces || [];
      next.playtime = playtimeText || next.playtime || "";
      next.timestamp = now;
      all[slot] = next;
      DataManager.saveGlobalInfo(all);
    } catch (error) {
      // 更新索引失败不能影响已经写好的存档
      console.warn("[cheat plugin] 更新 global 存档索引失败", error);
    }
  }

  // 还原快照。
  //
  // targetSlot 省略时写回快照自己的槽位（默认行为）；传入别的槽位就是
  // 「还原到自定义槽位」—— 用来把一份快照复制成另一个存档，原槽位不动。
  static restoreBackup(id, targetSlot = null) {
    const meta = this.readMeta(id);

    if (!meta) {
      throw new Error("快照不存在");
    }

    const sourceSlot = Number(meta.slot);
    if (!Number.isInteger(sourceSlot) || sourceSlot < 1) {
      throw new Error("快照记录的存档槽无效");
    }

    const slot =
      targetSlot === null || targetSlot === undefined
        ? sourceSlot
        : Number(targetSlot);

    if (!Number.isInteger(slot) || slot < 1) {
      throw new Error("目标存档槽必须是正整数");
    }

    const maxSavefiles = this.maxSavefiles();
    if (maxSavefiles > 0 && slot > maxSavefiles) {
      throw new Error(`目标槽位超出本游戏上限（最大 ${maxSavefiles}）`);
    }

    const isSameSlot = slot === sourceSlot;
    const jsonText = this.readPayload(meta);

    // 损坏 / 被替换的快照绝不能写回存档，先校验再备份。
    this.validateSaveText(jsonText, "快照数据");

    // 只在「会覆盖已有存档」时才留退路。写到空槽位不用备份，
    // 尤其不能去备份目标槽位 —— 那会凭空造出一份空快照。
    if (this.hasSave(slot)) {
      this.backupCurrentSave(slot);
    }

    this.writeSaveText(slot, jsonText);
    this.updateGlobalInfoAfterRestore(slot, sourceSlot, jsonText);
    this.touchBackup(id);

    // 覆盖的是内存里正在玩的那一份时，现在游玩的进度还没写盘，
    // 必须明确提示：先存档再读档，否则会看起来「还原没生效」。
    // 这里用对话框而不是 snackbar —— 这条提示错过就等于白还原一次。
    if (this.getLoadedSlot() === slot) {
      ConfirmDialog.show({
        width: 480,
        message:
          `存档 ${slot} 已还原到磁盘。\n\n但游戏内存里还是你正在玩的旧进度：\n` +
          "请在游戏内保存一次（或切到别的存档槽读取），再读取这个存档，改动才会生效。",
        actions: [
          {
            icon: "mdi-check",
            label: "知道了",
            color: "green",
            action: ConfirmDialog.close,
          },
        ],
      });
    } else if (isSameSlot) {
      Alert.success(`已还原存档 ${slot}（覆盖前已自动留了一份快照）`);
    } else {
      Alert.success(`已还原到存档 ${slot}（来自存档 ${sourceSlot} 的快照）`);
    }

    return { slot: slot, sourceSlot: sourceSlot, isSameSlot: isSameSlot };
  }

  static touchBackup(id) {
    try {
      const entries = this.readIndex();
      const entry = entries.find((item) => item.id === id);
      if (!entry) {
        return;
      }

      entry.restoredAt = Date.now();
      entry.restoreCount = (Number(entry.restoreCount) || 0) + 1;
      this.writeIndex(entries);

      const meta = this.readMeta(id);
      if (meta) {
        meta.restoredAt = entry.restoredAt;
        meta.restoreCount = entry.restoreCount;
        this.writeMeta(meta);
      }
    } catch (error) {
      // 统计信息写不进去不影响还原结果
      console.warn("[cheat plugin] 更新快照统计失败", error);
    }
  }

  /* --------------------------------------------------------- 复制到本地 */

  // 把「引擎真正在用的存档文件」复制一份到快照目录，方便手工备份 / 发给别人。
  // 这是唯一直接操作引擎存档路径的功能，失败不影响时间机器本身。
  static copySaveFileToLocal(slot) {
    if (!this.isLocalMode()) {
      throw new Error(WARN_NO_NWJS);
    }

    const fs = this.requireFs();
    const path = require("path");
    const source = this.getSaveFilePath(slot);

    if (!source || !fs.existsSync(source)) {
      throw new Error(`存档 ${slot} 的文件不存在`);
    }

    const stamp = this.formatTime(Date.now()).replace(/[: ]/g, "-");
    const extension = this.isMZ() ? ".rmmzsave" : ".rpgsave";
    const target = path.join(
      this.ensureBackupDir(),
      `save${slot}-${stamp}${extension}`,
    );

    fs.copyFileSync(source, target);

    return target;
  }
}

applyStaticMethods(SaveBackupCheat, SaveBackupFormat);
applyStaticMethods(SaveBackupCheat, SaveBackupCodec);
applyStaticMethods(SaveBackupCheat, SaveBackupStore);
applyStaticMethods(SaveBackupCheat, SaveBackupMetadata);
applyStaticMethods(SaveBackupCheat, SaveBackupTransfer);
applyStaticMethods(SaveBackupCheat, SaveBackupSettings);

SaveBackupCheat.installSaveHook();
