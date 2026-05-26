Create a simulation widget for: {{title}}

## Concept Overview

{{concept}}

{{description}}

## Key Points / Learning Goals

{{learningGoals}}

## Variables to Expose

{{variables}}

## Design Outline

{{outline}}

## Widget Outline

{{widgetOutline}}

## Language

Use the same language as this specification for all UI text.

---

Generate a complete, interactive HTML simulation with these MANDATORY features:

### Structure
1. **Embedded JSON config** in `<script type="application/json" id="widget-config">`
2. **Control panel** with sliders for each variable
3. **Canvas visualization** with proper sizing
4. **Preset buttons** for common scenarios

### Mobile Responsiveness (CRITICAL)
1. **Control panel MUST NOT overlap canvas on mobile**
2. Use stacked flex-column layout with proper spacing
3. Control panel: scrollable with overflow if large
4. Canvas container: `min-height:300px` to ensure visibility
5. Touch-friendly controls (44px minimum touch targets)

### Button Logic (CRITICAL)
1. **Main button MUST handle all states correctly:**
   - "启动" → Starts simulation
   - "暂停" → Pauses running simulation
   - "继续" → Resume paused simulation
   - "重新开始" → Resets to initial state, then starts fresh
2. **Reset function MUST reset ALL state variables** (position, velocity, time, etc.)
3. Use clear state tracking: `{ running, paused, ended }`

### Canvas
1. Auto-resize on window resize
2. Clear visualization with grid or guides
3. Real-time data display overlay
4. Proper scaling for different screen sizes

### Interactivity
1. Real-time updates when sliders change
2. Presets apply and reset simulation
3. Keyboard shortcuts (Space = toggle, R = reset)
4. Touch gestures for mobile

### Visual Polish
1. Show current simulation state (running/paused/ended)
2. Animate transitions
3. Clear feedback when simulation ends
4. High contrast colors for visibility

Return ONLY the HTML document. No markdown fences, no explanations.
