import type { Context } from "@opencode-ai/plugin/tui/context"
import { extractSkillTimeline } from "../../../src/extract"
import { formatTimelineTime } from "../../../src/present"
import type { SkillTimelineEntry, TimelineMessage } from "../../../src/types"

type RecordValue = Record<string, unknown>
const transcriptLayoutWaitMs = 40

interface RenderTreeNode {
  readonly id?: string
  readonly y: number
  readonly scrollTop?: number
  readonly scrollHeight?: number
  stickyScroll?: boolean
  readonly viewport?: { readonly y: number }
  getChildren(): RenderTreeNode[]
  scrollTo?: (offset: number) => void
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function messageTime(message: RecordValue): number {
  return isRecord(message.time) && typeof message.time.created === "number" ? message.time.created : 0
}

function toolInput(state: RecordValue): RecordValue {
  if (isRecord(state.input)) return state.input
  if (typeof state.input === "string") {
    try {
      const parsed: unknown = JSON.parse(state.input)
      if (isRecord(parsed)) return parsed
    } catch {
      // Streaming input is often incomplete JSON. Keep the running call visible.
    }
  }
  return { name: "(unknown skill)" }
}

function assistantPart(part: unknown): unknown {
  if (!isRecord(part)) return part
  if (part.type !== "tool") return part

  const time = isRecord(part.time) ? part.time : {}
  const state = isRecord(part.state) ? part.state : {}
  return {
    id: typeof part.id === "string" ? part.id : "",
    callID: typeof part.id === "string" ? part.id : "",
    type: "tool",
    tool: part.name,
    state: {
      ...state,
      input: toolInput(state),
      time: {
        start: typeof time.ran === "number" ? time.ran : time.created,
        end: time.completed,
      },
    },
  }
}

/** Adapt the v2 session-message contract to the shared, version-neutral extractor. */
export function extractV2SkillTimeline(sessionID: string, messages: readonly unknown[]): SkillTimelineEntry[] {
  const timelineMessages: TimelineMessage[] = []
  const parts = new Map<string, readonly unknown[]>()

  for (const value of messages) {
    if (!isRecord(value) || typeof value.id !== "string") continue

    if (value.type === "user") {
      timelineMessages.push({
        id: value.id,
        sessionID,
        role: "user",
        time: { created: messageTime(value) },
      })
      parts.set(value.id, typeof value.text === "string" ? [{ type: "text", text: value.text }] : [])
      continue
    }

    if (value.type === "assistant") {
      timelineMessages.push({
        id: value.id,
        sessionID,
        role: "assistant",
        time: { created: messageTime(value) },
      })
      parts.set(value.id, Array.isArray(value.content) ? value.content.map(assistantPart) : [])
    }
  }

  return extractSkillTimeline(timelineMessages, (messageID) => parts.get(messageID) ?? [])
}

function currentSessionID(context: Context): string | undefined {
  const route = context.ui.router.current()
  return route.type === "session" ? route.sessionID : undefined
}

function findTimelineTarget(
  node: RenderTreeNode,
  targetID: string,
  viewport?: RenderTreeNode,
): { readonly target: RenderTreeNode; readonly viewport: RenderTreeNode } | undefined {
  const currentViewport = node.scrollTo && node.viewport ? node : viewport
  if (node.id === targetID && currentViewport) return { target: node, viewport: currentViewport }
  for (const child of node.getChildren()) {
    const result = findTimelineTarget(child, targetID, currentViewport)
    if (result) return result
  }
}

/** Locate a mounted v2 transcript row using the stable row IDs published by OpenCode's session view. */
export function scrollToTimelineEntryV2(
  context: Pick<Context, "renderer">,
  entry: SkillTimelineEntry,
  allowMessageBoundary = false,
): boolean {
  const root = context.renderer.root as unknown as RenderTreeNode
  const exact = findTimelineTarget(root, `session-part:${entry.messageID}:${entry.partID}`)
  const boundary = allowMessageBoundary ? findTimelineTarget(root, entry.messageID) : undefined
  const result = exact ?? boundary
  if (!result?.viewport.scrollTo || !result.viewport.viewport) return false

  result.viewport.stickyScroll = false
  const offset = (result.viewport.scrollTop ?? 0) + result.target.y - result.viewport.viewport.y - 1
  result.viewport.scrollTo(Math.max(0, offset))
  return true
}

function containsMessageRow(node: RenderTreeNode, messageIDs: ReadonlySet<string>): boolean {
  if (node.id && (messageIDs.has(node.id) || node.id.startsWith("session-part:"))) return true
  return node.getChildren().some((child) => containsMessageRow(child, messageIDs))
}

function containsAnyRow(node: RenderTreeNode, messageIDs: ReadonlySet<string>): boolean {
  if (node.id && messageIDs.has(node.id)) return true
  return node.getChildren().some((child) => containsAnyRow(child, messageIDs))
}

function findTranscriptViewport(
  node: RenderTreeNode,
  messageIDs: ReadonlySet<string>,
): RenderTreeNode | undefined {
  if (node.scrollTo && node.viewport && containsMessageRow(node, messageIDs)) return node
  for (const child of node.getChildren()) {
    const result = findTranscriptViewport(child, messageIDs)
    if (result) return result
  }
}

function waitForTranscriptLayout(context: Pick<Context, "renderer">): Promise<void> {
  return context.renderer.idle().then(() => new Promise((resolve) => setTimeout(resolve, transcriptLayoutWaitMs)))
}

function projectedRowCount(messages: readonly unknown[]): number {
  return messages.reduce<number>((count, message) => {
    if (!isRecord(message) || message.type !== "assistant" || !Array.isArray(message.content)) return count + 1
    return count + Math.max(1, message.content.length)
  }, 0)
}

function isFirstRenderedPart(messages: readonly unknown[], entry: SkillTimelineEntry): boolean {
  const message = messages.find((value) => isRecord(value) && value.id === entry.messageID)
  if (!isRecord(message) || message.type !== "assistant" || !Array.isArray(message.content)) return false
  for (const part of message.content) {
    if (!isRecord(part)) continue
    if ((part.type === "text" || part.type === "reasoning") &&
      (typeof part.text !== "string" || !part.text.trim())) continue
    return part.type === "tool" && part.id === entry.partID
  }
  return false
}

async function revealAndScrollToTimelineEntryV2(
  context: Context,
  sessionID: string,
  entry: SkillTimelineEntry,
  initialMessages: readonly unknown[],
): Promise<boolean> {
  const allowMessageBoundary = isFirstRenderedPart(initialMessages, entry)
  if (scrollToTimelineEntryV2(context, entry, allowMessageBoundary)) return true

  context.keymap.dispatch("session.first")
  let headMounted = false
  for (let attempt = 0; attempt < 250; attempt++) {
    await waitForTranscriptLayout(context)
    if (scrollToTimelineEntryV2(context, entry, allowMessageBoundary)) return true
    const root = context.renderer.root as unknown as RenderTreeNode
    const currentMessages = context.data.session.message.list(sessionID)
    const currentMessageIDs = new Set(currentMessages.map((message) => message.id))
    const headMessageIDs = new Set(currentMessages.slice(0, 20).map((message) => message.id))
    const viewport = findTranscriptViewport(root, currentMessageIDs)
    if (viewport && (viewport.scrollTop ?? Number.POSITIVE_INFINITY) <= 0 && containsAnyRow(root, headMessageIDs)) {
      headMounted = true
      break
    }
  }
  if (!headMounted) return false

  const messages = context.data.session.message.list(sessionID)
  const messageIDs = new Set(messages.map((message) => message.id))
  let unchangedHeight = 0
  let previousHeight: number | undefined
  for (let attempt = 0; attempt < projectedRowCount(messages); attempt++) {
    if (scrollToTimelineEntryV2(context, entry, allowMessageBoundary)) return true
    const root = context.renderer.root as unknown as RenderTreeNode
    const viewport = findTranscriptViewport(root, messageIDs)
    if (viewport?.scrollTo && typeof viewport.scrollHeight === "number") {
      unchangedHeight = viewport.scrollHeight === previousHeight ? unchangedHeight + 1 : 0
      previousHeight = viewport.scrollHeight
      if (unchangedHeight >= 3) break
      viewport.stickyScroll = false
      viewport.scrollTo(viewport.scrollHeight)
    }
    context.keymap.dispatch("session.page.down")
    await waitForTranscriptLayout(context)
  }
  return false
}

export async function openSkillTimelineV2(context: Context): Promise<boolean> {
  const sessionID = currentSessionID(context)
  if (!sessionID) {
    context.ui.toast.show({
      variant: "warning",
      title: "Skill Timeline v2",
      message: "Open a session before using /skill-timeline-v2.",
    })
    return false
  }

  await context.data.session.message.sync(sessionID)
  const messages = context.data.session.message.list(sessionID)
  const entries = extractV2SkillTimeline(sessionID, messages)
  if (entries.length === 0) {
    await context.ui.dialog.alert({ title: "Skill Timeline v2", message: "No skill calls in this session." })
    return true
  }

  const selected = await context.ui.dialog.select({
    title: "Skill Timeline v2",
    placeholder: "Search skill or context",
    options: entries.map((entry) => ({
      title: entry.skill,
      description: entry.context,
      footer: formatTimelineTime(entry.timestamp),
      value: entry,
    })),
  })
  if (selected && !await revealAndScrollToTimelineEntryV2(context, sessionID, selected, messages)) {
    context.ui.toast.show({
      variant: "warning",
      title: "Skill Timeline v2",
      message: "The exact skill call could not be located in the transcript.",
    })
  }
  return true
}

export function registerSkillTimelineV2(context: Context): void {
  context.keymap.layer(() => ({
    mode: "global",
    commands: [{
      id: "skill-timeline-v2.open",
      title: "Skill Timeline v2",
      description: "Review skill calls in the current session",
      group: "Session",
      palette: true,
      slash: { name: "skill-timeline-v2" },
      enabled: () => true,
      run: async () => {
        await openSkillTimelineV2(context)
      },
    }],
  }))
}
