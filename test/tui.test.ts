import { describe, expect, mock, test } from "bun:test"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { openSkillTimeline, registerSkillTimeline, scrollToTimelineEntry, selectTimelineEntry } from "../src/tui"
import type { SkillTimelineEntry } from "../src/types"

interface RegisteredCommand {
  name: string
  title: string
  category: string
  namespace: string
  slashName: string
  enabled: () => boolean
  run: () => unknown
}

interface RegisteredLayer {
  mode?: string
  commands: RegisteredCommand[]
}

function fakeApi(input?: { inSession?: boolean; parts?: readonly unknown[] }) {
  let layer: RegisteredLayer | undefined
  const toast = mock(() => {})
  const replace = mock(() => {})
  const setSize = mock(() => {})
  const clear = mock(() => {})
  const messages = input?.inSession === false
    ? []
    : [{ id: "message-1", sessionID: "session-1", role: "assistant", time: { created: 100 } }]

  const api = {
    route: {
      current: input?.inSession === false
        ? { name: "home" }
        : { name: "session", params: { sessionID: "session-1" } },
    },
    state: {
      ready: true,
      session: { messages: () => messages },
      part: () => input?.parts ?? [],
    },
    keymap: {
      registerLayer: (value: RegisteredLayer) => {
        layer = value
        return () => {}
      },
    },
    ui: {
      DialogAlert: () => null,
      DialogSelect: () => null,
      dialog: { clear, replace, setSize },
      toast,
    },
  } as unknown as TuiPluginApi

  return { api, clear, getLayer: () => layer, replace, setSize, toast }
}

describe("skill timeline TUI registration", () => {
  test("registers a session-scoped /skill-timeline palette command", () => {
    const harness = fakeApi()
    registerSkillTimeline(harness.api)

    expect(harness.getLayer()).toMatchObject({
      commands: [{
        name: "skill-timeline.open",
        title: "Skill Timeline",
        category: "Session",
        namespace: "palette",
        slashName: "skill-timeline",
      }],
    })
    expect(harness.getLayer()!.mode).toBeUndefined()
    expect(harness.getLayer()!.commands[0].enabled()).toBe(true)
  })

  test("rejects the command outside a session with a native warning", () => {
    const harness = fakeApi({ inSession: false })
    registerSkillTimeline(harness.api)

    expect(harness.getLayer()!.commands[0].enabled()).toBe(true)
    expect(openSkillTimeline(harness.api)).toBe(false)
    expect(harness.toast).toHaveBeenCalledWith({
      variant: "warning",
      title: "Skill Timeline",
      message: "Open a session before using /skill-timeline.",
    })
  })

  test("opens a clear native empty state when the session has no skill calls", () => {
    const harness = fakeApi()

    expect(openSkillTimeline(harness.api)).toBe(true)
    expect(harness.setSize).toHaveBeenCalledWith("medium")
    expect(harness.replace).toHaveBeenCalledTimes(1)
  })

  test("opens the timeline when a structured skill call exists", () => {
    const harness = fakeApi({
      parts: [{
        id: "part-1",
        callID: "call-1",
        type: "tool",
        tool: "skill",
        state: { status: "completed", input: { name: "testing" }, time: { start: 100, end: 101 } },
      }],
    })

    expect(openSkillTimeline(harness.api)).toBe(true)
    expect(harness.replace).toHaveBeenCalledTimes(1)
  })

  test("locates the turn-start message using the session viewport", () => {
    const scrollBy = mock(() => {})
    const target = { id: "user-message-1", y: 12, getChildren: () => [] }
    const viewport = { id: "session-scroll", y: 3, getChildren: () => [target], scrollBy }
    const root = { id: "root", y: 0, getChildren: () => [viewport] }
    const api = { renderer: { root } } as unknown as TuiPluginApi
    const entry = {
      sessionID: "session-1",
      messageID: "assistant-message-1",
      anchorMessageID: "user-message-1",
      partID: "part-1",
      callID: "call-1",
      skill: "testing",
      timestamp: 100,
      context: "Run the tests.",
      status: "completed",
    } satisfies SkillTimelineEntry

    expect(scrollToTimelineEntry(api, entry)).toBe(true)
    expect(scrollBy).toHaveBeenCalledWith(8)
  })

  test("warns only when the containing message cannot be rendered", () => {
    const harness = fakeApi()
    const root = { id: "root", y: 0, getChildren: () => [] }
    ;(harness.api as unknown as { renderer: { root: typeof root } }).renderer = { root }
    const entry = {
      sessionID: "session-1",
      messageID: "assistant-message-1",
      anchorMessageID: "missing-user-message",
      partID: "part-1",
      callID: "call-1",
      skill: "testing",
      timestamp: 100,
      context: "Run the tests.",
      status: "completed",
    } satisfies SkillTimelineEntry

    expect(selectTimelineEntry(harness.api, entry)).toBe(false)
    expect(harness.clear).toHaveBeenCalledTimes(1)
    expect(harness.toast).toHaveBeenCalledWith({
      variant: "warning",
      title: "Skill Timeline",
      message: "The containing message is not currently rendered.",
    })
  })
})
