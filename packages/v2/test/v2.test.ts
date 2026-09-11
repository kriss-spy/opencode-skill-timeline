import { describe, expect, mock, test } from "bun:test"
import type { Context } from "@opencode/plugin/tui/context"
import { extractV2SkillTimeline, openSkillTimelineV2, registerSkillTimelineV2 } from "../src/adapter"
import v2Plugin from "../src/tui"

describe("OpenCode v2 adapter", () => {
  test("exports a v2-only plugin definition", () => {
    expect(v2Plugin).toMatchObject({ id: "skill-timeline-v2", setup: expect.any(Function) })
    expect(v2Plugin).not.toHaveProperty("tui")
  })

  test("extracts v2 skill tools while preserving visible turn context", () => {
    const entries = extractV2SkillTimeline("session-2", [
      { id: "user-1", type: "user", text: "Review the v2 port.", time: { created: 100 } },
      {
        id: "assistant-1",
        type: "assistant",
        time: { created: 200 },
        content: [
          { type: "text", text: "I will inspect the public API." },
          {
            id: "tool-1",
            type: "tool",
            name: "skill",
            state: { status: "completed", input: { name: "code-review" }, content: [] },
            time: { created: 220, ran: 250, completed: 300 },
          },
        ],
      },
    ])

    expect(entries).toEqual([{
      sessionID: "session-2",
      messageID: "assistant-1",
      anchorMessageID: "user-1",
      partID: "tool-1",
      callID: "tool-1",
      skill: "code-review",
      timestamp: 250,
      sequence: 0,
      context: "I will inspect the public API.",
      status: "completed",
    }])
  })

  test("ignores top-level skill attachments and unrelated tools", () => {
    const entries = extractV2SkillTimeline("session-2", [
      { id: "skill-attachment", type: "skill", skill: "testing", name: "testing", text: "...", time: { created: 100 } },
      {
        id: "assistant-1",
        type: "assistant",
        time: { created: 200 },
        content: [{
          id: "tool-1",
          type: "tool",
          name: "bash",
          state: { status: "running", input: { command: "bun test" }, metadata: {} },
          time: { created: 220, ran: 230 },
        }],
      },
    ])

    expect(entries).toEqual([])
  })

  test("keeps a streaming skill call visible before its JSON input is complete", () => {
    const entries = extractV2SkillTimeline("session-2", [{
      id: "assistant-1",
      type: "assistant",
      time: { created: 200 },
      content: [{
        id: "tool-1",
        type: "tool",
        name: "skill",
        state: { status: "streaming", input: "{\"name\":\"test" },
        time: { created: 220 },
      }],
    }])

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ skill: "(unknown skill)", status: "running", timestamp: 220 })
  })

  test("registers and opens the v2 slash command from public APIs", async () => {
    let layerFactory: (() => { commands?: readonly { id?: string; slash?: { name: string }; run: () => Promise<void> }[] }) | undefined
    const sync = mock(async () => {})
    const select = mock(async () => undefined)
    const context = {
      ui: {
        router: { current: () => ({ type: "session", sessionID: "session-2" }) },
        toast: { show: mock(() => {}) },
        dialog: { alert: mock(async () => {}), select },
      },
      data: {
        session: {
          message: {
            sync,
            list: () => [{
              id: "assistant-1",
              type: "assistant",
              time: { created: 200 },
              content: [{
                id: "tool-1",
                type: "tool",
                name: "skill",
                state: { status: "running", input: { name: "testing" }, metadata: {} },
                time: { created: 220, ran: 230 },
              }],
            }],
          },
        },
      },
      keymap: { layer: (factory: typeof layerFactory) => { layerFactory = factory } },
    } as unknown as Context

    registerSkillTimelineV2(context)
    const command = layerFactory?.().commands?.[0]
    expect(command).toMatchObject({ id: "skill-timeline-v2.open", slash: { name: "skill-timeline-v2" } })
    await command?.run()

    expect(sync).toHaveBeenCalledWith("session-2")
    expect(select).toHaveBeenCalledWith(expect.objectContaining({
      title: "Skill Timeline v2",
      options: [expect.objectContaining({ title: "testing" })],
    }))
  })

  test("warns outside a v2 session", async () => {
    const show = mock(() => {})
    const context = {
      ui: {
        router: { current: () => ({ type: "home" }) },
        toast: { show },
      },
    } as unknown as Context

    expect(await openSkillTimelineV2(context)).toBe(false)
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" }))
  })
})
