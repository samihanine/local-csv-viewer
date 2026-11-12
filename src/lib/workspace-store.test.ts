import { describe, expect, it } from "vitest";
import { displayColumns } from "@/lib/workspace-store";

const columns = ["a", "b", "c", "d"];

describe("displayColumns", () => {
  it("keeps the file order by default", () => {
    expect(displayColumns(columns, {})).toEqual([0, 1, 2, 3]);
  });

  it("follows the view order, with unlisted columns last and unknown names ignored", () => {
    expect(displayColumns(columns, { order: ["c", "gone", "a"] })).toEqual([2, 0, 1, 3]);
  });

  it("hides columns without losing their place in the order", () => {
    expect(displayColumns(columns, { order: ["d", "c", "b", "a"], hidden: ["c", "gone"] })).toEqual([3, 1, 0]);
  });
});
