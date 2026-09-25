/**
 * Docks and panels, after underscores' panel system.
 *
 * - Panels live in the left, right or bottom dock, or float.
 * - Panels sharing a dock form one tab row: the active tab shows icon + label,
 *   the others only their icon. The tab icon is the handle: click activates,
 *   drag (past a small threshold) floats the panel and previews dock targets,
 *   right-click opens placement options.
 * - Each dock has one persistent size. Dragging its canvas-facing edge resizes it;
 *   dragging below the minimum collapses the whole dock to a thin edge; drag or
 *   double-click the edge to restore. Cmd+B / Cmd+Opt+B / Cmd+Shift+B toggle
 *   left / right / bottom.
 * - Floating panels move by their header, resize from the corner, and can be
 *   minimised to their icon (Shift+double-click the icon).
 * - Everything persists in localStorage.
 */
import { icon } from './icons.js';

const KEY = 'ams_workbench_layout_v1';
const MIN = { left: 220, right: 220, bottom: 110 };
const DEFAULT_SIZE = { left: 300, right: 320, bottom: 220 };

export class DockManager {
  constructor(root, { onLayout } = {}) {
    this.root = root;
    this.onLayout = onLayout;
    this.panels = new Map(); // id → { id, title, icon, natural, allowBottom, mount(el), el }
    this.state = this.load();
    this.els = {
      left: root.querySelector('[data-dock="left"]'),
      right: root.querySelector('[data-dock="right"]'),
      bottom: root.querySelector('[data-dock="bottom"]'),
      floating: root.querySelector('[data-floating]')
    };
    window.addEventListener('keydown', e => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'b') return;
      e.preventDefault();
      this.toggleDock(e.shiftKey ? 'bottom' : e.altKey ? 'right' : 'left');
    });
  }

  load() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s?.panels) return s; } catch { /* ignore */ }
    return { panels: {}, active: {}, collapsed: {}, size: { ...DEFAULT_SIZE } };
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* ignore */ }
    this.onLayout?.();
  }

  reset() {
    this.state = { panels: {}, active: {}, collapsed: {}, size: { ...DEFAULT_SIZE } };
    for (const p of this.panels.values()) this.state.panels[p.id] = { placement: p.natural, open: p.openByDefault !== false, x: 80, y: 80, w: 340, h: 480 };
    this.save();
    this.render();
  }

  /** Register a panel. mount(container) renders its content once; it may re-render itself later. */
  register(panel) {
    const body = document.createElement('div');
    body.className = 'wb-panel-body';
    this.panels.set(panel.id, { ...panel, body, mounted: false });
    if (!this.state.panels[panel.id]) this.state.panels[panel.id] = { placement: panel.natural, open: panel.openByDefault !== false, x: 80, y: 80, w: 340, h: 480 };
  }

  placement(id) { return this.state.panels[id]?.placement; }

  /** Show a panel: activate it in its dock (expanding the dock) or bring its float forward. */
  open(id, { toggle = false } = {}) {
    const s = this.state.panels[id];
    if (!s) return;
    if (s.placement === 'floating') {
      s.open = toggle ? !s.open : true;
      s.min = false;
    } else {
      const dock = s.placement;
      const frontmost = s.open && this.state.active[dock] === id && !this.state.collapsed[dock];
      if (toggle && frontmost) this.state.collapsed[dock] = true;
      else { s.open = true; this.state.active[dock] = id; this.state.collapsed[dock] = false; }
    }
    this.save();
    this.render();
  }

  close(id) { const s = this.state.panels[id]; if (s) { s.open = false; this.save(); this.render(); } }

  move(id, placement, pos = null) {
    const s = this.state.panels[id];
    const p = this.panels.get(id);
    if (!s || !p) return;
    if (placement === 'bottom' && !p.allowBottom) placement = 'right';
    s.placement = placement;
    s.open = true;
    if (pos) Object.assign(s, pos);
    if (placement !== 'floating') { this.state.active[placement] = id; this.state.collapsed[placement] = false; }
    this.save();
    this.render();
  }

  toggleDock(dock) {
    this.state.collapsed[dock] = !this.state.collapsed[dock];
    this.save();
    this.render();
  }

  tabsFor(dock) {
    return [...this.panels.values()].filter(p => this.state.panels[p.id].placement === dock && this.state.panels[p.id].open);
  }

  mountBody(p) {
    if (!p.mounted) { p.mount(p.body); p.mounted = true; }
    return p.body;
  }

  render() {
    for (const dock of ['left', 'right', 'bottom']) this.renderDock(dock);
    this.renderFloating();
    this.onLayout?.();
  }

  renderDock(dock) {
    const el = this.els[dock];
    const tabs = this.tabsFor(dock);
    const collapsed = this.state.collapsed[dock] || !tabs.length;
    el.classList.toggle('collapsed', collapsed);
    el.style.setProperty('--dock-size', `${this.state.size[dock] || DEFAULT_SIZE[dock]}px`);
    el.innerHTML = '';
    const edge = document.createElement('div');
    edge.className = `wb-dock-edge wb-dock-edge-${dock}`;
    edge.title = collapsed ? 'Drag or double-click to open the panels' : 'Drag to resize; drag past the edge to collapse; double-click to collapse';
    this.bindEdge(edge, dock);
    el.appendChild(edge);
    if (collapsed) return;
    let active = this.state.active[dock];
    if (!tabs.some(t => t.id === active)) active = this.state.active[dock] = tabs[0].id;
    const bar = document.createElement('div');
    bar.className = 'wb-tabs';
    for (const t of tabs) {
      const b = document.createElement('button');
      b.className = `wb-tab${t.id === active ? ' active' : ''}`;
      b.dataset.guide = `tab:${t.id}`;
      b.innerHTML = `${icon(t.icon)}${t.id === active ? `<span>${t.title}</span>` : ''}`;
      b.title = t.title;
      this.bindHandle(b, t.id, () => { this.state.active[dock] = t.id; this.save(); this.render(); });
      bar.appendChild(b);
    }
    const holder = document.createElement('div');
    holder.className = 'wb-dock-content';
    holder.appendChild(this.mountBody(this.panels.get(active)));
    el.appendChild(bar);
    el.appendChild(holder);
  }

  renderFloating() {
    const host = this.els.floating;
    host.innerHTML = '';
    for (const p of this.panels.values()) {
      const s = this.state.panels[p.id];
      if (s.placement !== 'floating' || !s.open) continue;
      const win = document.createElement('div');
      win.className = `wb-float${s.min ? ' min' : ''}`;
      win.dataset.panel = p.id;
      Object.assign(win.style, { left: `${s.x}px`, top: `${s.y}px`, width: s.min ? '' : `${s.w}px`, height: s.min ? '' : `${s.h}px` });
      const head = document.createElement('div');
      head.className = 'wb-float-head';
      const handle = document.createElement('button');
      handle.className = 'wb-tab active';
      handle.dataset.guide = `tab:${p.id}`;
      handle.innerHTML = `${icon(p.icon)}${s.min ? '' : `<span>${p.title}</span>`}`;
      handle.title = `${p.title}: drag to a side to dock · Shift+double-click to minimise`;
      this.bindHandle(handle, p.id, null, win);
      handle.addEventListener('dblclick', e => { if (e.shiftKey) { s.min = !s.min; this.save(); this.render(); } });
      head.appendChild(handle);
      if (!s.min) {
        const x = document.createElement('button');
        x.className = 'wb-icon-btn';
        x.innerHTML = icon('close');
        x.title = 'Close';
        x.onclick = () => this.close(p.id);
        head.appendChild(x);
      }
      win.appendChild(head);
      if (!s.min) {
        const content = document.createElement('div');
        content.className = 'wb-dock-content';
        content.appendChild(this.mountBody(p));
        win.appendChild(content);
        const grip = document.createElement('div');
        grip.className = 'wb-float-grip';
        this.bindResize(grip, s, win);
        win.appendChild(grip);
      }
      host.appendChild(win);
    }
  }

  /** Tab / float handle: click activates, drag floats and previews dock targets, right-click menu. */
  bindHandle(el, id, onClick, floatWin = null) {
    el.addEventListener('contextmenu', e => { e.preventDefault(); this.placementMenu(id, e.clientX, e.clientY); });
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const sx = e.clientX, sy = e.clientY;
      const s = this.state.panels[id];
      let dragging = false, ox = 0, oy = 0;
      const hint = this.root.querySelector('.wb-dock-hint');
      const moveH = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!dragging && Math.hypot(dx, dy) < 6) return;
        if (!dragging) {
          dragging = true;
          if (s.placement !== 'floating') {
            s.placement = 'floating'; s.open = true; s.x = ev.clientX - 60; s.y = ev.clientY - 14;
            this.render();
          }
          ox = ev.clientX - s.x; oy = ev.clientY - s.y;
        }
        s.x = ev.clientX - ox; s.y = ev.clientY - oy;
        const win = this.els.floating.querySelector(`[data-panel="${id}"]`);
        if (win) { win.style.left = `${s.x}px`; win.style.top = `${s.y}px`; }
        const target = this.dockTarget(ev.clientX, ev.clientY, this.panels.get(id).allowBottom);
        hint.dataset.target = target;
      };
      const up = ev => {
        window.removeEventListener('pointermove', moveH);
        window.removeEventListener('pointerup', up);
        hint.dataset.target = '';
        if (!dragging) { onClick?.(); return; }
        const target = this.dockTarget(ev.clientX, ev.clientY, this.panels.get(id).allowBottom);
        if (target !== 'floating') this.move(id, target);
        else { this.save(); this.render(); }
      };
      window.addEventListener('pointermove', moveH);
      window.addEventListener('pointerup', up);
    });
  }

  dockTarget(x, y, allowBottom) {
    const W = window.innerWidth, H = window.innerHeight, edge = 64;
    if (allowBottom && y > H - edge) return 'bottom';
    if (x < edge) return 'left';
    if (x > W - edge) return 'right';
    return 'floating';
  }

  placementMenu(id, x, y) {
    const p = this.panels.get(id);
    const items = [['left', 'Dock left'], ['right', 'Dock right'], ...(p.allowBottom ? [['bottom', 'Dock bottom']] : []), ['floating', 'Float'], ['close', 'Close']];
    const m = document.createElement('div');
    m.className = 'wb-menu';
    Object.assign(m.style, { left: `${x}px`, top: `${y}px` });
    for (const [k, label] of items) {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => { m.remove(); if (k === 'close') this.close(id); else this.move(id, k, k === 'floating' ? { x: x - 40, y } : null); };
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const off = ev => { if (!m.contains(ev.target)) { m.remove(); window.removeEventListener('pointerdown', off, true); } };
    setTimeout(() => window.addEventListener('pointerdown', off, true));
  }

  bindEdge(edge, dock) {
    edge.addEventListener('dblclick', () => this.toggleDock(dock));
    edge.addEventListener('pointerdown', e => {
      e.preventDefault();
      const start = dock === 'bottom' ? e.clientY : e.clientX;
      const was = this.state.collapsed[dock] ? 0 : this.state.size[dock] || DEFAULT_SIZE[dock];
      const sign = dock === 'left' ? 1 : -1;
      const el = this.els[dock];
      let moved = false;
      const mv = ev => {
        const now = dock === 'bottom' ? ev.clientY : ev.clientX;
        const size = was + (now - start) * sign;
        if (Math.abs(now - start) > 3) moved = true;
        if (size < MIN[dock] * 0.6) { if (!this.state.collapsed[dock]) { this.state.collapsed[dock] = true; this.renderDock(dock); this.onLayout?.(); } return; }
        this.state.size[dock] = Math.max(MIN[dock], Math.min(900, size));
        if (this.state.collapsed[dock]) { this.state.collapsed[dock] = false; this.renderDock(dock); }
        el.style.setProperty('--dock-size', `${this.state.size[dock]}px`);
        this.onLayout?.();
      };
      const up = () => {
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
        if (moved) this.save();
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    });
  }

  bindResize(grip, s, win) {
    grip.addEventListener('pointerdown', e => {
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, w0 = s.w, h0 = s.h;
      const mv = ev => { s.w = Math.max(220, w0 + ev.clientX - sx); s.h = Math.max(160, h0 + ev.clientY - sy); win.style.width = `${s.w}px`; win.style.height = `${s.h}px`; };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); this.save(); };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    });
  }
}
