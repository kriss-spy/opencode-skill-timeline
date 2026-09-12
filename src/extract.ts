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
  // OpenCode V2's native skill tool uses `id`; older/plugin-shaped calls use
  // `name`. Accept both so the timeline reflects the actual tool input.
  for (const key of ["name", "id", "skill"] as const) {
    if (typeof input[key] === "string" && input[key].trim()) return input[key].trim()
  }
  return "(unknown skill)"
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
  const entries: SkillTimelineEntry[] = []
  let order = 0

  for (const message of messages) {
    if (message.role === "user") {
      precedingAssistantText = undefined
      precedingUserText = undefined
    }

    for (const part of partsForMessage(message.id)) {
      const text = visibleText(part)
      if (text) {
        if (message.role === "assistant") precedingAssistantText = text
        else {
          precedingUserText = text
          anchorMessageID = message.id
        }
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
        sequence: order++,
        context: precedingAssistantText ?? precedingUserText ?? "—",
        status: status(tool),
      })
    }
  }

  return entries.sort((left, right) => right.timestamp - left.timestamp || left.sequence - right.sequence)
}
