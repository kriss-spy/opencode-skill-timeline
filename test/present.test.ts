import { describe, expect, test } from "bun:test"
import { filterTimeline, formatTimelineRow, formatTimelineTime, timelineRowWidth } from "../src/present"
import type { SkillTimelineEntry } from "../src/types"

const entry: SkillTimelineEntry = {
  sessionID: "session-1",
  messageID: "message-1",
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

  test("keeps the skill visible and bounds the row at narrow widths", () => {
    expect(formatTimelineRow(entry, 24)).toBe("Compare the p… domain-m…")
    expect(Bun.stringWidth(formatTimelineRow(entry, 24))).toBe(24)
    expect(timelineRowWidth(80)).toBe(58)
    expect(timelineRowWidth(20)).toBe(8)
    expect(timelineRowWidth(120)).toBe(72)
  })

  test("uses the requested locale and timezone without imposing plugin defaults", () => {
    expect(formatTimelineTime(entry.timestamp, "en-US", "UTC")).toBe("9:01 AM")
    expect(formatTimelineTime(entry.timestamp, "en-GB", "UTC")).toBe("09:01")
  })
})
