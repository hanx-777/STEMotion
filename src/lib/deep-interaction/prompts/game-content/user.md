Create an educational game widget for: {{title}}

## Context

- Game type: {{gameType}}
- Description: {{description}}
- Learning goals:
{{learningGoals}}
- Variables:
{{variables}}
- Design outline:
{{outline}}
- Widget outline:
{{widgetOutline}}

## Required Result

- Build an interactive game, not a multiple-choice quiz.
- The player must control a meaningful object, parameter, or decision.
- The game objective must teach the concept through action and feedback.
- Include a fair start, score/status feedback, pause, reset, and replayable challenge.
- Use the same language as this specification for all user-facing text.

## Contract Reminder

Include `widget-config`, `#controls`, `#visualization`, `#metrics`, `#start-btn`, `#reset-btn`, `requestAnimationFrame`, global `startGame()` / `resetGame()`, and postMessage handlers for `SET_WIDGET_STATE`, `HIGHLIGHT_ELEMENT`, `ANNOTATE_ELEMENT`, `REVEAL_ELEMENT`.

Return ONLY the HTML document.
