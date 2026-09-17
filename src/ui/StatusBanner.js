/**
 * Status and Diagnostics Banner
 * Displays performance metrics observable for the classroom.
 */

export class StatusBanner {
  constructor() {
    this.metrics = {
      model: 'None',
      medium: 'Watercolor',
      generationTimeMs: 0,
      renderTimeMs: 0,
      actionCount: 0,
      totalTimeMs: 0,
      generationIndex: 0
    };
  }

  update(newMetrics) {
    Object.assign(this.metrics, newMetrics);
    this.metrics.totalTimeMs =
      (this.metrics.generationTimeMs || 0) + (this.metrics.renderTimeMs || 0);
    this.render();
  }

  render(container = null) {
    const target = container || document.querySelector('#status-banner-container');
    if (!target) return;

    target.innerHTML = `
      <div class="status-bar">
        <div class="status-group">
          <span class="metric">MODEL: <strong>${this.metrics.model}</strong></span>
          <span style="margin: 0 8px; color: var(--border-color);">|</span>
          <span class="metric">MEDIUM: <strong>${this.metrics.medium}</strong></span>
          <span style="margin: 0 8px; color: var(--border-color);">|</span>
          <span class="metric">GEN: <strong>${this.metrics.generationIndex}</strong></span>
        </div>
        <div class="status-group">
          <span class="metric">GENERATION: <strong>${this.metrics.generationTimeMs} ms</strong></span>
          <span style="margin: 0 8px; color: var(--border-color);">|</span>
          <span class="metric">PROGRAM: <strong>${this.metrics.actionCount} actions</strong></span>
          <span style="margin: 0 8px; color: var(--border-color);">|</span>
          <span class="metric">RENDER: <strong>${this.metrics.renderTimeMs} ms</strong></span>
          <span style="margin: 0 8px; color: var(--border-color);">|</span>
          <span class="metric">TOTAL: <strong>${this.metrics.totalTimeMs} ms</strong></span>
        </div>
      </div>
    `;
  }
}
