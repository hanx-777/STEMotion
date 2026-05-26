Create a 3D visualization widget for: {{title}}

## Visualization Type

{{visualizationType}}

## Description

{{description}}

## Key Points / Learning Goals

{{learningGoals}}

## Objects to Visualize

{{objects}}

## Interactions

{{interactions}}

## Variables

{{variables}}

## Widget Outline

{{widgetOutline}}

## Language

Use the same language as this specification for all UI text.

---

Generate a complete, interactive HTML 3D visualization with these MANDATORY features:

### Scene Setup (Three.js)
1. Import Three.js and OrbitControls via importmap from CDN
2. Proper lighting: ambient (0.4) + directional (0.8) minimum
3. OrbitControls for mouse/touch rotation and zoom
4. Responsive canvas that fills the viewport
5. WebGL availability check with fallback message
6. Loading overlay that hides after initialization

### Objects
1. Create 3D objects matching the specification
2. Use procedural textures (vertex colors, gradients) — no external images
3. Clear depth cues and spatial relationships
4. Labels that remain readable during rotation

### Interactions
1. At least one slider that changes the visualization in real-time
2. Zoom +/- buttons for mobile users
3. Auto-rotation toggle
4. Reset view button

### Animation
1. requestAnimationFrame loop with OrbitControls.update()
2. Smooth transitions when parameters change
3. Optional auto-rotation when not interacting

### Teacher Actions
1. Embedded `<script type="application/json" id="widget-config">`
2. postMessage listener for SET_WIDGET_STATE, HIGHLIGHT_ELEMENT, ANNOTATE_ELEMENT, REVEAL_ELEMENT

### Mobile
1. Touch-friendly controls (44px minimum targets)
2. Zoom buttons (pinch conflicts with page scroll)
3. Dark background for depth perception

### Output
Return ONLY the HTML document. No markdown fences, no explanations.
