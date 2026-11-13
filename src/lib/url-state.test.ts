import { describe, expect, it } from "vitest";
import { buildHash, parseHash, sanitizeState } from "@/lib/url-state";
import { defaultState } from "@/lib/workspace-store";

describe("url state", () => {
  it("round-trips", () => {
    const state = {
      ...defaultState(),
      mode: "kanban" as const,
      search: "a&b=c #x",
      filters: { Statut: { values: ["Fait", ""] }, Échéance: { from: "2024-01-01" } },
      sort: { column: "Titre", desc: true },
      groupBy: "Statut",
      hidden: ["Notes"],
    };
    const hash = buildHash({ page: "csv", file: "f1", view: "v1", state });
    expect(parseHash(hash)).toEqual({ page: "csv", file: "f1", view: "v1", state, errors: [] });
  });

  it("tolerates broken or hostile addresses", () => {
    expect(parseHash("#p=nope&s=%7Bnot%20json").errors).toEqual(["outil inconnu", "réglages d'affichage illisibles"]);
    expect(parseHash("").errors).toEqual([]);
    const state = sanitizeState({
      mode: "detail",
      search: 3,
      filters: { a: { text: "x", values: [1, "ok"], from: "yesterday" }, b: "nope", __proto__: { text: "evil" } },
      sort: { column: 4 },
      hidden: "Notes",
      phases: [{ id: "p", name: "Test", start: "a", end: "b", color: "neon" }, { id: 1 }],
    });
    expect(state?.mode).toBe("table");
    expect(state?.search).toBe("");
    expect(state?.filters).toEqual({ a: { text: "x", values: ["ok"] } });
    expect(state?.sort).toBeUndefined();
    expect(state?.hidden).toBeUndefined();
    expect(state?.phases).toEqual([{ id: "p", name: "Test", start: "a", end: "b", color: "blue" }]);
    expect(({} as Record<string, unknown>).text).toBeUndefined();
  });
});
