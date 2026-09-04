import { describe, expect, test } from "bun:test"
import { extractSkillTimeline } from "../src/extract"
import type { TimelineMessage } from "../src/types"

describe("extractSkillTimeline", () => {
  test("uses preceding visible assistant text for a structured skill call", () => {
    const messages: TimelineMessage[] = [
      { id: "msg-user", sessionID: "session-1", role: "user", time: { created: 100 } },
      { id: "msg-assistant", sessionID: "session-1", role: "assistant", time: { created: 200 } },
    ]
    const parts = new Map<string, unknown[]>([
      ["msg-user", [{ id: "text-user", type: "text", text: "Review this release." }]],
      ["msg-assistant", [
        { id: "text-assistant", type: "text", text: "The code is ready.\nI should review it now." },
        {
          id: "part-skill",
          type: "tool",
          callID: "call-skill",
          tool: "skill",
          state: { status: "completed", input: { name: "plugin-review" }, time: { start: 250, end: 260 } },
        },
      ]],
    ])

    expect(extractSkillTimeline(messages, (messageID) => parts.get(messageID) ?? [])).toEqual([
      {
        sessionID: "session-1",
        messageID: "msg-assistant",
        anchorMessageID: "msg-user",
        partID: "part-skill",
        callID: "call-skill",
        skill: "plugin-review",
        timestamp: 250,
        context: "The code is ready. I should review it now.",
        status: "completed",
      },
    ])
  })

  test("falls back to visible user text and includes repeated, running, and failed calls", () => {
    const messages: TimelineMessage[] = [
      { id: "msg-user", sessionID: "session-1", role: "user", time: { created: 100 } },
      { id: "msg-assistant", sessionID: "session-1", role: "assistant", time: { created: 200 } },
    ]
    const parts = new Map<string, unknown[]>([
      ["msg-user", [{ id: "text-user", type: "text", text: "  Run\n the   testing skill. " }]],
      ["msg-assistant", [
        { id: "reasoning", type: "reasoning", text: "hidden reasoning must not become context" },
        {
          id: "part-running",
          type: "tool",
          callID: "call-running",
          tool: "skill",
          state: { status: "running", input: { name: "testing" }, time: { start: 300 } },
        },
        {
          id: "part-error",
          type: "tool",
          callID: "call-error",
          tool: "skill",
          state: { status: "error", input: { name: "testing" }, time: { start: 400, end: 410 }, error: "denied" },
        },
      ]],
    ])

    const result = extractSkillTimeline(messages, (messageID) => parts.get(messageID) ?? [])

    expect(result.map((entry) => ({ callID: entry.callID, context: entry.context, status: entry.status }))).toEqual([
      { callID: "call-error", context: "Run the testing skill.", status: "error" },
      { callID: "call-running", context: "Run the testing skill.", status: "running" },
    ])
  })

  test("ignores synthetic text, uses message time when tool time is unavailable, and keeps equal-time session order", () => {
    const messages: TimelineMessage[] = [
      { id: "msg-user", sessionID: "session-1", role: "user", time: { created: 100 } },
      { id: "msg-assistant", sessionID: "session-1", role: "assistant", time: { created: 500 } },
    ]
    const parts = new Map<string, unknown[]>([
      ["msg-user", [{ id: "text-user", type: "text", text: "Use both skills." }]],
      ["msg-assistant", [
        { id: "synthetic", type: "text", text: "secret", synthetic: true },
        { id: "part-first", type: "tool", callID: "first", tool: "skill", state: { status: "pending", input: { name: "first" } } },
        { id: "part-second", type: "tool", callID: "second", tool: "skill", state: { status: "pending", input: { name: "second" } } },
      ]],
    ])

    const result = extractSkillTimeline(messages, (messageID) => parts.get(messageID) ?? [])

    expect(result.map((entry) => [entry.callID, entry.timestamp, entry.context])).toEqual([
      ["first", 500, "Use both skills."],
      ["second", 500, "Use both skills."],
    ])
  })

  test("does not carry assistant context across a newer user turn", () => {
    const messages: TimelineMessage[] = [
      { id: "msg-old-assistant", sessionID: "session-1", role: "assistant", time: { created: 100 } },
      { id: "msg-new-user", sessionID: "session-1", role: "user", time: { created: 200 } },
      { id: "msg-new-assistant", sessionID: "session-1", role: "assistant", time: { created: 300 } },
    ]
    const parts = new Map<string, unknown[]>([
      ["msg-old-assistant", [{ type: "text", text: "Stale assistant context." }]],
      ["msg-new-user", [{ type: "text", text: "Review the current beta." }]],
      ["msg-new-assistant", [{
        id: "part-review",
        type: "tool",
        callID: "call-review",
        tool: "skill",
        state: { status: "running", input: { name: "code-review" }, time: { start: 350 } },
      }]],
    ])

    expect(extractSkillTimeline(messages, (messageID) => parts.get(messageID) ?? [])[0]?.context)
      .toBe("Review the current beta.")
  })

  test("does not carry user context across a textless user turn", () => {
    const messages: TimelineMessage[] = [
      { id: "msg-old-user", sessionID: "session-1", role: "user", time: { created: 100 } },
      { id: "msg-new-user", sessionID: "session-1", role: "user", time: { created: 200 } },
      { id: "msg-assistant", sessionID: "session-1", role: "assistant", time: { created: 300 } },
    ]
    const parts = new Map<string, unknown[]>([
      ["msg-old-user", [{ type: "text", text: "Stale user context." }]],
      ["msg-new-user", [{ type: "file", filename: "release-notes.md" }]],
      ["msg-assistant", [{
        id: "part-review",
        type: "tool",
        callID: "call-review",
        tool: "skill",
        state: { status: "running", input: { name: "code-review" }, time: { start: 350 } },
      }]],
    ])

    const entry = extractSkillTimeline(messages, (messageID) => parts.get(messageID) ?? [])[0]
    expect(entry?.context).toBe("—")
    expect(entry?.anchorMessageID).toBe("msg-old-user")
  })
})
