import type { SkillTimelineEntry } from "./types"

const contextColumnBreakpoint = 60

function truncate(value: string, width: number): string {
  if (width <= 0) return ""
  if (Bun.stringWidth(value) <= width) return value
  if (width === 1) return "…"

  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  let output = ""
  for (const { segment } of segmenter.segment(value)) {
    if (Bun.stringWidth(output + segment) > width - 1) break
    output += segment
  }
  return `${output}…`
}

function pad(value: string, width: number): string {
  return value + " ".repeat(Math.max(0, width - Bun.stringWidth(value)))
}

function padStart(value: string, width: number): string {
  return " ".repeat(Math.max(0, width - Bun.stringWidth(value))) + value
}

export function filterTimeline(entries: readonly SkillTimelineEntry[], query: string): SkillTimelineEntry[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return [...entries]
  return entries.filter((entry) => `${entry.skill}\n${entry.context}`.toLocaleLowerCase().includes(needle))
}

export function timelineSkillWidth(terminalWidth: number): number {
  return Math.max(8, Math.min(32, Math.floor((Math.max(0, terminalWidth) - 20) * 0.35)))
}

export function timelineShowsContext(terminalWidth: number): boolean {
  return terminalWidth > contextColumnBreakpoint
}

export function formatTimelineFooter(skill: string, time: string, skillWidth: number, timeWidth: number): string {
  return `${pad(truncate(skill, skillWidth), skillWidth)} ${padStart(time, timeWidth)}`
}

export function formatTimelineRow(
  entry: SkillTimelineEntry,
  time: string,
  terminalWidth: number,
  timeWidth: number,
): { title: string; footer: string } {
  if (!timelineShowsContext(terminalWidth)) return { title: entry.skill, footer: time }
  return {
    title: entry.context,
    footer: formatTimelineFooter(entry.skill, time, timelineSkillWidth(terminalWidth), timeWidth),
  }
}

export function formatTimelineTime(timestamp: number, locale?: string, timeZone?: string): string {
  return new Date(timestamp).toLocaleTimeString(locale, {
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  })
}
