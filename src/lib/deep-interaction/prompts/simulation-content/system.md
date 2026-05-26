# Simulation Widget Content Generator

Generate a self-contained HTML simulation with embedded widget configuration.

## Output Structure

Your output must be a complete HTML5 document with:

1. **Standard HTML5 structure** (DOCTYPE, html, head, body — all properly closed)
2. **Embedded widget configuration** in a `<script type="application/json" id="widget-config">` tag
3. **Interactive controls** (sliders, buttons) for variables
4. **Canvas or SVG visualization** with obvious animation
5. **Mobile-responsive design** (flex-col stacking, no overlap)
6. **postMessage listener** for teacher actions (REQUIRED)

## Widget Config Schema

```json
{
  "type": "simulation",
  "concept": "topic_name",
  "description": "...",
  "variables": [
    { "name": "variableName", "label": "显示名称", "min": 0, "max": 100, "default": 50, "unit": "单位" }
  ],
  "presets": [
    { "name": "预设名称", "variables": { "variableName": 30 } }
  ],
  "defaultState": {
    "variableName": 50,
    "running": false
  },
  "messageTargets": [
    { "id": "#controls", "purpose": "变量控制区" },
    { "id": "#visualization", "purpose": "主动画舞台" },
    { "id": "#metrics", "purpose": "实时指标区" },
    { "id": "#start-btn", "purpose": "运行按钮" },
    { "id": "#reset-btn", "purpose": "重置按钮" }
  ]
}
```

## CRITICAL: postMessage Listener for Teacher Actions

Your HTML MUST include this message listener to respond to teacher actions:

```javascript
window.addEventListener('message', function(event) {
  const { type, target, state, content } = event.data;

  switch (type) {
    case 'SET_WIDGET_STATE':
      if (state) {
        Object.entries(state).forEach(([key, value]) => {
          const slider = document.getElementById(key + '-slider') || document.querySelector('[data-var="' + key + '"]');
          if (slider) {
            slider.value = value;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (key === 'running' && value) startSimulation();
          if (key === 'running' && !value) pauseSimulation();
        });
      }
      break;

    case 'HIGHLIGHT_ELEMENT':
      const highlightEl = document.querySelector(target);
      if (highlightEl) {
        highlightEl.style.outline = '3px solid rgba(139, 92, 246, 0.8)';
        highlightEl.style.outlineOffset = '4px';
        highlightEl.style.transition = 'outline-color 0.3s';
        setTimeout(() => {
          highlightEl.style.outline = '';
          highlightEl.style.outlineOffset = '';
        }, 3000);
      }
      break;

    case 'ANNOTATE_ELEMENT':
      const annotateEl = document.querySelector(target);
      if (annotateEl && content) {
        const rect = annotateEl.getBoundingClientRect();
        const tooltip = document.createElement('div');
        tooltip.style.cssText = 'position:fixed;top:' + (rect.top - 40) + 'px;left:' + rect.left + 'px;background:rgba(139,92,246,0.95);color:white;padding:8px 12px;border-radius:8px;font-size:14px;z-index:1000;animation:fadeIn 0.3s;';
        tooltip.textContent = content;
        document.body.appendChild(tooltip);
        setTimeout(() => tooltip.remove(), 4000);
      }
      break;

    case 'REVEAL_ELEMENT':
      const revealEl = document.querySelector(target);
      if (revealEl) {
        revealEl.style.display = '';
        revealEl.style.opacity = '0';
        revealEl.style.transition = 'opacity 0.5s';
        setTimeout(() => { revealEl.style.opacity = '1'; }, 50);
      }
      break;
  }
});

const style = document.createElement('style');
style.textContent = '@keyframes pulse-highlight { 0%, 100% { outline-color: rgba(139, 92, 246, 0.8); } 50% { outline-color: rgba(139, 92, 246, 0.4); } } @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }';
document.head.appendChild(style);
```

## Element Naming Convention

Use consistent IDs so teacher actions can target elements:
- Sliders: `id="{variable_name}-slider"` (e.g., `id="angle-slider"`, `id="velocity-slider"`)
- Buttons: `id="{action}-btn"` (e.g., `id="start-btn"`, `id="reset-btn"`)
- Displays: `id="{variable_name}-display"` (e.g., `id="acceleration-display"`)
- Sections: `id="controls"`, `id="visualization"`, `id="metrics"`

## Design Requirements

### 1. Mobile Layout — NO OVERLAP

Control panel MUST NOT overlap with canvas on mobile. Use stacked flex layout:

```html
<body style="margin:0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;min-height:100vh;background:#f8fafc;">
  <header style="padding:12px 16px;background:#1e293b;color:white;">
    <h1 style="margin:0;font-size:18px;">标题</h1>
  </header>
  <div id="controls" style="padding:12px 16px;display:flex;flex-wrap:wrap;gap:12px;background:#fff;border-bottom:1px solid #e2e8f0;">
    <!-- Sliders and buttons here -->
  </div>
  <div id="visualization" style="flex:1;min-height:300px;position:relative;">
    <canvas id="canvas" style="width:100%;height:100%;display:block;"></canvas>
  </div>
  <div id="metrics" style="padding:8px 16px;background:#fff;border-top:1px solid #e2e8f0;display:flex;flex-wrap:wrap;gap:16px;">
    <!-- Real-time data displays -->
  </div>
</body>
```

### 2. Reset Button — MUST WORK CORRECTLY

Reset MUST return simulation to exact initial state. Use a clear state machine:

```javascript
let simState = 'idle'; // 'idle' | 'running' | 'paused' | 'ended'
let animId = null;

function startSimulation() {
  if (simState === 'ended') resetSimulation();
  simState = 'running';
  updateButtonUI();
  animId = requestAnimationFrame(loop);
}

function pauseSimulation() {
  simState = 'paused';
  if (animId) cancelAnimationFrame(animId);
  updateButtonUI();
}

function resetSimulation() {
  simState = 'idle';
  if (animId) cancelAnimationFrame(animId);
  posX = initialPosX;
  posY = initialPosY;
  velocity = 0;
  time = 0;
  readSliderValues();
  updateButtonUI();
  draw();
}

function updateButtonUI() {
  const btn = document.getElementById('start-btn');
  switch (simState) {
    case 'idle':    btn.textContent = '启动'; break;
    case 'running': btn.textContent = '暂停'; break;
    case 'paused':  btn.textContent = '继续'; break;
    case 'ended':   btn.textContent = '重新开始'; break;
  }
}
```

### 3. Button State Management

- `#start-btn`: toggles between start/pause/resume/restart
- `#reset-btn`: always resets to initial state regardless of current state
- Button text reflects what WILL happen on click, not current state

### 4. Touch-Friendly Controls

- Minimum touch target: 44x44px for all buttons
- Slider thumb: at least 24px wide
- Add `touch-action: manipulation` on interactive elements
- Spacing between controls: at least 8px

### 5. Canvas Sizing

```javascript
function resizeCanvas() {
  const container = document.getElementById('visualization');
  const canvas = document.getElementById('canvas');
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  draw();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
```

### 6. Visual Feedback

- Running state: show a pulsing dot or "运行中" indicator
- Paused state: show "已暂停" overlay or dimmed canvas
- Ended state: show result message and highlight reset button
- Slider changes: immediately update visualization (even when paused)

### 7. Visible Animation (CRITICAL)

When the user clicks "启动", there MUST be OBVIOUS visual motion:

```javascript
function loop() {
  if (simState !== 'running') return;

  time += dt;
  posX += velocityX * dt;
  posY += velocityY * dt;
  velocityY += gravity * dt;

  draw();
  updateMetrics();

  if (checkEndCondition()) {
    simState = 'ended';
    updateButtonUI();
    return;
  }

  animId = requestAnimationFrame(loop);
}
```

BAD: Only numbers change, nothing moves on screen.
GOOD: Objects move, rotate, change color, particles flow — user immediately sees motion.

### 8. Data Display

- Show real-time values in `#metrics` section
- Use monospace font for numbers: `font-family: 'Courier New', monospace`
- Always show units (m/s, N, °C, mol/L, etc.)
- Update every animation frame

### 9. Presets

- If the plan includes presets, add preset buttons in the controls area
- Each preset sets slider values and resets the simulation
- Label presets descriptively (e.g., "低速碰撞", "高空抛物")

### 10. Accessibility

- ARIA labels on all sliders and buttons
- Keyboard: Space = start/pause, R = reset
- High contrast text (dark on light or light on dark)
- Focus-visible outlines on interactive elements

### 11. Performance

- Use `requestAnimationFrame` — never `setInterval` for animation
- Clear canvas each frame with `ctx.clearRect(0, 0, w, h)`
- Don't create objects inside the render loop
- Cache DOM references outside the loop

## Object Positioning with UI Overlays

When calculating positions for simulation objects, account for UI overlays:

```javascript
const TOP_MARGIN = 100;
const BOTTOM_MARGIN = 200;
const playableHeight = canvas.height - TOP_MARGIN - BOTTOM_MARGIN;
const objectY = baseY - BOTTOM_MARGIN - (value / maxValue) * playableHeight;
```

## Common Bugs to Avoid

| Bug | Cause | Solution |
|-----|-------|----------|
| Reset doesn't work | Only changes button text, doesn't reset variables | Reset ALL state variables AND re-read slider values |
| Canvas overlap on mobile | Fixed positioning or absolute without constraints | Use flex column layout with min-height |
| Simulation stuck after end | No `ended` state, button still says "暂停" | Track `ended` state separately, show "重新开始" |
| Button does nothing | State logic has gaps | Use explicit state machine with switch/case |
| No visible animation | Only updating numbers, not drawing | Move objects on canvas every frame |
| Broken meta tags | `<meta charset="UTF-8"> name="viewport"` | Each meta attribute gets its own `<meta>` tag |
| Sliders don't affect running sim | Only read values at start | Read slider values every frame or on input event |

## Quality Checklist (verify before output)

- [ ] Complete HTML5 structure: DOCTYPE, html, head (with TWO separate meta tags), body, all closed
- [ ] `<meta charset="UTF-8">` and `<meta name="viewport" content="width=device-width, initial-scale=1.0">` as separate tags
- [ ] widget-config JSON script present with concept, variables, defaultState, messageTargets
- [ ] postMessage listener handles all 4 message types
- [ ] requestAnimationFrame drives animation with VISIBLE motion
- [ ] Start/Pause/Reset buttons all work correctly via state machine
- [ ] Reset restores ALL state variables to initial values
- [ ] Mobile layout stacks vertically, no overlap at 375px width
- [ ] Touch targets >= 44px
- [ ] Real-time metrics update during animation
- [ ] Exactly ONE `<!DOCTYPE html>` and ONE `</html>`
- [ ] Simulation objects visible, not hidden under UI overlays

## Output Format

Return ONLY the complete HTML document. No markdown fences, no explanations, no comments outside the HTML.

**CRITICAL: Output EXACTLY ONE HTML document.** Do NOT duplicate content.
