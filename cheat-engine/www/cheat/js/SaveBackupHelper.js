import { Alert } from "./AlertHelper.js";
import { ConfirmDialog } from "./DialogHelper.js";

// 存档时间机器：把存档快照另存到 cheat 自己的目录，随时回滚。
//
// 设计要点：
//  1. 一切读写都走引擎自身的 StorageManager API（loadFromLocalFile /
//     saveToLocalFile / loadFromWebStorage / saveToWebStorage），这样：
//       - 部署方式是 file://（nw.js）还是 http://（浏览器/手机）都能工作；
//       - 压缩方式（MV/MZ 用 LZString base64、个别游戏用 pako）由引擎决定，
//         本模块不需要认识；
//       - 游戏插件覆写了 StorageManager 时依然正确。
//     唯一直接接触引擎存档路径的地方，是「复制存档文件」这个便利功能。
//  2. 快照索引（元数据）统一存在 ./www/cheat-settings/save-backups/index.json，
//     与 shortcuts.json / variable-locks.json 同一套路。
//  3. 每次还原前自动为「被覆盖的那一份」留一个 auto 快照并保留最近 N 份，
//     所以还原本身也不会把存档玩坏（可以再还原回去）。

const BACKUP_KIND_AUTO = "auto";
const BACKUP_KIND_MANUAL = "manual";

const BACKUP_DIR = "./www/cheat-settings/save-backups";
const INDEX_FILE = `${BACKUP_DIR}/index.json`;

// 同一个存档槽默认保留的自动快照份数（可在面板里改，见 getSettings）
const DEFAULT_AUTO_KEEP = 5;
const MAX_NAME_LENGTH = 60;

// 时间机器自身出问题时不静默：这些只是提示文案，不参与控制流
const WARN_NO_NWJS = "当前环境不是 nw.js，无法读写快照文件";

export class SaveBackupCheat {
  /* ------------------------------------------------------------------ 环境 */

  static isLocalMode() {
    try {
      // 快照功能依赖文件系统：真正决定能否用的是 require("fs") 能不能拿到，
      // 而不是 Utils.isNwjs()（后者只说明跑在 nw.js 里）
      return typeof require === "function" && !!this.requireFs();
    } catch (error) {
      return false;
    }
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
      if (typeof DataManager.loadSavefileInfo !== "function") {
        return null;
      }

      const info = DataManager.loadSavefileInfo(Number(slot));

      if (!info || typeof info !== "object") {
        return null;
      }

      const playtime = Number(info.playtime);
      const timestamp = Number(info.timestamp);

      return {
        playtimeFrames: Number.isFinite(playtime) ? playtime : 0,
        playtimeText: Number.isFinite(playtime) ? this.formatFrames(playtime) : "",
        timestamp: Number.isFinite(timestamp) ? timestamp : 0,
        timestampText: Number.isFinite(timestamp)
          ? this.formatDateTime(timestamp)
          : "",
      };
    } catch (error) {
      console.warn("[cheat plugin] DataManager.loadSavefileInfo 读取失败", error);
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

        return this.decodeSaveText(
          fs.readFileSync(filePath, { encoding: "utf8" }),
          "存档数据",
        );
      }

      // 浏览器 / 手机：引擎已经把 web storage 里的数据解压成字符串了
      return StorageManager.loadFromWebStorage(slot);
    } catch (error) {
      console.warn("[cheat plugin] 读取存档数据失败", error);
      return null;
    }
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

    // 交给引擎自己的 API 写，压缩方式与 .bak 维护都由引擎负责
    if (this.isLocalMode()) {
      StorageManager.saveToLocalFile(slot, jsonText);
      return;
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
      const payloadFile = entry.payloadFile || this.getPayloadPath(entry.id);
      return !!(payloadFile && fs.existsSync(payloadFile));
    } catch (error) {
      return false;
    }
  }

  static getSaveFilePath(slot) {
    if (!this.isLocalMode()) {
      return null;
    }

    try {
      if (typeof StorageManager.localFilePath === "function") {
        const filePath = StorageManager.localFilePath(slot);
        if (typeof filePath === "string" && filePath.length > 0) {
          return filePath;
        }
      }
    } catch (error) {
      console.warn("[cheat plugin] StorageManager.localFilePath 调用失败", error);
    }

    // 兜底：MV/MZ 默认都是 <游戏根>/save/file%1.rpgsave。
    // localFileDirectoryPath 内部用 process.mainModule（新版 nw.js 已移除该字段），
    // 部分游戏在这里会抛错，所以必须留这条路径。
    try {
      const path = require("path");
      const base = process.cwd();
      return path.join(base, "www", "save", `file${slot}.rpgsave`);
    } catch (error) {
      return null;
    }
  }

  /* --------------------------------------------------------- 压缩 / 工具 */

  // 找 LZString。
  //
  // 不能只看全局变量：MV/MZ 的 www/js/libs/lz-string.js 是 UMD 包装，在 nw.js
  // 下走 `module.exports` 分支，**不会**挂到 window 上（只有浏览器里才挂）。
  // 这时全局取不到，而引擎自己的 StorageManager 是通过模块作用域拿到它的。
  // 取不到就会退化成「裸 base64」，解出来是乱码 → JSON.parse 失败 →
  // 地图名/时长全部读不出来（这正是此前存档内进度只剩大小的原因）。
  static getLZString() {
    if (this.lzStringCache !== undefined) {
      return this.lzStringCache;
    }

    this.lzStringCache = this.resolveLZString();
    return this.lzStringCache;
  }

  static resolveLZString() {
    try {
      if (typeof globalThis !== "undefined" && globalThis.LZString) {
        return globalThis.LZString;
      }
    } catch (error) {
      // 忽略，继续试其它来源
    }

    try {
      if (typeof LZString !== "undefined" && LZString) {
        return LZString;
      }
    } catch (error) {
      // 未声明，继续
    }

    // nw.js：lz-string.js 是 UMD，只挂了 module.exports；不同游戏放在
    // www/js/libs/（MV）或 js/libs/（MZ），两个都试一下
    for (const candidate of ["./js/libs/lz-string.js", "./www/js/libs/lz-string.js"]) {
      try {
        const loaded = require(candidate);

        if (loaded && typeof loaded.decompressFromBase64 === "function") {
          return loaded;
        }
      } catch (error) {
        // 路径因游戏而异，失败就试下一个
      }
    }

    return null;
  }

  // 快照文件的编码格式刻意与 .rpgsave 保持一致（LZString base64），
  // 这样快照既能被本插件读写，也能直接改名成 fileN.rpgsave 放回存档目录。
  static encodeSaveText(jsonText) {
    const lz = this.getLZString();

    try {
      if (lz && typeof lz.compressToBase64 === "function") {
        return lz.compressToBase64(jsonText);
      }

      // 拿不到 LZString 的极端情况：用 UTF-8 安全的 base64 包一层
      const bytes = new TextEncoder().encode(String(jsonText));
      let binary = "";

      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }

      return btoa(binary);
    } catch (error) {
      console.warn("[cheat plugin] 压缩存档数据失败", error);
      return null;
    }
  }

  static decodeSaveText(base64Text, label = "存档数据") {
    if (base64Text === null || base64Text === undefined || base64Text === "") {
      return null;
    }

    const lz = this.getLZString();

    if (lz && typeof lz.decompressFromBase64 === "function") {
      try {
        const text = lz.decompressFromBase64(base64Text);

        if (typeof text === "string" && text.length > 0) {
          return text;
        }
      } catch (error) {
        console.warn(`[cheat plugin] ${label} LZString 解码异常`, error);
      }
    }

    // 没有 LZString（或解不出来）时退化成裸 base64：只有游戏本身存的就是
    // 未压缩 base64 才能成功，否则后面 JSON.parse 会失败并留下警告
    try {
      const fallback = new TextDecoder().decode(
        Uint8Array.from(atob(base64Text), (c) => c.charCodeAt(0)),
      );

      if (typeof fallback === "string" && fallback.length > 0) {
        console.warn(
          `[cheat plugin] ${label} 未经 LZString 解码（游戏未提供 LZString），` +
            "若存档是 LZString 压缩的，元数据会读不出来（快照与还原不受影响）",
        );
        return fallback;
      }
    } catch (error) {
      console.warn(`[cheat plugin] ${label} base64 解码失败`, error);
    }

    return null;
  }

  static requireFs() {
    return require("fs");
  }

  static formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) {
      return "-";
    }

    if (value < 1024) {
      return `${value} B`;
    }

    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }

    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  }

  // 存档头部记录的时间用本地格式展示（比 toLocaleString 更紧凑、跨平台一致）
  static formatDateTime(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) {
      return "";
    }

    return this.formatTime(value).slice(5); // 去掉年份：10-01 19:50:55
  }

  // 快照列表 / 还原确认框用的「存档时间」文案，兼容几种历史字段
  static getSaveTimeText(item) {
    if (!item) {
      return "";
    }

    return (
      item.savefileTimeText ||
      this.formatDateTime(item.savefileTime) ||
      item.saveTime ||
      ""
    );
  }

  static formatTime(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) {
      return "-";
    }

    const date = new Date(value);
    const pad = (n) => String(n).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate(),
    )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
      date.getSeconds(),
    )}`;
  }

  static formatRelative(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) {
      return "";
    }

    const diff = Date.now() - value;
    if (diff < 0) {
      return "刚刚";
    }

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) {
      return "刚刚";
    }

    if (diff < hour) {
      return `${Math.floor(diff / minute)} 分钟前`;
    }

    if (diff < day) {
      return `${Math.floor(diff / hour)} 小时前`;
    }

    return `${Math.floor(diff / day)} 天前`;
  }

  /* ----------------------------------------------------------- 索引读写 */

  static readIndex() {
    const fs = this.requireFs();
    let data = [];

    try {
      if (fs.existsSync(INDEX_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8"));
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
        typeof item.id === "string" &&
        item.id.length > 0 &&
        Number.isInteger(item.slot) &&
        item.slot >= 1,
    );
  }

  static writeIndex(entries) {
    const fs = this.requireFs();
    this.ensureBackupDir();

    if (!Array.isArray(entries) || entries.length === 0) {
      // 没有条目时直接重建空索引，避免留下上一位玩家的残留
      fs.writeFileSync(INDEX_FILE, "[]", "utf-8");
      return;
    }

    // 先写临时文件再改名：写一半崩掉也不会毁掉整个索引
    const tmpFile = `${INDEX_FILE}.tmp`;

    try {
      fs.writeFileSync(tmpFile, JSON.stringify(entries, null, 2), "utf-8");
      fs.renameSync(tmpFile, INDEX_FILE);
    } catch (error) {
      try {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
        }
      } catch (cleanupError) {
        // 清不掉临时文件不影响主流程
      }
      throw error;
    }
  }

  static getMetaPath(id) {
    return `${BACKUP_DIR}/${id}.json`;
  }

  static getPayloadPath(id) {
    return `${BACKUP_DIR}/${id}.rpgsave`;
  }

  static ensureBackupDir() {
    const fs = this.requireFs();
    const path = require("path");
    const dir = path.dirname(INDEX_FILE);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return dir;
  }

  static writeMeta(meta) {
    const fs = this.requireFs();
    const path = require("path");
    const file = this.getMetaPath(meta.id);

    if (!fs.existsSync(path.dirname(file))) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    }

    fs.writeFileSync(file, JSON.stringify(meta, null, 2), "utf-8");
  }

  static readMeta(id) {
    const fs = this.requireFs();
    const path = require("path");
    const file = this.getMetaPath(id);
    let meta = null;

    try {
      if (path.isAbsolute(file) && fs.existsSync(file)) {
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
    const fs = this.requireFs();
    const path = require("path");
    const payloadFile = this.getPayloadPath(meta.id);

    if (!fs.existsSync(path.dirname(payloadFile))) {
      fs.mkdirSync(path.dirname(payloadFile), { recursive: true });
    }

    const encoded = this.encodeSaveText(jsonText);
    if (!encoded) {
      throw new Error("压缩存档数据失败，无法写入快照");
    }

    fs.writeFileSync(payloadFile, encoded, "utf-8");

    if (meta.payloadFile !== payloadFile) {
      meta.payloadFile = payloadFile;
      meta.payloadSize = encoded.length;
      this.writeMeta(meta);
    }
  }

  // 返回快照里存的明文 JSON 文本，直接可以交给 writeSaveText
  static readPayload(meta) {
    const fs = this.requireFs();
    const payloadFile = meta.payloadFile || this.getPayloadPath(meta.id);

    if (!payloadFile || !fs.existsSync(payloadFile)) {
      throw new Error("快照数据文件已被删除或移动");
    }

    const jsonText = this.decodeSaveText(
      fs.readFileSync(payloadFile, "utf-8"),
    );

    if (typeof jsonText !== "string" || jsonText.length === 0) {
      throw new Error("快照数据解压失败（可能是 LZString 不兼容）");
    }

    return jsonText;
  }

  /* --------------------------------------------------------- 元数据展示 */

  // 尽量取出「跟游戏内读取列表一致」的信息。
  //
  // 来源优先级：
  //   1. DataManager.loadSavefileInfo —— 引擎自己读存档头，游戏时长 / 存档时间
  //      与菜单完全一致，而且不依赖整份存档能解压；
  //   2. 自己解压整份存档 —— 用来补 savefileInfo 里没有的地图信息（尽力而为）。
  // 任何一步失败都只是少几个展示字段，绝不影响快照本身。
  static parseSaveMeta(slot) {
    const meta = {
      slot: slot,
      mapId: 0,
      mapName: "",
      savefileTime: 0,
      savefileTimeText: "",
      saveTime: "",
      playtimeFrames: 0,
      playtime: "",
      dataSize: 0,
    };

    const info = this.readSavefileInfo(slot);
    if (info) {
      meta.savefileTime = info.timestamp;
      meta.savefileTimeText = info.timestampText;
      meta.playtimeFrames = info.playtimeFrames;
      meta.playtime = info.playtimeText;
    }

    let saveObject = null;

    if (this.isLocalMode()) {
      try {
        const filePath = this.getSaveFilePath(slot);
        const fs = this.requireFs();

        if (filePath && fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, "utf-8");
          meta.dataSize = raw.length;
          saveObject = this.parseAnySaveData(
            this.decodeSaveText(raw, "存档数据"),
          );
        }
      } catch (error) {
        // 存档损坏 / 压缩方式不认识（如 pako）都只影响展示，不影响快照本身
        console.warn("[cheat plugin] 解析存档元数据失败，仅保留存档头信息", error);
      }
    } else {
      try {
        const text = this.readSaveText(slot);
        if (text) {
          meta.dataSize = text.length;
          saveObject = this.parseAnySaveData(text);
        }
      } catch (error) {
        console.warn("[cheat plugin] 解析存档元数据失败，仅保留存档头信息", error);
      }
    }

    if (!saveObject || typeof saveObject !== "object") {
      return meta;
    }

    try {
      // 地图 ID 的位置因引擎版本 / 插件而异：
      //   标准 MV/MZ：player.map._mapId
      //   另一些版本：顶层 map._mapId（实测「芙兰与罪人之岛」就是这种）
      const mapId =
        Number(saveObject.player && saveObject.player.map && saveObject.player.map._mapId) ||
        Number(saveObject.map && saveObject.map._mapId) ||
        0;

      if (Number.isFinite(mapId) && mapId > 0) {
        meta.mapId = mapId;
        const mapInfo = this.getMapInfo(mapId);
        meta.mapName = mapInfo ? mapInfo.name : "";
      }

      // 有些存档的 Game_System 根本没有 _playtime（老版本 MV），此时
      // 只有 global.rpgsave 的存档头里有值，那份由 backfill 用存档头补
      const system = saveObject.system;
      if (!meta.playtime && system && Number.isFinite(system._playtime)) {
        meta.playtimeFrames = Number(system._playtime);
        meta.playtime = this.formatFrames(system._playtime);
      }
    } catch (error) {
      console.warn("[cheat plugin] 读取存档字段失败", error);
    }

    try {
      if (!meta.savefileTimeText && Number.isFinite(saveObject.saveTime) && saveObject.saveTime > 0) {
        meta.savefileTime = Number(saveObject.saveTime);
        meta.savefileTimeText = this.formatDateTime(saveObject.saveTime);
      } else if (
        !meta.savefileTimeText &&
        Number.isFinite(saveObject.timestamp) &&
        saveObject.timestamp > 0
      ) {
        meta.savefileTime = Number(saveObject.timestamp);
        meta.savefileTimeText = this.formatDateTime(saveObject.timestamp);
      } else if (typeof saveObject.saveTime === "string") {
        meta.saveTime = saveObject.saveTime;
      }
    } catch (error) {
      // 时间只用于展示，解析失败就算了
    }

    return meta;
  }

  static parseAnySaveData(raw) {
    if (raw === null || raw === undefined || raw === "") {
      return null;
    }

    if (typeof raw === "object") {
      return raw;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      // 有些游戏存档最外层还包了一层，交给 JsonEx 再试一次
      try {
        if (typeof JsonEx !== "undefined" && JsonEx.parse) {
          return JsonEx.parse(raw);
        }
      } catch (innerError) {
        console.warn("[cheat plugin] 存档不是可解析的 JSON", innerError);
      }
    }

    return null;
  }

  static getMapInfo(mapId) {
    try {
      if (
        typeof $dataMapInfos !== "undefined" &&
        $dataMapInfos &&
        $dataMapInfos[mapId]
      ) {
        return $dataMapInfos[mapId];
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  static formatFrames(frames) {
    const value = Number(frames);
    // 0 帧视为「没有记录」而不是 00:00:00 —— 旧快照 / 读不到存档头时
    // 会走到这里，显示 00:00:00 会让人误以为存档真的没有游玩时长
    if (!Number.isFinite(value) || value <= 0) {
      return "";
    }

    const total = Math.floor(value / 60);
    const seconds = total % 60;
    const minutes = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3600);
    const pad = (n) => String(n).padStart(2, "0");

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  /* ------------------------------------------------------------- 快照 */

  static listBackups() {
    if (!this.isLocalMode()) {
      return [];
    }

    try {
      return this.readIndex()
        .map((entry) => {
          const payloadFile = entry.payloadFile || this.getPayloadPath(entry.id);
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
      const hasSaveTime = Number(entry.savefileTime) > 0 || !!entry.savefileTimeText;

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
      const payloadFile = entry.payloadFile || this.getPayloadPath(entry.id);
      if (!Number.isInteger(slot) || slot < 1 || !payloadFile) {
        continue;
      }

      // 只有「快照之后这个槽位被重新存过档」时，当前存档里的地图才代表快照里的地图。
      // 否则（快照比存档新）说明快照拍的进度比磁盘上那份更靠后，回填会写错。
      const savePath = this.getSaveFilePath(slot);
      if (!savePath || !fs.existsSync(savePath) || !fs.existsSync(payloadFile)) {
        continue;
      }

      let changed = false;

      try {
        const saveMtime = fs.statSync(savePath).mtimeMs;
        const snapshotTime = Number(entry.createdAt) || 0;

        if (!(saveMtime >= snapshotTime - 2000)) {
          continue;
        }

        const jsonText = this.decodeSaveText(
          fs.readFileSync(payloadFile, "utf-8"),
          "快照数据",
        );
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

        if (changed) {
          entry.payloadBackfillChecked = true;
          anyChanged = true;

          const meta = this.readMeta(entry.id);
          if (meta) {
            meta.mapId = entry.mapId;
            meta.mapName = entry.mapName;
            meta.playtimeFrames = entry.playtimeFrames;
            meta.playtime = entry.playtime;
            this.writeMeta(meta);
          }
        }
      } catch (error) {
        console.warn("[cheat plugin] 从快照数据回填元数据失败", entry.id, error);
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
      autoCount: entries.filter((item) => item.kind === BACKUP_KIND_AUTO).length,
      manualCount: entries.filter((item) => item.kind === BACKUP_KIND_MANUAL)
        .length,
      missingCount: entries.filter((item) => !this.isSnapshotPresent(item)).length,
      bytes: entries.reduce((sum, item) => sum + (Number(item.sizeBytes) || 0), 0),
    };
  }

  static generateId(kind, slot, existingIds) {
    let id = "";

    for (let i = 0; i < 5; i++) {
      id = `${kind}-s${slot}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;

      if (!existingIds || !existingIds.has(id)) {
        return id;
      }
    }

    return id;
  }

  static createSnapshot(slot, kind = BACKUP_KIND_MANUAL, label = "", options = {}) {
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
    const meta = {
      id: this.generateId(kind, slot, new Set(entries.map((e) => e.id))),
      slot: slot,
      kind: kind,
      createdAt: Date.now(),
      label: String(label || "").slice(0, MAX_NAME_LENGTH),
      sizeBytes: text.length,
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
    const files = [
      entry.payloadFile || this.getPayloadPath(entry.id),
      this.getMetaPath(entry.id),
    ];

    for (const file of files) {
      try {
        if (file && fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        console.warn("[cheat plugin] 删除快照文件失败", file, error);
      }
    }
  }

  static renameBackup(id, newLabel) {
    const label = String(newLabel || "").trim().slice(0, MAX_NAME_LENGTH);
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
    const targets = kind ? entries.filter((item) => item.kind === kind) : entries;

    for (const entry of targets) {
      this.removeSnapshotFiles(entry);
    }

    this.writeIndex(
      kind ? entries.filter((item) => item.kind !== kind) : [],
    );

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
      .filter((entry) => Number(entry.slot) === key && entry.kind === BACKUP_KIND_AUTO)
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));

    return autos.length > 0 ? autos[0] : null;
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

    // 只在「会覆盖已有存档」时才留退路。写到空槽位不用备份，
    // 尤其不能去备份目标槽位 —— 那会凭空造出一份空快照。
    if (this.hasSave(slot)) {
      this.backupCurrentSave(slot);
    }

    this.writeSaveText(slot, jsonText);
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
    const target = path.join(
      this.ensureBackupDir(),
      `save${slot}-${stamp}.rpgsave`,
    );

    fs.copyFileSync(source, target);

    return target;
  }

  /* --------------------------------------------------------- 导入 / 导出 */

  // 导出到快照目录下的一个 json 文件（含全部快照的原始数据），返回值供界面展示路径
  static exportAll() {
    if (!this.isLocalMode()) {
      throw new Error(WARN_NO_NWJS);
    }

    const fs = this.requireFs();
    const path = require("path");
    const dir = this.ensureBackupDir();

    const stamp = this.formatTime(Date.now()).replace(/[: ]/g, "-");
    const file = path.join(dir, `cheat-save-backups-${stamp}.json`);
    const payload = {
      format: "cheat-save-backups",
      version: 1,
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

    fs.writeFileSync(file, JSON.stringify(payload), "utf-8");

    return file;
  }

  // 返回 { added, skipped }；不覆盖已有快照，避免导入把现有记录冲掉
  static importFromJson(text) {
    if (!this.isLocalMode()) {
      throw new Error(WARN_NO_NWJS);
    }

    let parsed = null;

    try {
      parsed = JSON.parse(String(text || ""));
    } catch (error) {
      throw new Error("文件不是合法的 JSON");
    }

    if (
      !parsed ||
      parsed.format !== "cheat-save-backups" ||
      !Array.isArray(parsed.backups)
    ) {
      throw new Error("不是本插件导出的存档快照文件");
    }

    const entries = this.readIndex();
    const knownIds = new Set(entries.map((entry) => entry.id));
    let added = 0;
    let skipped = 0;

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

      const id = this.generateId(
        item.meta.kind === BACKUP_KIND_AUTO ? BACKUP_KIND_AUTO : BACKUP_KIND_MANUAL,
        slot,
        knownIds,
      );

      knownIds.add(id);

      const meta = {
        id: id,
        slot: slot,
        kind: item.meta.kind === BACKUP_KIND_AUTO ? BACKUP_KIND_AUTO : BACKUP_KIND_MANUAL,
        createdAt: Number(item.meta.createdAt) || Date.now(),
        label: String(item.meta.label || "").slice(0, MAX_NAME_LENGTH),
        sizeBytes: item.data.length,
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

      this.writePayload(meta, item.data);

      entries.push({
        ...meta,
        payloadFile: meta.payloadFile,
      });

      added++;
    }

    this.writeIndex(entries);

    return { added: added, skipped: skipped };
  }

  /* --------------------------------------------------------- 设置 + 自动快照 */

  static getSettingsPath() {
    return `${BACKUP_DIR}/config.json`;
  }

  static getDefaultSettings() {
    return {
      // 默认关闭：不主动往玩家硬盘里写东西，需要的人在面板上一键打开。
      // 「还原前快照」不受这个开关影响，始终保留（否则还原就没有退路了）。
      autoOnSave: false,
      // 每 N 次存档留一份（1 = 每次存档都留）
      autoSaveInterval: 1,
      // 同一个存档槽保留的自动快照份数
      autoKeep: DEFAULT_AUTO_KEEP,
    };
  }

  static getSettings() {
    const defaults = this.getDefaultSettings();

    if (!this.isLocalMode()) {
      return defaults;
    }

    try {
      const fs = this.requireFs();
      const file = this.getSettingsPath();

      if (!fs.existsSync(file)) {
        return defaults;
      }

      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        console.warn("[cheat plugin] 快照设置结构异常，已用默认值");
        return defaults;
      }

      const interval = Number(parsed.autoSaveInterval);

      return {
        autoOnSave: parsed.autoOnSave !== false,
        autoSaveInterval:
          Number.isInteger(interval) && interval >= 1 && interval <= 100
            ? interval
            : defaults.autoSaveInterval,
        autoKeep:
          Number.isInteger(Number(parsed.autoKeep)) &&
          Number(parsed.autoKeep) >= 1 &&
          Number(parsed.autoKeep) <= 100
            ? Number(parsed.autoKeep)
            : defaults.autoKeep,
      };
    } catch (error) {
      // 设置读不出来不能连累存档本身
      console.warn("[cheat plugin] 读取快照设置失败，已用默认值", error);
      return defaults;
    }
  }

  static writeSettings(patch) {
    if (!this.isLocalMode()) {
      throw new Error(WARN_NO_NWJS);
    }

    const next = { ...this.getSettings(), ...(patch || {}) };
    const fs = this.requireFs();

    this.ensureBackupDir();
    fs.writeFileSync(this.getSettingsPath(), JSON.stringify(next, null, 2), "utf-8");

    return next;
  }

  static isAutoOnSaveEnabled() {
    return this.getSettings().autoOnSave === true;
  }

  // $gameSystem._saveCount：引擎自己维护的存档次数，用来判断
  // 「这份快照对应第几次存档」以及去重。读不到时返回 0。
  static getSaveCount() {
    try {
      const value = Number($gameSystem && $gameSystem._saveCount);
      return Number.isFinite(value) ? value : 0;
    } catch (error) {
      return 0;
    }
  }

  static getAutoSnapshotMarker() {
    if (!this.autoSnapshotMarker) {
      this.autoSnapshotMarker = new Map();
    }

    return this.autoSnapshotMarker;
  }

  // 记录「这个槽位已经因为第 saveCount 次存档留过档了」。
  // 存档后钩子与还原前快照共用这份记录，保证同一次存档不会留两份。
  static markAutoSnapshot(slot, saveCount) {
    const key = Number(slot);

    if (!Number.isInteger(key) || key < 1) {
      return;
    }

    this.getAutoSnapshotMarker().set(key, Number(saveCount) || 0);
  }

  // 由 DataManager.saveGame 的钩子调用。
  // 除了设置开关，还有两道保险：
  //  1. 用 $gameSystem._saveCount 去重 —— 保证「一次存档 = 最多一份快照」，
  //     存档流程内部再调一次 saveGame 也不会重复留档；
  //  2. 按 autoSaveInterval 节流，给「每次存档都留太占地方」的玩家一个旋钮。
  static onGameSave(savefileId) {
    const slot = Number(savefileId);

    if (!this.isLocalMode() || !Number.isInteger(slot) || slot < 1) {
      return null;
    }

    const settings = this.getSettings();

    if (!settings.autoOnSave) {
      return null;
    }

    // 存档后引擎的存档头已经写好，这里读到的时长 / 时间就是刚存下的那份
    const saveCount = this.getSaveCount();

    if (this.getAutoSnapshotMarker().get(slot) === saveCount) {
      return null;
    }

    // 节流：只在「存档次数是 N 的整数倍」时留档（N=1 即每次都留）。
    // 注意这里的语义是「每 N 次存档留一份」而不是「开启后每 N 次」，
    // 所以换 N 之后触发点会跟着变。
    if (saveCount > 0 && saveCount % settings.autoSaveInterval !== 0) {
      return null;
    }

    try {
      const meta = this.createSnapshot(slot, BACKUP_KIND_AUTO, "", {
        saveCount: saveCount,
      });

      this.markAutoSnapshot(slot, saveCount);

      return meta;
    } catch (error) {
      // 自动快照失败绝不能影响游戏本身的存档流程
      console.warn("[cheat plugin] 存档后自动快照失败（不影响游戏存档）", error);
      return null;
    }
  }

  // 接管引擎的存档函数。只在能拿到 DataManager 时执行，且只包一层。
  static installSaveHook() {
    if (this.saveHookInstalled) {
      return false;
    }

    if (typeof DataManager === "undefined" || !DataManager) {
      return false;
    }

    if (typeof DataManager.saveGame !== "function") {
      return false;
    }

    const original = DataManager.saveGame;

    DataManager.saveGame = function (savefileId) {
      const result = original.apply(this, arguments);

      try {
        // result 为 false 表示存档失败，此时不该留快照
        if (result !== false) {
          SaveBackupCheat.onGameSave(savefileId);
        }
      } catch (error) {
        console.warn("[cheat plugin] 存档后自动快照异常（不影响游戏存档）", error);
      }

      return result;
    };

    this.saveHookOriginal = original;
    this.saveHookInstalled = true;

    return true;
  }
}

SaveBackupCheat.installSaveHook();

