// @ts-check
// 角色状态（状态异常 / Buff 状态）的纯逻辑。

/**
 * @param {any} state
 * @param {number} id
 * @param {any} dataStates
 */
function toStateRow(state, id, dataStates) {
  const data = dataStates && dataStates[id] ? dataStates[id] : null;
  const name = state?.name ?? data?.name ?? `#${id}`;

  return {
    id,
    name: String(name),
    iconIndex: Number(state?.iconIndex ?? data?.iconIndex ?? 0) || 0,
  };
}

/**
 * 当前生效的状态列表。
 *
 * @param {any} actor
 * @param {any} dataStates
 * @returns {Array<{ id: number, name: string, iconIndex: number }>}
 */
export function getActiveStates(actor, dataStates) {
  let states = [];

  try {
    if (actor && typeof actor.states === "function") {
      states = actor.states() || [];
    }
  } catch (error) {
    states = [];
  }

  if (!Array.isArray(states)) {
    return [];
  }

  const rows = [];
  for (const state of states) {
    const id = Number(state?.id) || 0;
    if (id > 0) {
      rows.push(toStateRow(state, id, dataStates));
    }
  }

  return rows;
}

/**
 * 还没生效、可以添加的状态。
 *
 * @param {any} actor
 * @param {any} dataStates
 * @returns {Array<{ title: string, value: number }>}
 */
export function getAvailableStates(actor, dataStates) {
  const list = Array.isArray(dataStates) ? dataStates : [];
  const isAffected =
    actor && typeof actor.isStateAffected === "function"
      ? (id) => {
          try {
            return actor.isStateAffected(id);
          } catch (error) {
            return false;
          }
        }
      : () => false;

  return list
    .filter((state) => state && Number(state.id) > 0)
    .filter((state) => !isAffected(Number(state.id)))
    .map((state) => ({
      title: String(state.name || `#${state.id}`),
      value: Number(state.id),
    }));
}
