Create a RAG-grounded visualization for the supplied answer.

## Context

- Question: {{question}}
- Subject: {{subject}}
- Task type: {{taskType}}
- Visualization spec:
{{visualizationSpec}}

## Required Result

- Preserve the original question and do not replace it with a generic demo.
- Show the relevant variables, formulae, algorithm state, or physical quantities from the RAG answer.
- Controls must change the visual state or step progression.
- Metrics must show the learner what to observe and why it matters.
- Use the same language as this specification for all user-facing text.

## Contract Reminder

Include `widget-config`, `#controls`, `#visualization`, `#metrics`, `#start-btn`, `#reset-btn`, `requestAnimationFrame`, and postMessage handlers for `SET_WIDGET_STATE`, `HIGHLIGHT_ELEMENT`, `ANNOTATE_ELEMENT`, `REVEAL_ELEMENT`.

Return ONLY the HTML document.
