// @ts-check
/**
 * 按快照 id 过滤要导出的条目。独立成无副作用的纯函数，便于单元测试。
 *
 * ids 为 null / undefined 时返回全部（“导出全部”）；否则只返回命中的条目。
 *
 * @param {Array<{ id?: unknown }>} entries
 * @param {Array<unknown>|null|undefined} ids
 * @returns {Array<{ id?: unknown }>}
 */
export function filterBackupsForExport(entries, ids = null) {
  const list = Array.isArray(entries) ? entries.slice() : [];

  if (ids === null || ids === undefined) {
    return list;
  }

  const wanted = new Set(
    (Array.isArray(ids) ? ids : []).map((id) => String(id)),
  );

  return list.filter((entry) => entry && wanted.has(String(entry.id)));
}
