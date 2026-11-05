import { createItemDatabasePanel } from "./ItemDatabasePanel.js";

export default createItemDatabasePanel({
  name: "WeaponSettingPanel",
  stateKey: "weapon",
  getItems: () => $dataWeapons,
  descTitleKey: "items.weaponDesc",
});
