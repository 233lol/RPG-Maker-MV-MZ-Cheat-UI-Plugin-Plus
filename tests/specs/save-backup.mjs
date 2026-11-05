import assert from "node:assert/strict";

export function registerSaveBackup({ test, page, type }) {
  test("存档时间机器：保存 / 快照 / 还原 / 复制到其他槽 / 导入导出", async () => {
    const result = await page.evaluate(async () => {
      const base = document.baseURI;
      const { SceneCheat } = await import(
        new URL("cheat/js/CheatHelper.js", base).href
      );
      const { SaveBackupCheat: Backups } = await import(
        new URL("cheat/js/SaveBackupHelper.js", base).href
      );
      const api = window.__cheatTest;
      const fs = require("fs");

      const slots = api.findFreeSlots(2);
      if (slots.length < 2) {
        throw new Error("没有足够的空闲存档槽用于测试");
      }

      const [slotA, slotB] = slots;
      const defaultAutoOnSave = Backups.getSettings().autoOnSave;
      const originalGold = $gameParty.gold();
      let exportPath = null;
      let copiedPath = null;

      const readGold = (slot) => {
        try {
          const text = Backups.readSaveText(slot);
          if (!text) return null;
          const data = JSON.parse(text);
          return data.party?._gold ?? data.party?.gold ?? null;
        } catch (error) {
          return null;
        }
      };

      const save = async (gold) => {
        $gameParty._gold = gold;
        SceneCheat.quickSave(slotA);

        const written = await api.waitFor(
          () => readGold(slotA) === gold,
          15000,
          100,
        );

        if (!written) {
          throw new Error(`存档 ${slotA} 没有在 15 秒内写入金币 ${gold}`);
        }
      };

      const cleanup = () => {
        try {
          Backups.clearBackups();
        } catch (error) {
          // ignore
        }

        for (const file of [exportPath, copiedPath]) {
          if (!file) continue;
          try {
            fs.unlinkSync(file);
          } catch (error) {
            // ignore
          }
        }

        for (const slot of [slotA, slotB]) {
          const file = Backups.getSaveFilePath(slot);
          if (file) {
            for (const candidate of [file, `${file}.bak`, `${file}_`]) {
              try {
                fs.unlinkSync(candidate);
              } catch (error) {
                // ignore
              }
            }
          }
        }

        $gameParty._gold = originalGold;
      };

      try {
        await save(111);
        const goldAfterFirstSave = readGold(slotA);
        const meta = Backups.createSnapshot(slotA, "manual", "auto-test");
        const snapshotGold = JSON.parse(Backups.readPayload(meta)).party?._gold;

        await save(999);
        const goldBeforeRestore = readGold(slotA);

        Backups.restoreBackup(meta.id);
        await api.waitFor(() => readGold(slotA) === 111, 5000, 100);
        const goldAfterRestore = readGold(slotA);

        Backups.restoreBackup(meta.id, slotB);
        await api.waitFor(() => readGold(slotB) === 111, 5000, 100);
        const goldAfterCopy = readGold(slotB);

        Backups.renameBackup(meta.id, "renamed");
        const renamed = Backups.listBackups().find(
          (item) => item.id === meta.id,
        );
        const renamedMeta = Backups.readMeta(meta.id);

        const globalInfo = DataManager.savefileInfo
          ? DataManager.savefileInfo(slotB)
          : DataManager.loadSavefileInfo(slotB);

        const listBeforeExport = Backups.listBackups().length;
        const payloadPresent = Backups.listBackups().every((item) =>
          Backups.isSnapshotPresent(item),
        );

        // 快照载荷必须能被引擎直接当作存档文件读取（MZ .rmmzsave / MV .rpgsave）。
        // 放在 clearBackups / import 之前，此时原始载荷还在。
        fs.copyFileSync(meta.payloadFile, Backups.getSaveFilePath(slotB));
        const nativeSnapshotGold = readGold(slotB);

        // payloadFile / 快照 ID 不能把读写引到 save-backups/ 之外
        const insideAccepted = Backups.isPathInsideBackupDir(meta.payloadFile);
        const outsideRejected = !Backups.isPathInsideBackupDir(
          require("path").resolve(process.cwd(), "..", "evil-snapshot.json"),
        );
        const invalidIdRejected =
          !Backups.isValidSnapshotId("../evil") &&
          !Backups.isValidSnapshotId("..\\evil") &&
          !Backups.isValidSnapshotId("C:\\evil");

        exportPath = Backups.exportAll();
        const exportText = fs.readFileSync(exportPath, "utf-8");
        Backups.clearBackups();
        const imported = Backups.importFromJson(exportText);
        const listAfterImport = Backups.listBackups();

        // 结构不对的导入数据必须被跳过，不能写出读档必崩的快照
        const listAfterValidImport = listAfterImport.length;
        const invalidImport = Backups.importFromJson(
          JSON.stringify({
            format: "cheat-save-backups",
            version: 1,
            backups: [
              {
                meta: { slot: slotB, kind: "manual", label: "broken" },
                data: '{"nope":1}',
              },
            ],
          }),
        );
        const listAfterInvalidImport = Backups.listBackups().length;

        copiedPath = Backups.copySaveFileToLocal(slotA);
        const copiedExists = fs.existsSync(copiedPath);

        const quickLoadStarted = Date.now();
        const quickLoadOk = await SceneCheat.quickLoad(slotA);
        const quickLoadGold = await api.waitFor(
          () => ($gameParty.gold() === 111 ? $gameParty.gold() : null),
          15000,
          100,
        );

        // 自动快照钩子：MZ 的 saveGame 返回 Promise，必须等真正写盘后再快照
        Backups.writeSettings({
          autoOnSave: true,
          autoSaveInterval: 1,
          autoKeep: 5,
        });
        const autoBefore = Backups.listBackups().filter(
          (item) => item.kind === "auto" && item.slot === slotB,
        ).length;
        const autoSaveOk = await SceneCheat.quickSave(slotB);
        const autoAfter = await api.waitFor(
          () => {
            const count = Backups.listBackups().filter(
              (item) => item.kind === "auto" && item.slot === slotB,
            ).length;
            return count > autoBefore ? count : null;
          },
          15000,
          100,
        );
        // 自动快照保留份数：每个槽只保留最近 N 份，手动快照不受影响
        const manualBeforeRetention = Backups.listBackups().filter(
          (item) => item.kind === "manual",
        ).length;

        Backups.writeSettings({
          autoOnSave: false,
          autoSaveInterval: 1,
          autoKeep: 1,
        });
        const retentionSeeds = [];

        for (let i = 0; i < 3; i++) {
          retentionSeeds.push(
            Backups.createSnapshot(slotB, "auto", `retention-${i}`),
          );
          await new Promise((resolve) => setTimeout(resolve, 5));
        }

        const autosForSlot = Backups.listBackups().filter(
          (item) => item.kind === "auto" && item.slot === slotB,
        );
        const retentionKept = autosForSlot.length;
        const retentionNewestKept =
          autosForSlot[0]?.id === retentionSeeds[2].id;
        const retentionPruned = retentionSeeds
          .slice(0, 2)
          .every((item) => !Backups.isSnapshotPresent(item));
        const manualAfterRetention = Backups.listBackups().filter(
          (item) => item.kind === "manual",
        ).length;

        Backups.writeSettings({
          autoOnSave: false,
          autoSaveInterval: 1,
          autoKeep: 5,
        });

        // 结构损坏的快照不能写回存档
        const corruptSnapshot = Backups.createSnapshot(
          slotB,
          "manual",
          "corrupt",
        );
        fs.writeFileSync(
          corruptSnapshot.payloadFile,
          Backups.encodePayloadText('{"nope":1}', corruptSnapshot.codec),
          "utf-8",
        );

        let corruptRestoreRejected = false;
        let corruptErrorMessage = "";

        try {
          Backups.restoreBackup(corruptSnapshot.id, slotB);
        } catch (error) {
          corruptRestoreRejected = true;
          corruptErrorMessage = String(error.message || error);
        }

        const goldAfterCorruptRestore = readGold(slotB);
        Backups.deleteBackup(corruptSnapshot.id);

        return {
          slotA,
          slotB,
          defaultAutoOnSave,
          goldAfterFirstSave,
          snapshotGold,
          goldBeforeRestore,
          goldAfterRestore,
          goldAfterCopy,
          snapshotId: meta.id,
          snapshotSize: meta.sizeBytes,
          snapshotMapName: meta.mapName,
          snapshotCodec: meta.codec,
          snapshotExt: meta.saveExt,
          snapshotPayloadExt: meta.payloadFile?.endsWith(".rmmzsave")
            ? ".rmmzsave"
            : meta.payloadFile?.endsWith(".rpgsave")
              ? ".rpgsave"
              : "",
          nativeSnapshotGold,
          insideAccepted,
          outsideRejected,
          invalidIdRejected,
          renamedLabel: renamed?.label,
          renamedMetaLabel: renamedMeta?.label,
          globalInfoPresent: !!globalInfo,
          payloadPresent,
          listBeforeExport,
          imported,
          listAfterImport: listAfterImport.length,
          listAfterValidImport,
          invalidImportAdded: invalidImport.added,
          invalidImportSkipped: invalidImport.skipped,
          listAfterInvalidImport,
          corruptRestoreRejected,
          corruptErrorMessage,
          goldAfterCorruptRestore,
          copiedPath,
          copiedExists,
          quickLoadOk,
          quickLoadGold,
          quickLoadMs: Date.now() - quickLoadStarted,
          autoSaveOk,
          autoSnapshotAdded: autoAfter > autoBefore,
          retentionKept,
          retentionNewestKept,
          retentionPruned,
          manualBeforeRetention,
          manualAfterRetention,
        };
      } finally {
        cleanup();
      }
    });

    assert.equal(result.goldAfterFirstSave, 111, "第一次存档内容不正确");
    assert.equal(result.defaultAutoOnSave, false, "自动快照默认应关闭");
    assert.equal(result.snapshotGold, 111, "快照里保存的金币不正确");
    assert.ok(result.snapshotId, "快照没有生成 ID");
    assert.ok(result.snapshotSize > 0, "快照文件大小为空");
    assert.ok(result.snapshotMapName, "快照没有记录地图名");
    assert.equal(result.goldBeforeRestore, 999, "第二次存档内容不正确");
    assert.equal(result.goldAfterRestore, 111, "还原到原槽位失败");
    assert.equal(result.goldAfterCopy, 111, "还原到其他槽位失败");
    assert.equal(result.renamedLabel, "renamed", "快照重命名失败");
    assert.equal(
      result.renamedMetaLabel,
      "renamed",
      "快照单份元数据没有更新（readMeta 读不到 <id>.json）",
    );
    assert.equal(
      result.globalInfoPresent,
      true,
      "还原后没有更新 global 存档索引",
    );
    assert.equal(
      result.snapshotCodec,
      type === "mv" ? "lzstring" : "pako",
      "快照编码与引擎不匹配",
    );
    assert.equal(
      result.snapshotExt,
      type === "mv" ? ".rpgsave" : ".rmmzsave",
      "快照扩展名与引擎不匹配",
    );
    assert.equal(
      result.snapshotPayloadExt,
      type === "mv" ? ".rpgsave" : ".rmmzsave",
      "快照载荷文件扩展名与引擎不匹配",
    );
    assert.equal(
      result.nativeSnapshotGold,
      111,
      "快照载荷不能直接作为引擎存档读取",
    );
    assert.equal(result.insideAccepted, true, "快照目录内的路径被误判为越界");
    assert.equal(result.outsideRejected, true, "快照目录外的路径没有被拒绝");
    assert.equal(result.invalidIdRejected, true, "非法的快照 ID 没有被拒绝");
    assert.equal(result.payloadPresent, true, "快照数据文件丢失");
    assert.equal(result.quickLoadOk, true, "快速读档失败");
    assert.equal(result.quickLoadGold, 111, "快速读档后没有加载快照内容");
    assert.equal(result.autoSaveOk, true, "自动快照测试的存档失败");
    assert.equal(
      result.autoSnapshotAdded,
      true,
      "存档后没有生成自动快照（MZ Promise 钩子可能未等待写盘）",
    );
    assert.equal(
      result.retentionKept,
      1,
      "自动快照没有按 autoKeep 裁剪到 1 份",
    );
    assert.equal(
      result.retentionNewestKept,
      true,
      "自动快照裁剪后没有保留最新一份",
    );
    assert.equal(
      result.retentionPruned,
      true,
      "被裁剪的自动快照文件没有从磁盘删除",
    );
    assert.equal(
      result.manualAfterRetention,
      result.manualBeforeRetention,
      "自动快照裁剪误删了手动快照",
    );
    assert.ok(result.listBeforeExport >= 2, "还原前自动快照没有生成");
    assert.equal(
      result.imported.added,
      result.listBeforeExport,
      "导入快照数量不正确",
    );
    assert.equal(
      result.listAfterImport,
      result.listBeforeExport,
      "导入后快照数量不正确",
    );
    assert.equal(result.invalidImportAdded, 0, "无效导入数据不应被写入");
    assert.equal(result.invalidImportSkipped, 1, "无效导入数据没有计入跳过");
    assert.equal(
      result.listAfterInvalidImport,
      result.listAfterValidImport,
      "无效导入改变了快照数量",
    );
    assert.equal(
      result.corruptRestoreRejected,
      true,
      "结构损坏的快照仍然被写回存档",
    );
    assert.equal(
      result.goldAfterCorruptRestore,
      111,
      "损坏快照被拒绝后存档内容仍被改动",
    );
    assert.equal(result.copiedExists, true, "复制存档文件失败");
    assert.ok(
      result.copiedPath.endsWith(type === "mv" ? ".rpgsave" : ".rmmzsave"),
      `复制出的存档扩展名不正确: ${result.copiedPath}`,
    );
  });

  test("存档时间机器面板：设置输入收敛 / 参数写入 / 目标槽位建议", async () => {
    const result = await page.evaluate(async () => {
      const base = document.baseURI;
      const { SaveBackupCheat: Backups } = await import(
        new URL("cheat/js/SaveBackupHelper.js", base).href
      );
      const api = window.__cheatTest;

      const panel = await api.openPanel("save-backup-panel", "SaveBackupPanel");
      await api.waitFor(() => panel.available, 10000, 100);

      const original = Backups.getSettings();
      const sourceSlot = 1;
      const suggested = panel.getSuggestedTargetSlot(sourceSlot);
      const maxSavefiles = Backups.maxSavefiles();

      try {
        const parsed = [
          panel.parseCount("0", 1),
          panel.parseCount("abc", 3),
          panel.parseCount(" 7 次", 1),
          panel.parseCount("999", 1),
          panel.parseCount(null, 4),
          panel.parseCount("2.9", 1),
        ];

        const widths = [
          panel.numFieldStyle("1").width,
          panel.numFieldStyle("12").width,
          panel.numFieldStyle("123").width,
        ];

        panel.onIntervalInput("3");
        const afterIntervalInput = Backups.getSettings().autoSaveInterval;
        const intervalText = panel.intervalText;

        panel.onKeepInput("0");
        const afterKeepZero = Backups.getSettings().autoKeep;

        panel.keepText = "abc";
        panel.commitKeepText();
        const afterKeepCommit = Backups.getSettings().autoKeep;
        const keepText = panel.keepText;

        panel.intervalText = "500";
        panel.commitIntervalText();
        const afterIntervalCommit = Backups.getSettings().autoSaveInterval;
        const clampedIntervalText = panel.intervalText;

        panel.settings.autoOnSave = true;
        panel.settings.autoKeep = 3;
        panel.onSettingsChange();
        const persisted = Backups.getSettings();

        return {
          parsed,
          widths,
          sourceSlot,
          suggested,
          maxSavefiles,
          afterIntervalInput,
          intervalText,
          afterKeepZero,
          afterKeepCommit,
          keepText,
          afterIntervalCommit,
          clampedIntervalText,
          persisted,
          available: panel.available,
        };
      } finally {
        Backups.writeSettings(original);
        panel.settings = original;
        panel.intervalText = String(original.autoSaveInterval);
        panel.keepText = String(original.autoKeep);
        panel.reload();
      }
    });

    assert.deepEqual(result.parsed, [1, 3, 7, 100, 4, 2]);
    assert.deepEqual(result.widths, ["36px", "41px", "51px"]);
    assert.ok(Number.isInteger(result.suggested));
    assert.ok(result.suggested >= 1);
    assert.ok(
      result.suggested !== result.sourceSlot || result.maxSavefiles <= 1,
      "有可用槽位时建议值不应等于来源槽位",
    );
    assert.equal(result.afterIntervalInput, 3, "自动快照间隔没有写入");
    assert.equal(result.intervalText, "3");
    assert.equal(result.afterKeepZero, 1, "自动快照保留份数下限不是 1");
    assert.equal(result.afterKeepCommit, 1);
    assert.equal(result.keepText, "1");
    assert.equal(result.afterIntervalCommit, 100, "自动快照间隔上限不是 100");
    assert.equal(result.clampedIntervalText, "100");
    assert.equal(result.persisted.autoOnSave, true);
    assert.equal(result.persisted.autoKeep, 3);
    assert.equal(result.available, true);
  });
}
