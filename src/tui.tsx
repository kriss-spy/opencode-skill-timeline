/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { createComponent, createMemo, createSignal, onMount } from "solid-js"
import { extractSkillTimeline } from "./extract"
import {
  filterTimeline,
  formatTimelineRow,
  formatTimelineTime,
} from "./present"
import type { SkillTimelineEntry, TimelineMessage } from "./types"

const commandName = "skill-timeline.open"

interface RenderTreeNode {
  readonly id: string
  readonly y: number
  readonly plainText?: string
  getChildren(): RenderTreeNode[]
  findDescendantById?: (id: string) => RenderTreeNode | undefined
  scrollBy?: (delta: number | { x: number; y: number }) => void
  scrollChildIntoView?: (id: string) => void
  readonly viewport?: { readonly y: number }
}

function sessionEntries(api: TuiPluginApi, sessionID: string): SkillTimelineEntry[] {
  const messages = api.state.session.messages(sessionID) as readonly TimelineMessage[]
  return extractSkillTimeline(messages, (messageID) => api.state.part(messageID))
}

function findMessageViewport(
  node: RenderTreeNode,
  messageID: string,
): { viewport: RenderTreeNode & { scrollBy: NonNullable<RenderTreeNode["scrollBy"]> }; target: RenderTreeNode } | undefined {
  const children = node.getChildren()
  if (node.scrollBy) {
    const target = node.findDescendantById?.(messageID) ?? children.find((child) => child.id === messageID)
    if (target) return { viewport: node as RenderTreeNode & { scrollBy: NonNullable<RenderTreeNode["scrollBy"]> }, target }
  }
  for (const child of children) {
    const result = findMessageViewport(child, messageID)
    if (result) return result
  }
}

function containsExactText(node: RenderTreeNode, expected: string): boolean {
  if (node.plainText?.trim() === expected) return true
  return node.getChildren().some((child) => containsExactText(child, expected))
}

function findSkillRow(
  viewport: RenderTreeNode,
  entry: SkillTimelineEntry,
  entries: readonly SkillTimelineEntry[],
  showDetails: boolean,
): RenderTreeNode | undefined {
  if (!showDetails && entry.status === "completed") return
  const label = `Skill "${entry.skill}"`
  const occurrence = entries.filter(
    (candidate) =>
      candidate.skill === entry.skill &&
      candidate.sequence < entry.sequence &&
      (showDetails || candidate.status !== "completed"),
  ).length
  return viewport.getChildren().filter((child) => containsExactText(child, label))[occurrence]
}

export function scrollToTimelineEntry(
  api: TuiPluginApi,
  entry: SkillTimelineEntry,
  entries: readonly SkillTimelineEntry[] = [entry],
): boolean {
  const result = findMessageViewport(api.renderer.root as unknown as RenderTreeNode, entry.anchorMessageID)
  if (!result) return false
  const showDetails = api.kv?.get("tool_details_visibility", true) ?? true
  const target = findSkillRow(result.viewport, entry, entries, showDetails)
  if (!target) return false
  result.viewport.scrollChildIntoView?.(target.id)
  const viewportY = result.viewport.viewport?.y ?? result.viewport.y
  result.viewport.scrollBy(target.y - viewportY - 1)
  return true
}

export function selectTimelineEntry(
  api: TuiPluginApi,
  entry: SkillTimelineEntry,
  entries: readonly SkillTimelineEntry[] = [entry],
): boolean {
  const located = scrollToTimelineEntry(api, entry, entries)
  api.ui.dialog.clear()
  if (!located) {
    api.ui.toast({
      variant: "warning",
      title: "Skill Timeline",
      message: "The exact skill call is not rendered. Show tool details and try again.",
    })
  }
  return located
}

function currentSessionID(api: TuiPluginApi): string | undefined {
  const route = api.route.current
  if (route.name !== "session" || !("params" in route)) return
  const sessionID = route.params?.sessionID
  return typeof sessionID === "string" ? sessionID : undefined
}

function TimelineDialog(props: { api: TuiPluginApi; sessionID: string }) {
  const DialogSelect = props.api.ui.DialogSelect<SkillTimelineEntry>
  const dimensions = useTerminalDimensions()
  const [query, setQuery] = createSignal("")

  onMount(() => props.api.ui.dialog.setSize("large"))

  const entries = createMemo(() => sessionEntries(props.api, props.sessionID))
  const options = createMemo(() => {
    const rows = filterTimeline(entries(), query()).map((entry) => ({
      entry,
      time: formatTimelineTime(entry.timestamp),
    }))
    const terminalWidth = dimensions().width
    const timeWidth = Math.max(0, ...rows.map((row) => Bun.stringWidth(row.time)))
    return rows.map(({ entry, time }) => ({ ...formatTimelineRow(entry, time, terminalWidth, timeWidth), value: entry }))
  })

  return createComponent(DialogSelect, {
    title: "Skill Timeline",
    placeholder: "Search",
    get options() {
      return options()
    },
    flat: true,
    skipFilter: true,
    onFilter: setQuery,
    onMove: (option) => scrollToTimelineEntry(props.api, option.value, entries()),
    onSelect: (option) => selectTimelineEntry(props.api, option.value, entries()),
  })
}

export function openSkillTimeline(api: TuiPluginApi): boolean {
  const sessionID = currentSessionID(api)
  if (!sessionID) {
    api.ui.toast({
      variant: "warning",
      title: "Skill Timeline",
      message: "Open a session before using /skill-timeline.",
    })
    return false
  }

  if (sessionEntries(api, sessionID).length === 0) {
    const DialogAlert = api.ui.DialogAlert
    api.ui.dialog.setSize("medium")
    api.ui.dialog.replace(() => (
      <DialogAlert title="Skill Timeline" message="No skill calls in this session." />
    ))
    return true
  }

  api.ui.dialog.replace(() => <TimelineDialog api={api} sessionID={sessionID} />)
  return true
}

export function registerSkillTimeline(api: TuiPluginApi) {
  return api.keymap.registerLayer({
    commands: [
      {
        name: commandName,
        title: "Skill Timeline",
        category: "Session",
        desc: "Review skill calls in the current session",
        namespace: "palette",
        slashName: "skill-timeline",
        enabled: () => api.state.ready,
        run: () => openSkillTimeline(api),
      },
    ],
  })
}

const tui: TuiPlugin = async (api) => {
  registerSkillTimeline(api)
}

export default {
  id: "skill-timeline",
  tui,
} satisfies TuiPluginModule
