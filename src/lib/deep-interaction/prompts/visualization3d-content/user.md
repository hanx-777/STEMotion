Create a 3D visualization widget for: {{title}}

## Context

- Visualization type: {{visualizationType}}
- Description: {{description}}
- Learning goals:
{{learningGoals}}
- Objects to visualize:
{{objects}}
- Interactions:
{{interactions}}
- Variables:
{{variables}}
- Widget outline:
{{widgetOutline}}

## Required Result

- Build a scene that directly represents the requested concept, not a decorative 3D stage.
- Make important objects visible at initial load with lighting, labels, and camera framing.
- At least one control must change geometry, motion, visibility, scale, or measured values.
- Include orbit controls, reset view, zoom +/- buttons, metrics, and optional auto-rotation.
- Use the same language as this specification for all user-facing text.

## Contract Reminder

Include `widget-config`, `#container`, `#controls`, `#metrics`, `#reset-btn`, `requestAnimationFrame`, Three.js importmap, and postMessage handlers for `SET_WIDGET_STATE`, `HIGHLIGHT_ELEMENT`, `ANNOTATE_ELEMENT`, `REVEAL_ELEMENT`.

Return ONLY the HTML document.
