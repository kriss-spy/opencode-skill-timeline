import type { SkillTimelineEntry } from "./types"

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

export function filterTimeline(entries: readonly SkillTimelineEntry[], query: string): SkillTimelineEntry[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return [...entries]
  return entries.filter((entry) => `${entry.skill}\n${entry.context}`.toLocaleLowerCase().includes(needle))
}

export function timelineRowWidth(terminalWidth: number): number {
  return Math.max(8, Math.min(72, Math.floor(terminalWidth) - 22))
}

export function formatTimelineRow(entry: SkillTimelineEntry, width: number): string {
  const available = Math.max(0, Math.floor(width))
  if (available < 10) return truncate(entry.skill, available)

  const skillWidth = Math.min(
    Bun.stringWidth(entry.skill),
    24,
    Math.max(8, Math.floor(available * 0.4)),
    available - 2,
  )
  const contextWidth = available - skillWidth - 1
  return `${pad(truncate(entry.context, contextWidth), contextWidth)} ${truncate(entry.skill, skillWidth)}`
}

export function formatTimelineTime(timestamp: number, locale?: string, timeZone?: string): string {
  return new Date(timestamp).toLocaleTimeString(locale, {
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  })
}
