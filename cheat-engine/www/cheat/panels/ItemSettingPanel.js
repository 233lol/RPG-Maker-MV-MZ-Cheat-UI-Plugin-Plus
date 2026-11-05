import { createItemDatabasePanel } from "./ItemDatabasePanel.js";

export default createItemDatabasePanel({
  name: "ItemSettingPanel",
  stateKey: "item",
  getItems: () => $dataItems,
  descTitle: "描述",
});
