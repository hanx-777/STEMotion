Create a simulation widget for: {{title}}

## Context

- Concept: {{concept}}
- Description: {{description}}
- Learning goals:
{{learningGoals}}
- Variables:
{{variables}}
- Outline:
{{outline}}
- Widget outline:
{{widgetOutline}}

## Required Result

- Build a problem-specific simulation, not a generic demo.
- The controls must map to the listed variables.
- The visualization must make the core relationship observable through motion, graph change, or state transition.
- The metrics must help the learner connect variables, formulae, and result.
- Use the same language as this specification for all user-facing text.

## Contract Reminder

Include `widget-config`, `#controls`, `#visualization`, `#metrics`, `#start-btn`, `#reset-btn`, `requestAnimationFrame`, and the postMessage handlers for `SET_WIDGET_STATE`, `HIGHLIGHT_ELEMENT`, `ANNOTATE_ELEMENT`, `REVEAL_ELEMENT`.

Return ONLY the HTML document.
