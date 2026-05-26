# Educational Game Widget Generator

Generate a self-contained HTML game that is FUN, ENGAGING, and EDUCATIONAL.

## Core Principle: GAMES, NOT QUIZZES

**CRITICAL: Avoid boring multiple-choice quizzes!** Students already have enough tests. Create games that are:
- **Interactive**: Players DO something, not just click answers
- **Skill-based**: Success depends on player action, not just knowing the answer
- **Engaging**: Fun mechanics that make students want to play more
- **Meaningful simulation**: If there's a visual simulation, it MUST be part of the gameplay

## Game Types (PREFER THESE OVER QUIZ)

### 1. Physics/Action Games (HIGHLY RECOMMENDED)
- **Timing games**: Click at the right moment to hit a target
- **Aim and launch**: Adjust angle/power to hit targets
- **Balance games**: Keep an object balanced or in motion
- **Catch/avoid games**: Move to catch falling objects or avoid obstacles
- **Example**: Instead of asking "What force is needed?", let players ADJUST thrust and SEE if they land safely

### 2. Drag-and-Drop Puzzles
- Sort items into correct categories
- Arrange steps in correct order
- Match pairs by dragging
- Build structures by placing pieces

### 3. Interactive Simulations as Games
- Let players ADJUST parameters and see results
- Challenge: "Land the spacecraft safely" — player controls thrust
- Challenge: "Reach the target" — player adjusts angle and power
- Challenge: "Balance the forces" — player adds/removes weights

### 4. Card/Matching Games
- Memory match with concept pairs
- Flashcard flip to reveal answers
- Sorting cards into categories

### 5. Strategy/Decision Games
- Turn-based decisions with consequences
- Resource management challenges
- Multi-step problem solving

## When Quiz is Unavoidable

If you MUST include quiz elements:
- Make it INTERACTIVE (drag answer to target, not click radio button)
- Add PHYSICS/ACTION component (answer unlocks next gameplay)
- Use VISUAL questions (identify the diagram, not text questions)
- Keep questions SHORT and FEW (max 3-5)
- Include EXPLANATION as gameplay reward, not punishment

## Simulation-Game Integration (CRITICAL)

If your game has a visual simulation, it MUST be:
1. **Interactive**: Player controls something in the simulation
2. **Meaningful**: Player's actions affect the outcome
3. **Aligned with learning**: The physics/concept being taught is what the player manipulates

### BAD Example:
```
Question: "What thrust is needed for 1000kg at 9.8m/s²?"
Options: [4900N, 9800N, 19600N, 0N]
Player clicks answer → Animation plays (success or failure)
```
Problem: Simulation is just decoration. Player doesn't interact with it.

### GOOD Example:
```
Game: "Land the spacecraft safely"
Player controls: Thrust slider (0-15000N)
Real-time physics: Spacecraft falls at rate determined by (thrust - mass*g)
Challenge: Adjust thrust to land at velocity < 5m/s
Feedback: Visual speedometer shows current velocity
Learning: Player EXPERIENCES F=ma by adjusting thrust and seeing result
```

## Widget Config Schema

```json
{
  "type": "game",
  "gameType": "action|puzzle|simulation|matching|strategy",
  "concept": "game_topic",
  "description": "...",
  "gameConfig": {
    "controls": ["thrust_slider", "angle_adjuster"],
    "targets": [
      { "id": "t1", "type": "landing_zone", "x": 300, "width": 100, "maxVelocity": 5 }
    ],
    "initialConditions": {
      "mass": 1000,
      "gravity": 9.8,
      "altitude": 500,
      "initialVelocity": 0
    },
    "successCondition": "landingVelocity < 5",
    "levels": []
  },
  "scoring": {
    "completionPoints": 50,
    "accuracyBonus": "lower velocity = more points",
    "timeBonus": true
  },
  "achievements": [
    { "id": "soft_landing", "name": "完美着陆", "description": "着陆速度 < 2m/s", "icon": "🦋" }
  ],
  "variables": [
    { "name": "difficulty", "label": "难度", "min": 1, "max": 10, "default": 4 }
  ],
  "defaultState": { "difficulty": 4, "running": false },
  "messageTargets": [
    { "id": "#controls", "purpose": "游戏控制区" },
    { "id": "#visualization", "purpose": "游戏主画面" },
    { "id": "#metrics", "purpose": "分数和状态" },
    { "id": "#start-btn", "purpose": "开始按钮" },
    { "id": "#reset-btn", "purpose": "重置按钮" }
  ]
}
```

## Fair Start Requirements (CRITICAL)

**NEVER let the player fail immediately when the game starts!**

### Mandatory Rules:
1. **Grace Period**: First 3-5 seconds should be safe — no failure conditions apply
2. **Safe Initial State**: Player must be able to survive at least 10 seconds with default settings
3. **No Instant Collision**: Game objects should start in safe positions, away from danger zones
4. **Reasonable Physics**: Initial velocities must allow stable gameplay, not immediate crash

### For Physics-Based Games:
- Calculate stable orbital/trajectory parameters BEFORE setting initial values
- Verify: `initial_velocity >= sqrt(GM/r)` for orbital games
- Test: Player not touching any danger zone at start
- Ensure: Default control values result in survivable state

### BAD Example (Player fails instantly):
```javascript
// Earth starts at distance 250 from sun
// Initial velocity: 2.4 (way too low for orbit)
// Player clicks "Start" → Earth immediately falls into sun → "Mission Failed"
```

### GOOD Example (Player has time to react):
```javascript
// Earth starts at distance 250 from sun
// Initial velocity: calculated for stable orbit ≈ sqrt(1500*200/250) ≈ 35
// OR: Start with grace period where collision is disabled for 3 seconds
// Player can adjust thrust before any danger
```

## Technical Requirements

### 1. Event Binding: Use Inline onclick for Start Button

```html
<!-- CORRECT: Inline onclick — guaranteed to work -->
<button onclick="startGame()">开始游戏</button>
```

### 2. Global Functions for onclick Handlers

Functions called by inline onclick must be globally accessible:

```javascript
function startGame() {
  document.getElementById('start-screen').classList.add('hidden');
  gameActive = true;
  initLevel();
  requestAnimationFrame(gameLoop);
}

function resetGame() {
  score = 0;
  level = 1;
  gameActive = false;
  document.getElementById('start-screen').classList.remove('hidden');
  updateDisplay();
}
```

### 3. Script Placement

Wrap game logic in DOMContentLoaded OR place script at end of body:

```javascript
document.addEventListener('DOMContentLoaded', function() {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  // Game setup here
});
```

### 4. CSS: Use Custom CSS, Not Tailwind CDN

```html
<style>
  .game-button { background: #3498db; padding: 12px 30px; border: none; color: white; border-radius: 8px; font-size: 16px; cursor: pointer; min-height: 44px; }
  .game-button:hover { background: #2980b9; }
  .hidden { display: none !important; }
</style>
```

### 5. Simple Initialization Flow

```javascript
function startGame() {
  document.getElementById('start-screen').classList.add('hidden');
  gameActive = true;
  startTime = Date.now();
  initLevel();
  requestAnimationFrame(gameLoop);
}
```

## Layout & Positioning (CRITICAL)

### Game Object Positioning — Account for UI Overlays

```javascript
const TOP_MARGIN = 80;
const BOTTOM_MARGIN = 120;
const playableHeight = canvas.height - TOP_MARGIN - BOTTOM_MARGIN;
const objectY = TOP_MARGIN + (normalizedPosition * playableHeight);
```

### Control Panel Sizing
- Controls take max 30% of screen height
- Main game area always visible
- On mobile, consider collapsible controls

## postMessage Listener (REQUIRED)

```javascript
window.addEventListener('message', function(event) {
  const data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case 'SET_WIDGET_STATE':
      if (data.state) {
        Object.entries(data.state).forEach(([key, value]) => {
          if (key === 'running' && value) startGame();
          if (key === 'running' && !value) pauseGame();
          const el = document.getElementById(key + '-slider') || document.querySelector('[data-var="' + key + '"]');
          if (el) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
        });
      }
      break;
    case 'HIGHLIGHT_ELEMENT':
      const hEl = document.querySelector(data.target);
      if (hEl) {
        hEl.style.outline = '3px solid rgba(139, 92, 246, 0.8)';
        hEl.style.outlineOffset = '4px';
        setTimeout(() => { hEl.style.outline = ''; hEl.style.outlineOffset = ''; }, 3000);
      }
      break;
    case 'ANNOTATE_ELEMENT':
      const aEl = document.querySelector(data.target);
      if (aEl && data.content) {
        const rect = aEl.getBoundingClientRect();
        const tip = document.createElement('div');
        tip.style.cssText = 'position:fixed;top:' + (rect.top - 40) + 'px;left:' + rect.left + 'px;background:rgba(139,92,246,0.95);color:white;padding:6px 12px;border-radius:6px;font-size:13px;z-index:1000;';
        tip.textContent = data.content;
        document.body.appendChild(tip);
        setTimeout(() => tip.remove(), 4000);
      }
      break;
    case 'REVEAL_ELEMENT':
      const rEl = document.querySelector(data.target);
      if (rEl) {
        rEl.style.display = '';
        rEl.style.opacity = '0';
        rEl.style.transition = 'opacity 0.5s';
        setTimeout(() => { rEl.style.opacity = '1'; }, 50);
      }
      break;
  }
});
```

## Element Naming Convention

- Game canvas: `id="gameCanvas"` or `id="canvas"`
- Sections: `id="controls"`, `id="visualization"`, `id="metrics"`
- Buttons: `id="start-btn"`, `id="reset-btn"`
- Score: `id="score-display"`
- Level: `id="level-display"`

## Engagement Features

1. **Immediate feedback**: Player knows instantly if action was right/wrong
2. **Visual rewards**: Animations, color bursts for success
3. **Progression**: Levels get progressively harder
4. **Replayability**: Random elements, multiple paths to success
5. **Score tracking**: Show current score, best score (localStorage)
6. **Clear instructions**: Brief overlay before game starts
7. **Achievement system**: Unlockable badges for accomplishments

## Quality Checklist (verify before output)

- [ ] Game is INTERACTIVE, not just a quiz
- [ ] Player CONTROLS something meaningful
- [ ] Simulation (if present) is part of gameplay, not decoration
- [ ] Success depends on player SKILL, not just knowledge
- [ ] **Fair Start: Player cannot fail in first 3-5 seconds**
- [ ] **Initial parameters allow survival with default settings**
- [ ] Visual feedback is immediate and clear
- [ ] Touch-friendly controls (44px minimum)
- [ ] Clear instructions at game start
- [ ] requestAnimationFrame for game loop
- [ ] postMessage listener handles all 4 message types
- [ ] widget-config JSON present
- [ ] Exactly ONE `<!DOCTYPE html>` — NO duplicated HTML
- [ ] Game objects visible, not hidden under UI overlays
- [ ] localStorage for progress/high scores
- [ ] Achievement system provides motivation

## Output Format

Return ONLY the complete HTML document. No markdown fences, no explanations.

**CRITICAL: Output EXACTLY ONE HTML document.** Do NOT duplicate content.
