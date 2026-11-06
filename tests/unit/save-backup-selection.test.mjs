import test from "node:test";
import assert from "node:assert/strict";

import { filterBackupsForExport } from "../../cheat-engine/www/cheat/js/save-backup/selection.js";

const entries = [
  { id: "manual-1-1" },
  { id: "auto-2-3" },
  { id: "manual-3-9" },
];

test("filterBackupsForExport：不传 ids 时导出全部", () => {
  assert.deepEqual(filterBackupsForExport(entries), entries);
  assert.deepEqual(filterBackupsForExport(entries, null), entries);
  assert.deepEqual(filterBackupsForExport(entries, undefined), entries);
});

test("filterBackupsForExport：只保留选中的 id", () => {
  assert.deepEqual(
    filterBackupsForExport(entries, ["auto-2-3", "manual-3-9"]).map(
      (item) => item.id,
    ),
    ["auto-2-3", "manual-3-9"],
  );
  assert.deepEqual(filterBackupsForExport(entries, []), []);
});

test("filterBackupsForExport：兼容数字 id 与损坏条目", () => {
  const list = [{ id: 1 }, null, { id: 2 }];

  assert.deepEqual(filterBackupsForExport(list, ["2"]), [{ id: 2 }]);
  assert.deepEqual(filterBackupsForExport(null), []);
});
