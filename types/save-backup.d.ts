// 存档时间机器拆分模块共享的静态方法集合。
//
// SaveBackupHelper 通过 applyStaticMethods() 把 codec / store / transfer 等模块的
// 静态方法挂到 SaveBackupCheat 上，运行时它们是同一个类；TypeScript 看不到这种
// 合并，因此用交叉类型描述「这些方法最终都会出现在同一个 this 上」。
type SaveBackupApi =
  typeof import("../cheat-engine/www/cheat/js/SaveBackupHelper.js").SaveBackupCheat &
    typeof import("../cheat-engine/www/cheat/js/save-backup/codec.js").SaveBackupCodec &
    typeof import("../cheat-engine/www/cheat/js/save-backup/format.js").SaveBackupFormat &
    typeof import("../cheat-engine/www/cheat/js/save-backup/metadata.js").SaveBackupMetadata &
    typeof import("../cheat-engine/www/cheat/js/save-backup/settings.js").SaveBackupSettings &
    typeof import("../cheat-engine/www/cheat/js/save-backup/store.js").SaveBackupStore &
    typeof import("../cheat-engine/www/cheat/js/save-backup/transfer.js").SaveBackupTransfer;
