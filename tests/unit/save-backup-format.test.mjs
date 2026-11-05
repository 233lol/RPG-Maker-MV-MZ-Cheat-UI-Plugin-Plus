import test from "node:test";
import assert from "node:assert/strict";

import { SaveBackupCheat } from "../../cheat-engine/www/cheat/js/SaveBackupHelper.js";

test("formatBytes：常见单位与非法值", () => {
  assert.equal(SaveBackupCheat.formatBytes(0), "-");
  assert.equal(SaveBackupCheat.formatBytes(-1), "-");
  assert.equal(SaveBackupCheat.formatBytes("abc"), "-");
  assert.equal(SaveBackupCheat.formatBytes(512), "512 B");
  assert.equal(SaveBackupCheat.formatBytes(2048), "2.0 KB");
  assert.equal(SaveBackupCheat.formatBytes(1024 * 1024), "1.00 MB");
});

test("formatTime / formatDateTime：固定时间格式", () => {
  const stamp = new Date(2026, 0, 2, 3, 4, 5).getTime();

  assert.equal(SaveBackupCheat.formatTime(stamp), "2026-01-02 03:04:05");
  assert.equal(SaveBackupCheat.formatDateTime(stamp), "01-02 03:04:05");
  assert.equal(SaveBackupCheat.formatTime(0), "-");
  assert.equal(SaveBackupCheat.formatDateTime(0), "");
});

test("formatRelative：刚刚 / 分钟 / 小时 / 天", () => {
  const now = Date.now();

  assert.equal(SaveBackupCheat.formatRelative(now + 10_000), "刚刚");
  assert.equal(SaveBackupCheat.formatRelative(now - 5_000), "刚刚");
  assert.equal(SaveBackupCheat.formatRelative(now - 2 * 60_000), "2 分钟前");
  assert.equal(
    SaveBackupCheat.formatRelative(now - 3 * 60 * 60_000),
    "3 小时前",
  );
  assert.equal(
    SaveBackupCheat.formatRelative(now - 4 * 24 * 60 * 60_000),
    "4 天前",
  );
  assert.equal(SaveBackupCheat.formatRelative(0), "");
});

test("formatFrames：0 帧不显示时间，其余按时/分/秒补齐", () => {
  assert.equal(SaveBackupCheat.formatFrames(0), "");
  assert.equal(SaveBackupCheat.formatFrames(-1), "");
  assert.equal(SaveBackupCheat.formatFrames(3600), "00:01:00");
  assert.equal(SaveBackupCheat.formatFrames(360000), "01:40:00");
});

test("getSaveTimeText：优先存档头文本，再回退格式化时间", () => {
  assert.equal(
    SaveBackupCheat.getSaveTimeText({
      savefileTimeText: "10-01 19:50:55",
      savefileTime: 1,
    }),
    "10-01 19:50:55",
  );

  assert.equal(
    SaveBackupCheat.getSaveTimeText({ savefileTime: 0, saveTime: "raw" }),
    "raw",
  );

  assert.equal(SaveBackupCheat.getSaveTimeText(null), "");
});

test("getTextByteLength：按 UTF-8 字节计数", () => {
  assert.equal(SaveBackupCheat.getTextByteLength("abc"), 3);
  assert.equal(SaveBackupCheat.getTextByteLength("中文"), 6);
  assert.equal(SaveBackupCheat.getTextByteLength(null), 0);
});

test("validateSaveText：拒绝缺失或为空的核心字段", () => {
  assert.throws(
    () => SaveBackupCheat.validateSaveText('{"system":null,"party":{}}'),
    /system/,
  );
  assert.throws(
    () => SaveBackupCheat.validateSaveText('{"system":{},"party":null}'),
    /party/,
  );
  assert.throws(
    () => SaveBackupCheat.validateSaveText('{"system":{}}'),
    /party/,
  );

  assert.doesNotThrow(() =>
    SaveBackupCheat.validateSaveText(
      JSON.stringify({ system: {}, party: {}, actors: [] }),
    ),
  );
});

test("isValidSnapshotId / assertSnapshotId：阻止路径穿越", () => {
  for (const id of ["auto-s1-abc", "manual-s2-x_y.z", "a"]) {
    assert.equal(SaveBackupCheat.isValidSnapshotId(id), true, id);
  }

  for (const id of ["", ".", "..", "../x", "a/b", "C:\\x", "中文", null, 1]) {
    assert.equal(SaveBackupCheat.isValidSnapshotId(id), false, String(id));
  }

  assert.throws(() => SaveBackupCheat.assertSnapshotId("../x"), /ID 无效/);
  assert.equal(SaveBackupCheat.assertSnapshotId("ok-1"), "ok-1");
});

test("getPayloadExtension：按编码选择扩展名", () => {
  assert.equal(SaveBackupCheat.getPayloadExtension("pako"), ".rmmzsave");
  assert.equal(SaveBackupCheat.getPayloadExtension("lzstring"), ".rpgsave");
  assert.equal(SaveBackupCheat.getPayloadExtension("base64"), ".rpgsave");
});

test("importFromJson：先拦截超大文件", () => {
  const originalIsLocalMode = SaveBackupCheat.isLocalMode;
  SaveBackupCheat.isLocalMode = () => true;

  try {
    const huge = "x".repeat(SaveBackupCheat.getMaxImportBytes() + 1);
    assert.throws(() => SaveBackupCheat.importFromJson(huge), /导入文件过大/);
  } finally {
    SaveBackupCheat.isLocalMode = originalIsLocalMode;
  }
});

test("importFromJson：拒绝不支持的版本和过多快照", () => {
  const originalIsLocalMode = SaveBackupCheat.isLocalMode;
  SaveBackupCheat.isLocalMode = () => true;

  try {
    assert.throws(
      () =>
        SaveBackupCheat.importFromJson(
          JSON.stringify({
            format: "cheat-save-backups",
            version: 999,
            backups: [],
          }),
        ),
      /不支持的快照文件版本/,
    );

    assert.throws(
      () =>
        SaveBackupCheat.importFromJson(
          JSON.stringify({
            format: "cheat-save-backups",
            version: 1,
            backups: new Array(5001).fill(null),
          }),
        ),
      /快照数量过多/,
    );
  } finally {
    SaveBackupCheat.isLocalMode = originalIsLocalMode;
  }
});

test("generateId：带 kind / 槽位且不与已有 ID 冲突", () => {
  const existing = new Set();
  const ids = new Set();

  for (let i = 0; i < 20; i++) {
    const id = SaveBackupCheat.generateId("auto", 3, existing);
    assert.match(id, /^auto-s3-/);
    assert.equal(ids.has(id), false);
    ids.add(id);
    existing.add(id);
  }
});
