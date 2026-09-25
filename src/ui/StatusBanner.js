/**
 * Status and Diagnostics Banner
 * Displays performance metrics observable for the classroom.
 */

export class StatusBanner {
  constructor() {
    this.metrics = {
      provider: 'Procedural',
      model: 'procedural-master',
      medium: 'Watercolor',
      generationTimeMs: 0,
      renderTimeMs: 0,
      actionCount: 0,
      totalTimeMs: 0,
      generationIndex: 0
    };
    this.downloadProgress = null;
    this.isDownloading = false;
  }

  setDownloadProgress(progressData) {
    this.isDownloading = Boolean(progressData && progressData.progress < 100);
    this.downloadProgress = progressData;
    // Progress events arrive many times a second: render at most once per frame.
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); });
  }

  clearDownloadProgress() {
    if (!this.downloadProgress && !this.isDownloading) return;
    this.isDownloading = false;
    this.downloadProgress = null;
    this.render();
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

    const dp = this.downloadProgress;
    const progressPct = dp ? Math.min(Math.max(dp.progress || 0, 0), 100) : 0;

    target.innerHTML = `
      <div class="status-bar ${dp ? 'status-bar-downloading' : ''}">
        ${dp ? `
          <div class="model-progress-strip">
            <div class="model-progress-strip-bar" style="width: ${progressPct}%;"></div>
          </div>
          <div class="status-download-info">
            <span class="pulse-dot"></span>
            <span class="status-download-text">${dp.message || 'Loading model weights...'}</span>
            <span class="status-download-badge">${progressPct}%</span>
          </div>
        ` : `
          <div class="status-group">
            <span class="metric">PROVIDER: <strong>${this.metrics.provider || 'Procedural'}</strong></span>
            <span style="margin: 0 8px; color: var(--border-color);">|</span>
            <span class="metric">MODEL: <strong style="color: var(--accent-success); font-family: monospace;">${this.metrics.model || 'procedural'}</strong></span>
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
        `}
      </div>
    `;
  }
}
