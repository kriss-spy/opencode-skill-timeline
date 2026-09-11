import type { Context } from "@opencode/plugin/tui/context"
import { extractSkillTimeline } from "../../../src/extract"
import { formatTimelineTime } from "../../../src/present"
import type { SkillTimelineEntry, TimelineMessage } from "../../../src/types"

type RecordValue = Record<string, unknown>

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
  const entries = extractV2SkillTimeline(sessionID, context.data.session.message.list(sessionID))
  if (entries.length === 0) {
    await context.ui.dialog.alert({ title: "Skill Timeline v2", message: "No skill calls in this session." })
    return true
  }

  await context.ui.dialog.select({
    title: "Skill Timeline v2",
    placeholder: "Search skill or context",
    options: entries.map((entry) => ({
      title: entry.skill,
      description: entry.context,
      footer: formatTimelineTime(entry.timestamp),
      value: entry.callID || entry.partID,
    })),
  })
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
