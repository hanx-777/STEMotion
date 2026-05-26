# Interactive Diagram / Mind Map Generator

Generate a self-contained HTML diagram with connected nodes, expand/collapse, and teacher action support.

Supported diagram types: `flowchart | mindmap | hierarchy | system`

## Output Structure

Complete HTML5 document with:
1. Standard HTML5 structure (DOCTYPE, html, head with separate meta tags, body)
2. `<script type="application/json" id="widget-config">` with concept, variables, defaultState, messageTargets
3. SVG-based node graph with edges
4. Click-to-expand/collapse nodes
5. Step-by-step reveal support (revealOrder)
6. Mobile-responsive layout
7. postMessage listener for teacher actions

## Data Schema

```json
{
  "nodes": [
    { "id": "n1", "label": "Label", "icon": "🎯", "details": "Description text", "children": ["n2", "n3"] }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "label": "next" }
  ],
  "revealOrder": ["n1", "n2", "n3"]
}
```

## Core Requirements

1. **SVG-based** with embedded JSON config
2. **First node visible** on load, others revealed progressively
3. **High contrast**: White/light nodes on dark background, or dark nodes on light background
4. **Edges connect to node edges** (account for node dimensions and arrow offset)
5. **Mobile**: Sidebar/panel collapsible, doesn't block diagram
6. **No jitter**: Avoid hover transform conflicts on click
7. **All nodes connected**: No orphan nodes
8. **Expand/collapse**: Click a node to expand its children or collapse them

## Edge Connection Code

```javascript
const NODE_WIDTH = 180, NODE_HEIGHT = 70, ARROW_OFFSET = 10;

function getEdgePoints(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  let sx, sy, ex, ey;

  if (Math.abs(dy) > Math.abs(dx)) {
    sx = from.x;
    sy = dy > 0 ? from.y + NODE_HEIGHT/2 : from.y - NODE_HEIGHT/2;
    ex = to.x;
    ey = dy > 0 ? to.y - NODE_HEIGHT/2 - ARROW_OFFSET : to.y + NODE_HEIGHT/2 + ARROW_OFFSET;
  } else {
    sx = dx > 0 ? from.x + NODE_WIDTH/2 : from.x - NODE_WIDTH/2;
    sy = from.y;
    ex = dx > 0 ? to.x - NODE_WIDTH/2 - ARROW_OFFSET : to.x + NODE_WIDTH/2 + ARROW_OFFSET;
    ey = to.y;
  }

  return { sx, sy, ex, ey };
}
```

## Layout Approach

```html
<body style="margin:0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;min-height:100vh;">
  <header style="padding:12px 16px;background:#1e293b;color:white;">
    <h1 style="margin:0;font-size:18px;">图表标题</h1>
  </header>
  <div id="controls" style="padding:8px 16px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;flex-wrap:wrap;">
    <button id="expand-all-btn" onclick="expandAll()" style="min-height:44px;padding:8px 16px;">展开全部</button>
    <button id="collapse-all-btn" onclick="collapseAll()" style="min-height:44px;padding:8px 16px;">收起全部</button>
    <button id="reset-btn" onclick="resetView()" style="min-height:44px;padding:8px 16px;">重置视图</button>
  </div>
  <div id="visualization" style="flex:1;min-height:400px;position:relative;overflow:hidden;">
    <svg id="diagram-svg" style="width:100%;height:100%;"></svg>
  </div>
  <div id="metrics" style="padding:8px 16px;background:#fff;border-top:1px solid #e2e8f0;">
    <span id="node-detail">点击节点查看详情</span>
  </div>
</body>
```

## Node Rendering

For mindmap type:
- Central concept node (larger, prominent color)
- Branching sub-topics with curved edges
- Visual hierarchy through size and color
- Edges should be curved or angled lines, not just straight

For flowchart/hierarchy type:
- Top-to-bottom or left-to-right layout
- Rectangular nodes with rounded corners
- Directional arrows on edges
- Clear flow direction

## Interaction

- Click node → toggle expand/collapse its children
- Click node → show detail in `#metrics` panel
- Drag to pan the view (optional, nice-to-have)
- Pinch/scroll to zoom (optional)
- Use `requestAnimationFrame` for smooth layout transitions
- Teacher actions can highlight and annotate specific nodes via `[data-node="nodeId"]`

## postMessage Listener (REQUIRED)

```javascript
window.addEventListener('message', function(event) {
  const data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case 'SET_WIDGET_STATE':
      if (data.state && data.state.expandedNodes) {
        setExpandedNodes(data.state.expandedNodes);
        renderDiagram();
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
        tip.style.cssText = 'position:fixed;top:' + (rect.top - 40) + 'px;left:' + rect.left + 'px;background:rgba(139,92,246,0.95);color:white;padding:8px 12px;border-radius:8px;font-size:14px;z-index:1000;';
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

## Widget Config

```json
{
  "type": "diagram",
  "diagramType": "mindmap",
  "concept": "diagram_topic",
  "variables": [],
  "defaultState": { "expandedNodes": ["root"], "running": false },
  "messageTargets": [
    { "id": "#visualization", "purpose": "图表画布" },
    { "id": "#controls", "purpose": "控制按钮区" },
    { "id": "#metrics", "purpose": "节点详情区" },
    { "id": "#reset-btn", "purpose": "重置按钮" }
  ]
}
```

## Quality Checklist

- [ ] Complete HTML5 structure with separate meta tags
- [ ] Nodes render with clear hierarchy and labels
- [ ] Click to expand/collapse works
- [ ] Edge connections calculated correctly (not overlapping nodes)
- [ ] Teacher highlight/annotate targets nodes correctly via `[data-node="id"]`
- [ ] First node visible on load
- [ ] All nodes connected — no orphans
- [ ] Mobile layout doesn't overlap
- [ ] Touch targets >= 44px
- [ ] widget-config JSON present
- [ ] postMessage listener handles all 4 types
- [ ] Exactly ONE `<!DOCTYPE html>`
- [ ] High contrast — nodes readable

## Output Format

Return ONLY the complete HTML document. No markdown fences, no explanations.
