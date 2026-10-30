import { describe, expect, spyOn, test } from "bun:test";
import {
  agentRecencyKey,
  markAgentOpened,
  parseAgentRecency,
  recordAgentOpened,
} from "./agentRecency";
import { roamgateLocalStorage } from "./browserStorage";

describe("agent recency", () => {
  test("keys by server, pane, and terminal", () => {
    const pane = { pane_id: "w1:p1", terminal_id: "t1" };
    expect(agentRecencyKey("local", pane)).not.toBe(
      agentRecencyKey("agentbox", pane),
    );
    expect(agentRecencyKey("local", pane)).not.toBe(
      agentRecencyKey("local", { ...pane, terminal_id: "t2" }),
    );
  });

  test("parses only positive finite timestamps", () => {
    expect(parseAgentRecency(null).size).toBe(0);
    expect(parseAgentRecency("bad json").size).toBe(0);
    expect(parseAgentRecency("[1,2]").size).toBe(0);
    expect([
      ...parseAgentRecency(
        JSON.stringify({ a: 10, b: -1, c: "x", d: 0, e: 20 }),
      ),
    ]).toEqual([
      ["a", 10],
      ["e", 20],
    ]);
  });

  test("moves a reopened agent to the newest slot and caps the history", () => {
    let recency: Map<string, number> = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    recency = recordAgentOpened(recency, "a", 3);
    expect([...recency]).toEqual([
      ["a", 3],
      ["b", 2],
    ]);
    for (let index = 0; index < 250; index += 1) {
      recency = recordAgentOpened(recency, `k${index}`, 10 + index);
    }
    expect(recency.size).toBe(200);
    expect(recency.has("a")).toBe(false);
    expect(recency.get("k249")).toBe(259);
  });

  test("ignores storage that cannot be written", () => {
    const read = spyOn(roamgateLocalStorage, "getItem").mockImplementation(
      () => null,
    );
    const write = spyOn(roamgateLocalStorage, "setItem").mockImplementation(
      () => {
        throw new Error("Storage unavailable");
      },
    );
    try {
      expect(() =>
        markAgentOpened("local", { pane_id: "w1:p1", terminal_id: "t1" }),
      ).not.toThrow();
      expect(write).toHaveBeenCalledTimes(1);
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });
});
