import { describe, expect, test } from "bun:test"
import { filterTimeline, formatTimelineFooter, formatTimelineTime, timelineSkillWidth } from "../src/present"
import type { SkillTimelineEntry } from "../src/types"

const entry: SkillTimelineEntry = {
  sessionID: "session-1",
  messageID: "message-1",
  anchorMessageID: "user-message-1",
  partID: "part-1",
  callID: "call-1",
  skill: "domain-modeling-with-a-long-name",
  timestamp: new Date("2026-09-04T09:01:00Z").getTime(),
  context: "Compare the proposed terminology with the current domain model.",
  status: "completed",
}

describe("timeline presentation", () => {
  test("filters against full context and skill names, not truncated row text", () => {
    expect(filterTimeline([entry], "current domain")).toEqual([entry])
    expect(filterTimeline([entry], "DOMAIN-MODELING")).toEqual([entry])
    expect(filterTimeline([entry], "missing")).toEqual([])
  })

  test("protects a stable skill column and truncates only genuine overflow", () => {
    expect(formatTimelineFooter("testing", "9:01 AM", 12, 8)).toBe("testing       9:01 AM")
    expect(formatTimelineFooter(entry.skill, "9:01 AM", 12, 8)).toBe("domain-mode…  9:01 AM")
    expect(timelineSkillWidth(50)).toBe(10)
    expect(timelineSkillWidth(80)).toBe(21)
    expect(timelineSkillWidth(160)).toBe(32)
  })

  test("uses the requested locale and timezone without imposing plugin defaults", () => {
    expect(formatTimelineTime(entry.timestamp, "en-US", "UTC")).toBe("9:01 AM")
    expect(formatTimelineTime(entry.timestamp, "en-GB", "UTC")).toBe("09:01")
  })
})
