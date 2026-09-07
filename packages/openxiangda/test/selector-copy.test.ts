import assert from "node:assert/strict";
import test from "node:test";
import { mobileReferenceSelectorCopy } from "../src/browser/selector-copy";

test("does not repeat search actions in mobile resource-reference copy", () => {
  assert.deepEqual(mobileReferenceSelectorCopy("搜索并选择设备资产"), {
    title: "选择设备资产",
    empty: "请选择设备资产",
    search: "搜索设备资产",
  });
  assert.deepEqual(mobileReferenceSelectorCopy("设备资产"), {
    title: "选择设备资产",
    empty: "请选择设备资产",
    search: "搜索设备资产",
  });
});
