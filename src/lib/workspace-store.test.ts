import { describe, expect, it } from "vitest";
import { displayColumns } from "@/lib/workspace-store";

describe("displayColumns", () => {
  it("keeps the file order and drops hidden columns", () => {
    expect(displayColumns(["a", "b", "c", "d"], {})).toEqual([0, 1, 2, 3]);
    expect(displayColumns(["a", "b", "c", "d"], { hidden: ["c", "gone"] })).toEqual([0, 1, 3]);
  });
});
