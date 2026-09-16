import { describe, expect, test } from "bun:test";

import { nextSelection } from "./selection.ts";

describe("nextSelection", () => {
  test("a Ctrl+click on a chosen target removes it", () => {
    expect(nextSelection(["separate", "same"])).toEqual({ keep: [0], add: false });
  });

  test("a Ctrl+click inside a chosen target replaces it", () => {
    expect(nextSelection(["overlapping"])).toEqual({ keep: [], add: true });
  });

  test("a Ctrl+click elsewhere joins the set", () => {
    expect(nextSelection(["separate"])).toEqual({ keep: [0], add: true });
  });
});
