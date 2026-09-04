export type SkillCallStatus = "running" | "completed" | "error"

export interface SkillTimelineEntry {
  sessionID: string
  messageID: string
  anchorMessageID: string
  partID: string
  callID: string
  skill: string
  timestamp: number
  context: string
  status: SkillCallStatus
}

export interface TimelineMessage {
  id: string
  sessionID: string
  role: "user" | "assistant"
  time: {
    created: number
  }
}
