import { getCheatSettingsPath } from "../SettingsPath.js";

// 存档时间机器拆分为多个模块后共享的常量与路径。

export const BACKUP_KIND_AUTO = "auto";
export const BACKUP_KIND_MANUAL = "manual";

// 同一个存档槽默认保留的自动快照份数（可在面板里改，见 settings.js）
export const DEFAULT_AUTO_KEEP = 5;
export const MAX_NAME_LENGTH = 60;

// 导入导出的文件格式版本。只在格式发生不兼容变化时递增。
export const IMPORT_EXPORT_FORMAT = "cheat-save-backups";
export const IMPORT_EXPORT_VERSION = 1;

// 导入保护：先按文件大小拦截，避免 FileReader / JSON.parse 把超大文件
// 整个读进内存；再限制快照条数，避免一次导入写爆磁盘 / 长时间卡住主线程。
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
export const MAX_IMPORT_BACKUPS = 5000;

// 时间机器自身出问题时不静默：这些只是提示文案，不参与控制流
export const WARN_NO_NWJS = "当前环境不是 nw.js，无法读写快照文件";

export function getBackupDir() {
  return getCheatSettingsPath("save-backups");
}

export function getIndexFile() {
  return `${getBackupDir()}/index.json`;
}
