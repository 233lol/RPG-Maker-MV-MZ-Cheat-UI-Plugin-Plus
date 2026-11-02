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
      const originalGold = $gameParty.gold();
      const savedFiles = [];
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
        const renamed = Backups.listBackups().find((item) => item.id === meta.id);

        const listBeforeExport = Backups.listBackups().length;
        const payloadPresent = Backups.listBackups().every((item) =>
          Backups.isSnapshotPresent(item),
        );

        exportPath = Backups.exportAll();
        const exportText = fs.readFileSync(exportPath, "utf-8");
        Backups.clearBackups();
        const imported = Backups.importFromJson(exportText);
        const listAfterImport = Backups.listBackups();

        copiedPath = Backups.copySaveFileToLocal(slotA);
        const copiedExists = fs.existsSync(copiedPath);

        return {
          slotA,
          slotB,
          goldAfterFirstSave,
          snapshotGold,
          goldBeforeRestore,
          goldAfterRestore,
          goldAfterCopy,
          snapshotId: meta.id,
          snapshotSize: meta.sizeBytes,
          snapshotMapName: meta.mapName,
          renamedLabel: renamed?.label,
          payloadPresent,
          listBeforeExport,
          imported,
          listAfterImport: listAfterImport.length,
          copiedPath,
          copiedExists,
        };
      } finally {
        cleanup();
      }
    });

    assert.equal(result.goldAfterFirstSave, 111, "第一次存档内容不正确");
    assert.equal(result.snapshotGold, 111, "快照里保存的金币不正确");
    assert.ok(result.snapshotId, "快照没有生成 ID");
    assert.ok(result.snapshotSize > 0, "快照文件大小为空");
    assert.ok(result.snapshotMapName, "快照没有记录地图名");
    assert.equal(result.goldBeforeRestore, 999, "第二次存档内容不正确");
    assert.equal(result.goldAfterRestore, 111, "还原到原槽位失败");
    assert.equal(result.goldAfterCopy, 111, "还原到其他槽位失败");
    assert.equal(result.renamedLabel, "renamed", "快照重命名失败");
    assert.equal(result.payloadPresent, true, "快照数据文件丢失");
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
    assert.equal(result.copiedExists, true, "复制存档文件失败");
    assert.ok(
      result.copiedPath.endsWith(type === "mv" ? ".rpgsave" : ".rmmzsave"),
      `复制出的存档扩展名不正确: ${result.copiedPath}`,
    );
  });
}
