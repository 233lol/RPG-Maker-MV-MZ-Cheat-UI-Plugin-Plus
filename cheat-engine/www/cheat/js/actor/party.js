// @ts-check
// 队伍成员 / 战斗成员 / 可用角色的纯逻辑。

/**
 * @param {any} actor
 * @returns {number}
 */
export function getActorId(actor) {
  if (!actor) {
    return 0;
  }

  try {
    if (typeof actor.actorId === "function") {
      return Number(actor.actorId()) || 0;
    }
  } catch (error) {
    // 继续用内部字段
  }

  return Number(actor._actorId) || 0;
}

/**
 * @param {any} party
 * @returns {Array<any>}
 */
function getMembers(party) {
  if (!party || typeof party.members !== "function") {
    return [];
  }

  try {
    const members = party.members();
    return Array.isArray(members) ? members : [];
  } catch (error) {
    return [];
  }
}

/**
 * @param {any} party
 * @returns {Array<number>}
 */
export function getPartyMemberIds(party) {
  return getMembers(party)
    .map((actor) => getActorId(actor))
    .filter((id) => id > 0);
}

/**
 * @param {any} party
 * @returns {number}
 */
export function getMaxBattleMembers(party) {
  if (!party || typeof party.maxBattleMembers !== "function") {
    return 0;
  }

  try {
    return Number(party.maxBattleMembers()) || 0;
  } catch (error) {
    return 0;
  }
}

/**
 * 队伍表格行。index 是原始队伍顺序，用于上移 / 下移。
 *
 * @param {any} party
 * @param {any} dataActors
 * @param {any} dataClasses
 * @returns {Array<{
 *   index: number,
 *   id: number,
 *   name: string,
 *   className: string,
 *   level: number,
 *   battleMember: boolean,
 *   canMoveUp: boolean,
 *   canMoveDown: boolean
 * }>}
 */
export function getPartyRows(party, dataActors, dataClasses) {
  const members = getMembers(party);
  const maxBattleMembers = getMaxBattleMembers(party);

  return members.map((actor, index) => {
    const id = getActorId(actor);
    const actorData = dataActors && id ? dataActors[id] : null;

    let className = "";
    try {
      const currentClass =
        typeof actor?.currentClass === "function"
          ? actor.currentClass()
          : actor?.currentClass;
      if (currentClass && currentClass.name) {
        className = String(currentClass.name);
      }
    } catch (error) {
      className = "";
    }

    if (!className) {
      const classId = Number(actor?._classId) || 0;
      const classData = dataClasses && classId ? dataClasses[classId] : null;
      className = String(classData?.name ?? "");
    }

    const rawName =
      typeof actor?.name === "function" ? actor.name() : actor?.name;

    return {
      index,
      id,
      name: String(rawName ?? actorData?.name ?? `#${id}`),
      className,
      level: Number(actor?.level) || 0,
      battleMember: maxBattleMembers > 0 && index < maxBattleMembers,
      canMoveUp: index > 0,
      canMoveDown: index < members.length - 1,
    };
  });
}

/**
 * 还没加入队伍的角色（从数据库里取）。
 *
 * @param {any} party
 * @param {any} dataActors
 * @returns {Array<{ id: number, name: string }>}
 */
export function getAvailableActors(party, dataActors) {
  const memberIds = new Set(getPartyMemberIds(party));
  const list = Array.isArray(dataActors) ? dataActors : [];

  return list
    .filter((actor) => actor && Number(actor.id) > 0)
    .filter((actor) => !memberIds.has(Number(actor.id)))
    .map((actor) => ({
      id: Number(actor.id),
      name: String(actor.name || `#${actor.id}`),
    }));
}

/**
 * 至少保留一名队伍成员，避免把游戏状态改坏。
 *
 * @param {any} party
 * @returns {boolean}
 */
export function canRemovePartyMember(party) {
  return getPartyMemberIds(party).length > 1;
}

/**
 * @param {number} length
 * @param {number} index
 * @param {number} offset
 * @returns {number | null}
 */
export function getSwapTargetIndex(length, index, offset) {
  const target = index + offset;

  if (!Number.isInteger(target) || target < 0 || target >= length) {
    return null;
  }

  return target;
}
