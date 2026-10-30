import { agentAttentionPriority } from "./agentOrder";
import {
  type AgentStateKind,
  agentStateKind,
  paneHasAgentHistory,
} from "./components/agentSession";
import type { Pane, Tab } from "./types";

/** Tabs shown as numbered chips in a workspace row. */
export const MAX_WORKSPACE_TAB_CHIPS = 6;

export type WorkspaceTabChip = {
  tabId: string;
  number: number;
  label: string;
  focused: boolean;
  /** Most urgent agent state in the tab, in attention order. */
  status: AgentStateKind;
  /** Pane to open for this tab: its focused pane, else its first pane. */
  paneId?: string;
};

export function workspaceTabChips(
  tabs: readonly Tab[],
  panes: readonly Pick<
    Pane,
    "pane_id" | "tab_id" | "focused" | "agent" | "agent_status"
  >[],
): Map<string, WorkspaceTabChip[]> {
  const chips = new Map<string, WorkspaceTabChip[]>();
  const chipsByTab = new Map<string, WorkspaceTabChip>();
  for (const tab of tabs) {
    const chip: WorkspaceTabChip = {
      tabId: tab.tab_id,
      number: tab.number,
      label: tab.label,
      focused: tab.focused,
      status: "unknown",
      paneId: undefined,
    };
    chipsByTab.set(tab.tab_id, chip);
    const group = chips.get(tab.workspace_id);
    if (group) group.push(chip);
    else chips.set(tab.workspace_id, [chip]);
  }
  for (const pane of panes) {
    const chip = chipsByTab.get(pane.tab_id);
    if (!chip) continue;
    if (!chip.paneId || pane.focused) chip.paneId = pane.pane_id;
    if (!paneHasAgentHistory(pane)) continue;
    const status = agentStateKind(pane.agent_status);
    if (agentAttentionPriority(status) < agentAttentionPriority(chip.status)) {
      chip.status = status;
    }
  }
  return chips;
}

// Chip geometry, kept in sync with WorkspaceTree.css.
export const WORKSPACE_TAB_CHIP_WIDTH = 16;
export const WORKSPACE_TAB_CHIP_GAP = 2;
export const WORKSPACE_TAB_CHIP_MORE_WIDTH = 22;

function chipsWidth(count: number): number {
  return (
    count * WORKSPACE_TAB_CHIP_WIDTH +
    Math.max(0, count - 1) * WORKSPACE_TAB_CHIP_GAP
  );
}

/**
 * Chips that fit the available width, plus how many tabs the "+N" marker
 * stands for. Narrow rows fold down to one chip and the marker.
 */
export function visibleWorkspaceTabChips(
  chips: readonly WorkspaceTabChip[],
  availableWidth = Number.POSITIVE_INFINITY,
): {
  visible: WorkspaceTabChip[];
  hidden: number;
} {
  let count = Math.min(
    chips.length,
    chips.length > MAX_WORKSPACE_TAB_CHIPS
      ? MAX_WORKSPACE_TAB_CHIPS - 1
      : MAX_WORKSPACE_TAB_CHIPS,
  );
  while (
    count > 1 &&
    chipsWidth(count) +
      (count < chips.length
        ? WORKSPACE_TAB_CHIP_GAP + WORKSPACE_TAB_CHIP_MORE_WIDTH
        : 0) >
      availableWidth
  ) {
    count -= 1;
  }
  return { visible: chips.slice(0, count), hidden: chips.length - count };
}
