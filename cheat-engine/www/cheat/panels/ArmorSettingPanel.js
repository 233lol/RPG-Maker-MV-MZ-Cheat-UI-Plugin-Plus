import { createItemDatabasePanel } from "./ItemDatabasePanel.js";

export default createItemDatabasePanel({
  name: "ArmorSettingPanel",
  stateKey: "armor",
  getItems: () => $dataArmors,
  descTitle: "描述",
});
