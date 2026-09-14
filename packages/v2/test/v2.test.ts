import { describe, expect, mock, test } from "bun:test"
import type { Context } from "@opencode-ai/plugin/tui/context"
import type { SkillTimelineEntry } from "../../../src/types"
import {
  extractV2SkillTimeline,
  openSkillTimelineV2,
  registerSkillTimelineV2,
  scrollToTimelineEntryV2,
} from "../src/adapter"
import v2Plugin from "../src/tui"

describe("OpenCode v2 adapter", () => {
  test("exports a v2-only plugin definition", () => {
    expect(v2Plugin.id).toBe("skill-timeline-v2")
    expect(typeof v2Plugin.setup).toBe("function")
    expect(v2Plugin).not.toHaveProperty("tui")
  })

  test("registers its keymap layer from a TUI render scope", () => {
    const layer = mock(() => {})
    const dispose = mock(() => {})
    let claim: { append?: string; render?: () => unknown } | undefined
    const context = {
      keymap: { layer },
      ui: {
        slot(value: typeof claim) {
          claim = value
          return dispose
        },
      },
    }

    const cleanup = v2Plugin.setup(context as never)

    expect(claim?.append).toBe("app")
    expect(layer).not.toHaveBeenCalled()
    claim?.render?.()
    expect(layer).toHaveBeenCalledTimes(1)
    expect(cleanup).toBe(dispose)
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

  test("reads the native v2 skill id input", () => {
    const entries = extractV2SkillTimeline("session-2", [{
      id: "assistant-1",
      type: "assistant",
      time: { created: 200 },
      content: [{
        id: "tool-1",
        type: "tool",
        name: "skill",
        state: { status: "completed", input: { id: "opencode" }, content: [{ type: "text", text: "loaded" }] },
        time: { created: 220, ran: 225, completed: 230 },
      }],
    }])

    expect(entries[0]).toMatchObject({ skill: "opencode", status: "completed" })
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

  test("scrolls the session viewport to the skill selected with Enter", () => {
    const scrollTo = mock(() => {})
    const viewport = {
      id: "session-scroll",
      y: 2,
      scrollTop: 20,
      stickyScroll: true,
      viewport: { y: 4 },
      scrollTo,
      getChildren: () => [skillRow],
    }
    const skillRow = {
      // OpenCode gives the first assistant row the message boundary ID.
      id: "assistant-1",
      y: 30,
      getChildren: () => [],
    }
    const root = {
      id: "root",
      y: 0,
      getChildren: () => [viewport],
    }
    const entry = extractV2SkillTimeline("session-2", [{
      id: "assistant-1",
      type: "assistant",
      time: { created: 200 },
      content: [{
        id: "tool-1",
        type: "tool",
        name: "skill",
        state: { status: "completed", input: { id: "testing" } },
        time: { created: 220, ran: 230, completed: 240 },
      }],
    }])[0]

    expect(scrollToTimelineEntryV2({ renderer: { root } } as unknown as Context, entry, true)).toBe(true)
    expect(viewport.stickyScroll).toBe(false)
    expect(scrollTo).toHaveBeenCalledWith(45)
  })

  test("does not use a same-skill message boundary for a later repeated call", () => {
    const scrollTo = mock(() => {})
    const firstSkillRow = {
      id: "assistant-1",
      y: 10,
      plainText: 'Skill "testing"',
      getChildren: () => [],
    }
    const viewport = {
      id: "session-scroll",
      y: 2,
      scrollTop: 0,
      viewport: { y: 4 },
      scrollTo,
      getChildren: () => [firstSkillRow],
    }
    const entry = {
      sessionID: "session-2",
      messageID: "assistant-1",
      anchorMessageID: "user-1",
      partID: "tool-2",
      callID: "tool-2",
      skill: "testing",
      timestamp: 240,
      sequence: 1,
      context: "Load it again.",
      status: "completed",
    } satisfies SkillTimelineEntry

    expect(scrollToTimelineEntryV2({
      renderer: { root: { id: "root", y: 0, getChildren: () => [viewport] } },
    } as unknown as Context, entry)).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  test("uses the selected entry returned by the native dialog", async () => {
    const scrollTo = mock(() => {})
    const skillRow = {
      id: "session-part:assistant-1:tool-1",
      y: 30,
      getChildren: () => [],
    }
    const viewport = {
      id: "session-scroll",
      y: 2,
      scrollTop: 0,
      stickyScroll: true,
      viewport: { y: 4 },
      scrollTo,
      getChildren: () => [skillRow],
    }
    const show = mock(() => {})
    const context = {
      renderer: { root: { id: "root", y: 0, getChildren: () => [viewport] } },
      ui: {
        router: { current: () => ({ type: "session", sessionID: "session-2" }) },
        toast: { show },
        dialog: {
          alert: mock(async () => {}),
          select: mock(async (options: { options: { value: SkillTimelineEntry }[] }) => options.options[0].value),
        },
      },
      data: {
        session: {
          message: {
            sync: mock(async () => {}),
            list: () => [{
              id: "assistant-1",
              type: "assistant",
              time: { created: 200 },
              content: [
                { type: "text", text: "I will load the skill." },
                {
                  id: "tool-1",
                  type: "tool",
                  name: "skill",
                  state: { status: "completed", input: { id: "testing" } },
                  time: { created: 220, ran: 230, completed: 240 },
                },
              ],
            }],
          },
        },
      },
    } as unknown as Context

    expect(await openSkillTimelineV2(context)).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith(25)
    expect(show).not.toHaveBeenCalled()
  })

  test("reveals virtualized history before locating an unmounted skill row", async () => {
    const scrollTo = mock(() => {})
    const children: Array<{ id: string; y: number; getChildren: () => never[] }> = []
    const viewport = {
      id: "session-scroll",
      y: 2,
      scrollTop: 0,
      scrollHeight: 100,
      stickyScroll: true,
      viewport: { y: 4 },
      scrollTo,
      getChildren: () => children,
    }
    let loadingHead = false
    let idleCalls = 0
    const currentMessages: unknown[] = [{
      id: "assistant-1",
      type: "assistant",
      time: { created: 200 },
      content: [{
        id: "tool-1",
        type: "tool",
        name: "skill",
        state: { status: "completed", input: { id: "testing" } },
        time: { created: 220, ran: 230, completed: 240 },
      }],
    }]
    const dispatch = mock((id: string) => {
      if (id === "session.first") loadingHead = true
      if (id === "session.page.down") children.push({ id: "assistant-1", y: 30, getChildren: () => [] })
    })
    const idle = mock(async () => {
      idleCalls++
      if (loadingHead && idleCalls === 2) {
        currentMessages.unshift({ id: "user-0", type: "user", text: "Start", time: { created: 100 } })
        children.push({ id: "user-0", y: 5, getChildren: () => [] })
      }
    })
    const context = {
      renderer: {
        root: { id: "root", y: 0, getChildren: () => [viewport] },
        idle,
      },
      keymap: { dispatch },
      ui: {
        router: { current: () => ({ type: "session", sessionID: "session-2" }) },
        toast: { show: mock(() => {}) },
        dialog: {
          alert: mock(async () => {}),
          select: mock(async (options: { options: { value: SkillTimelineEntry }[] }) => options.options[0].value),
        },
      },
      data: {
        session: {
          message: {
            sync: mock(async () => {}),
            list: () => currentMessages,
          },
        },
      },
    } as unknown as Context

    expect(await openSkillTimelineV2(context)).toBe(true)
    expect(dispatch).toHaveBeenCalledWith("session.first")
    expect(dispatch).toHaveBeenCalledWith("session.page.down")
    expect(scrollTo).toHaveBeenCalledWith(25)
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
