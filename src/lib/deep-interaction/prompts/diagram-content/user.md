Create an interactive diagram for: {{title}}

## Diagram Type

{{diagramType}}

## Description

{{description}}

## Key Points / Learning Goals

{{learningGoals}}

## Outline

{{outline}}

## Widget Outline

{{widgetOutline}}

## Language

Use the same language as this specification for all UI text.

---

Generate a complete, interactive HTML diagram with these MANDATORY features:

### Structure
1. **Embedded JSON config** in `<script type="application/json" id="widget-config">`
2. **SVG-based** node graph with edges
3. **Expand/collapse** interaction on nodes
4. **Step-by-step reveal** support

### Diagram Design
1. SVG nodes with icons/labels and click-to-show details
2. Edges with arrows connecting nodes
3. High contrast — nodes readable on background
4. First node visible on load, others revealed progressively
5. Mobile-friendly — panel collapsible, doesn't block diagram

### Interaction
1. Click node to expand/collapse children
2. Click node to show detail in panel
3. Expand all / Collapse all buttons
4. Reset view button
5. Smooth transitions with requestAnimationFrame

### Output
Return ONLY the HTML document. No markdown fences, no explanations.
