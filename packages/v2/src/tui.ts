import { registerSkillTimelineV2 } from "./adapter"

export default {
  id: "skill-timeline-v2",
  setup(context) {
    return context.ui.slot({
      append: "app",
      render() {
        registerSkillTimelineV2(context)
        return null
      },
    })
  },
} satisfies import("@opencode-ai/plugin/tui/plugin").Definition
