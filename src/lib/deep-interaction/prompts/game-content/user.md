Create an educational GAME widget for: {{title}}

## Game Type

{{gameType}}

## Description

{{description}}

## Key Points / Learning Goals

{{learningGoals}}

## Variables

{{variables}}

## Design Outline

{{outline}}

## Widget Outline

{{widgetOutline}}

## Language

Use the same language as this specification for all UI text.

---

Generate a FUN, INTERACTIVE HTML game with these MANDATORY features:

### Game Design (CRITICAL - NOT A QUIZ!)
1. **Interactive gameplay**: Player MUST control something meaningful (NOT just click answers)
2. **Real game mechanics**: Timing, aiming, dragging, balancing, catching, or building
3. **Skill-based success**: Outcome depends on player action, not just correct answer
4. **Engaging feedback**: Animations, visual effects for actions

### Preferred Game Types (in order of preference)
1. **Physics/Action**: Control parameters to achieve goal (land safely, hit target, balance)
2. **Timing/Aim**: Click at right moment or adjust aim to succeed
3. **Drag-and-drop**: Sort, arrange, or build by dragging elements
4. **Simulation game**: Let player experiment with variables to find solution
5. **Card/Match**: Memory or matching games
6. **Quiz**: ONLY as last resort - make it visually interesting

### Simulation Integration (if game has visual simulation)
- Simulation MUST be interactive (player controls something)
- Simulation physics MUST match what player is learning
- Visual feedback MUST show player's progress toward goal

### Game Elements
1. **Clear objective**: "Land safely", "Hit the target", "Sort correctly"
2. **Player controls**: Sliders, buttons, drag areas, or click targets
3. **Real-time feedback**: Score, progress bar, visual indicators
4. **Levels or challenges**: Progressive difficulty
5. **Achievement system**: Unlockable badges for accomplishments
6. **Replay value**: Random elements or multiple solutions

### Technical (MANDATORY)
1. **Inline onclick for start button**: `<button onclick="startGame()">开始</button>`
2. **Custom CSS**: No Tailwind CDN, use plain inline CSS
3. **DOMContentLoaded wrapper**: Wrap game code properly
4. **Global start function**: `function startGame()` must be callable from onclick
5. Embedded `<script type="application/json" id="widget-config">`
6. `requestAnimationFrame` for smooth animations
7. Touch-friendly controls (min 44px touch targets)
8. localStorage for progress/high scores
9. Pause functionality

### Output
Return ONLY the HTML document. Make the game FUN enough that students want to play again!
