# 3D Visualization Widget Content Generator

Generate a self-contained HTML 3D visualization using Three.js with lighting, orbit controls, and interactive exploration.

## Output Structure

Complete HTML5 document with:
1. Standard HTML5 structure (DOCTYPE, html, head with separate meta tags, body)
2. `<script type="application/json" id="widget-config">` with concept, variables, defaultState, messageTargets
3. Three.js scene with proper lighting, camera, and renderer
4. OrbitControls for rotation/zoom
5. Mobile-responsive layout
6. postMessage listener for teacher actions

## Critical Requirements

1. **Lighting Visibility**: Objects MUST be visible. Use ambient light + directional light. Never rely on a single dim light.
2. **Zoom Controls for Mobile**: Include +/- buttons since pinch-to-zoom conflicts with page scroll on mobile.
3. **Realistic Procedural Textures**: Use gradients, noise patterns, or vertex colors for visual richness — no external image textures.

## Three.js Setup Template

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>3D 可视化标题</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; overflow: hidden; }
    #loading { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: #0f172a; z-index: 100; }
    #loading.hidden { display: none; }
    .spinner { width: 40px; height: 40px; border: 4px solid #334155; border-top-color: #8b5cf6; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    #container { width: 100vw; height: 100vh; position: relative; }
    canvas { display: block; }
    #controls { position: absolute; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 8px; z-index: 10; }
    #controls button, #controls label { background: rgba(30,41,59,0.9); border: 1px solid #475569; color: #e2e8f0; padding: 8px 12px; border-radius: 6px; font-size: 13px; cursor: pointer; min-height: 44px; min-width: 44px; }
    #controls input[type="range"] { width: 120px; accent-color: #8b5cf6; }
    #metrics { position: absolute; bottom: 12px; left: 12px; right: 12px; display: flex; flex-wrap: wrap; gap: 12px; z-index: 10; }
    .metric-card { background: rgba(30,41,59,0.9); border: 1px solid #475569; border-radius: 6px; padding: 8px 12px; font-size: 12px; }
    .metric-card strong { display: block; font-size: 16px; color: #a78bfa; }
  </style>
</head>
<body>
  <script type="application/json" id="widget-config">
  {
    "concept": "3d_topic",
    "visualizationType": "molecular",
    "variables": [...],
    "defaultState": { "running": true, "rotationSpeed": 3 },
    "messageTargets": [
      { "id": "#container", "purpose": "3D 画布" },
      { "id": "#controls", "purpose": "控制区" },
      { "id": "#metrics", "purpose": "信息区" }
    ]
  }
  </script>

  <div id="loading"><div class="spinner"></div></div>
  <div id="container">
    <div id="controls">
      <!-- Parameter sliders and buttons -->
    </div>
    <div id="metrics">
      <!-- Info cards -->
    </div>
  </div>

  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
    }
  }
  </script>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

    // WebGL check
    if (!window.WebGLRenderingContext) {
      document.getElementById('loading').innerHTML = '<p style="color:#f87171;">WebGL 不可用</p>';
      throw new Error('WebGL not supported');
    }

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(5, 3, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('container').appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Responsive resize
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Hide loading
    document.getElementById('loading').classList.add('hidden');

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      // Update objects here
      renderer.render(scene, camera);
    }
    animate();
  </script>
</body>
</html>
```

## Visualization Types

### Solar System / Orbital
- Central body (sun/planet) with orbiting objects
- Elliptical orbit paths visible as lines
- Scale indicators
- Speed control slider

### Molecular / Chemical
- Atoms as spheres with element-specific colors
- Bonds as cylinders connecting atoms
- Ball-and-stick or space-filling model
- Rotation to view from all angles

### Anatomy / Biology
- Organ/cell structures as grouped meshes
- Transparent outer layers to see inside
- Labels that face the camera (billboarding)
- Click to isolate/highlight parts

### Geometry / Math
- Geometric solids with wireframe option
- Cross-section planes
- Measurement annotations
- Parameter sliders to morph shapes

### Physics
- Force vectors as arrows (ArrowHelper)
- Particle systems for fields
- Animated trajectories
- Real-time value displays

### Custom
- Any 3D scene that helps visualize the concept
- Combine techniques from above as needed

## Design Requirements

### Visibility & Contrast
- Dark background (#0f172a) for depth perception
- Bright, saturated object colors
- Ambient light (0.4) + directional light (0.8) minimum
- Add hemisphere light for softer fill if needed

### Mobile Responsiveness
- Canvas fills viewport
- Controls overlay with touch-friendly buttons (44px min)
- Zoom +/- buttons for mobile (pinch conflicts with scroll)
- OrbitControls works with touch by default

### Performance
- Limit polygon count (use BufferGeometry)
- Set `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
- Dispose geometries/materials when recreating objects
- Use `requestAnimationFrame` — never `setInterval`

### Procedural Textures
- Use vertex colors, gradients, or ShaderMaterial for visual richness
- NO external image URLs for textures
- Example: planet surface via noise-based vertex displacement

## JavaScript Coding Rules

### Switch Statement Scope Fix
```javascript
// WRONG: let/const in case without block
switch (type) {
  case 'a':
    let x = 1; // SyntaxError in strict mode
    break;
}

// CORRECT: wrap case body in block
switch (type) {
  case 'a': {
    let x = 1;
    break;
  }
}
```

## postMessage Listener (REQUIRED)

```javascript
window.addEventListener('message', function(event) {
  const data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case 'SET_WIDGET_STATE': {
      if (data.state) {
        Object.entries(data.state).forEach(([key, value]) => {
          const el = document.getElementById(key + '-slider') || document.querySelector('[data-var="' + key + '"]');
          if (el) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
          if (key === 'running') { autoRotate = !!value; }
        });
      }
      break;
    }
    case 'HIGHLIGHT_ELEMENT': {
      const hEl = document.querySelector(data.target);
      if (hEl) {
        hEl.style.outline = '3px solid rgba(139, 92, 246, 0.8)';
        hEl.style.outlineOffset = '4px';
        setTimeout(() => { hEl.style.outline = ''; hEl.style.outlineOffset = ''; }, 3000);
      }
      break;
    }
    case 'ANNOTATE_ELEMENT': {
      const aEl = document.querySelector(data.target);
      if (aEl && data.content) {
        const rect = aEl.getBoundingClientRect();
        const tip = document.createElement('div');
        tip.style.cssText = 'position:fixed;top:' + (rect.top - 40) + 'px;left:' + rect.left + 'px;background:rgba(139,92,246,0.95);color:white;padding:8px 12px;border-radius:8px;font-size:14px;z-index:1000;';
        tip.textContent = data.content;
        document.body.appendChild(tip);
        setTimeout(() => tip.remove(), 4000);
      }
      break;
    }
    case 'REVEAL_ELEMENT': {
      const rEl = document.querySelector(data.target);
      if (rEl) {
        rEl.style.display = '';
        rEl.style.opacity = '0';
        rEl.style.transition = 'opacity 0.5s';
        setTimeout(() => { rEl.style.opacity = '1'; }, 50);
      }
      break;
    }
  }
});
```

## Widget Config Schema

```json
{
  "type": "3d_visualization",
  "visualizationType": "solar|molecular|anatomy|geometry|physics|custom",
  "concept": "3d_topic",
  "variables": [
    { "name": "rotationSpeed", "label": "旋转速度", "min": 0, "max": 10, "default": 3 }
  ],
  "defaultState": { "rotationSpeed": 3, "running": true },
  "messageTargets": [
    { "id": "#container", "purpose": "3D 画布" },
    { "id": "#controls", "purpose": "控制区" },
    { "id": "#metrics", "purpose": "信息区" }
  ]
}
```

## Quality Checklist

- [ ] Complete HTML5 structure with separate meta tags
- [ ] Three.js loaded via importmap from CDN
- [ ] WebGL availability check with fallback message
- [ ] Loading overlay that hides after scene init
- [ ] Ambient + directional lighting (objects clearly visible)
- [ ] OrbitControls for mouse/touch rotation and zoom
- [ ] At least one slider that changes the visualization
- [ ] Labels/annotations readable during rotation
- [ ] Mobile zoom +/- buttons present
- [ ] Touch targets >= 44px
- [ ] widget-config JSON present
- [ ] postMessage listener handles all 4 types
- [ ] Exactly ONE `<!DOCTYPE html>`
- [ ] requestAnimationFrame for animation loop

## Output Format

Return ONLY the complete HTML document. No markdown fences, no explanations.

**CRITICAL: Output EXACTLY ONE HTML document.** Do NOT duplicate content.
