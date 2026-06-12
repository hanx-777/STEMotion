Create an interactive diagram for: {{title}}

## Context

- Diagram type: {{diagramType}}
- Description: {{description}}
- Learning goals:
{{learningGoals}}
- Outline:
{{outline}}
- Widget outline:
{{widgetOutline}}

## Required Result

- Build a topic-specific SVG diagram or mind map.
- Show the central idea first, then reveal connected ideas progressively.
- Nodes must support click-to-detail and expand/collapse.
- Edges must clearly encode sequence, hierarchy, cause, or relation.
- Use the same language as this specification for all user-facing text.

## Contract Reminder

Include `widget-config`, `#controls`, `#visualization`, `#metrics`, `#reset-btn`, `requestAnimationFrame`, and postMessage handlers for `SET_WIDGET_STATE`, `HIGHLIGHT_ELEMENT`, `ANNOTATE_ELEMENT`, `REVEAL_ELEMENT`.

Return ONLY the HTML document.
