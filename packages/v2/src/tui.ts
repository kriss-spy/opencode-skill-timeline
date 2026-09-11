import { Plugin } from "@opencode/plugin/tui"
import { registerSkillTimelineV2 } from "./adapter"

export default Plugin.define({
  id: "skill-timeline",
  setup(context) {
    registerSkillTimelineV2(context)
  },
})
