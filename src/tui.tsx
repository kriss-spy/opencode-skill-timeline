/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { createComponent, createMemo, createSignal, onMount } from "solid-js"
import { extractSkillTimeline } from "./extract"
import { filterTimeline, formatTimelineRow, formatTimelineTime, timelineRowWidth } from "./present"
import type { SkillTimelineEntry, TimelineMessage } from "./types"

const commandName = "skill-timeline.open"

interface RenderTreeNode {
  readonly id: string
  readonly y: number
  getChildren(): RenderTreeNode[]
  scrollBy?: (delta: number | { x: number; y: number }) => void
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
    const target = children.find((child) => child.id === messageID)
    if (target) return { viewport: node as RenderTreeNode & { scrollBy: NonNullable<RenderTreeNode["scrollBy"]> }, target }
  }
  for (const child of children) {
    const result = findMessageViewport(child, messageID)
    if (result) return result
  }
}

export function scrollToTimelineEntry(api: TuiPluginApi, entry: SkillTimelineEntry): boolean {
  const result = findMessageViewport(api.renderer.root as unknown as RenderTreeNode, entry.anchorMessageID)
  if (!result) return false
  result.viewport.scrollBy(result.target.y - result.viewport.y - 1)
  return true
}

export function selectTimelineEntry(api: TuiPluginApi, entry: SkillTimelineEntry): boolean {
  const located = scrollToTimelineEntry(api, entry)
  api.ui.dialog.clear()
  if (!located) {
    api.ui.toast({
      variant: "warning",
      title: "Skill Timeline",
      message: "The containing message is not currently rendered.",
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
  const rowWidth = createMemo(() => timelineRowWidth(dimensions().width))
  const options = createMemo(() =>
    filterTimeline(entries(), query()).map((entry) => ({
      title: formatTimelineRow(entry, rowWidth()),
      value: entry,
      footer: formatTimelineTime(entry.timestamp),
    })),
  )

  return createComponent(DialogSelect, {
    title: "Skill Timeline",
    placeholder: "Search",
    get options() {
      return options()
    },
    flat: true,
    skipFilter: true,
    onFilter: setQuery,
    onMove: (option) => scrollToTimelineEntry(props.api, option.value),
    onSelect: (option) => selectTimelineEntry(props.api, option.value),
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
