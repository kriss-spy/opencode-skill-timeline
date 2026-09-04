import type { SkillCallStatus, SkillTimelineEntry, TimelineMessage } from "./types"

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function visibleText(part: unknown): string | undefined {
  if (!isRecord(part) || part.type !== "text" || typeof part.text !== "string") return
  if (part.synthetic === true || part.ignored === true) return
  const text = part.text.replace(/\s+/gu, " ").trim()
  return text || undefined
}

function skillPart(part: unknown): RecordValue | undefined {
  if (!isRecord(part) || part.type !== "tool" || part.tool !== "skill") return
  if (!isRecord(part.state) || !isRecord(part.state.input)) return
  return part
}

function skillName(part: RecordValue): string {
  const state = part.state as RecordValue
  const input = state.input as RecordValue
  return typeof input.name === "string" && input.name.trim() ? input.name.trim() : "(unknown skill)"
}

function status(part: RecordValue): SkillCallStatus {
  const value = (part.state as RecordValue).status
  if (value === "completed" || value === "error") return value
  return "running"
}

function timestamp(part: RecordValue, fallback: number): number {
  const state = part.state as RecordValue
  if (!isRecord(state.time) || typeof state.time.start !== "number") return fallback
  return state.time.start
}

export function extractSkillTimeline(
  messages: readonly TimelineMessage[],
  partsForMessage: (messageID: string) => readonly unknown[],
): SkillTimelineEntry[] {
  let precedingAssistantText: string | undefined
  let precedingUserText: string | undefined
  let anchorMessageID: string | undefined
  const entries: Array<SkillTimelineEntry & { order: number }> = []
  let order = 0

  for (const message of messages) {
    if (message.role === "user") {
      precedingAssistantText = undefined
      precedingUserText = undefined
      anchorMessageID = message.id
    }

    for (const part of partsForMessage(message.id)) {
      const text = visibleText(part)
      if (text) {
        if (message.role === "assistant") precedingAssistantText = text
        else precedingUserText = text
        continue
      }

      const tool = skillPart(part)
      if (!tool) continue
      entries.push({
        sessionID: message.sessionID,
        messageID: message.id,
        anchorMessageID: anchorMessageID ?? message.id,
        partID: typeof tool.id === "string" ? tool.id : "",
        callID: typeof tool.callID === "string" ? tool.callID : "",
        skill: skillName(tool),
        timestamp: timestamp(tool, message.time.created),
        context: precedingAssistantText ?? precedingUserText ?? "—",
        status: status(tool),
        order: order++,
      })
    }
  }

  return entries
    .sort((left, right) => right.timestamp - left.timestamp || left.order - right.order)
    .map(({ order: _, ...entry }) => entry)
}
