/**
 * Live Process Log & Debug Terminal Component
 *
 * Provides real-time visibility into LLM connection state, token streaming throughput,
 * raw output stream inspection, and actionable diagnostics for local Ollama and WebGPU backends.
 */

export class ProcessLog {
  constructor() {
    this.logs = [];
    this.status = 'idle'; // 'idle' | 'streaming' | 'interrupted' | 'error' | 'success'
    this.isOpen = true;
    this.activeTab = 'events'; // 'events' | 'stream'
    this.autoScroll = true;

    this.metrics = {
      model: 'None',
      endpoint: '-',
      candidate: '-',
      tokens: 0,
      tokPerSec: 0,
      elapsedMs: 0
    };

    this.rawStreamText = '';
    this.diagnosticError = null;
  }

  render(container) {
    this.container = container || this.container;
    if (!this.container) return;

    const statusClasses = {
      idle: 'status-idle',
      streaming: 'status-streaming',
      interrupted: 'status-interrupted',
      error: 'status-error',
      success: 'status-success'
    };

    const statusLabels = {
      idle: '● IDLE',
      streaming: '⏳ STREAMING',
      interrupted: '⏹ INTERRUPTED',
      error: '⚠ ERROR',
      success: '✓ READY'
    };

    this.container.innerHTML = `
      <section class="process-log-panel ${this.isOpen ? 'open' : 'collapsed'}">
        <div class="process-log-header">
          <div class="process-log-title" id="log-toggle-btn">
            <span class="log-collapse-icon">${this.isOpen ? '▼' : '▶'}</span>
            <strong>Live Debug & Process Log</strong>
            <span class="process-status-pill ${statusClasses[this.status] || ''}">${statusLabels[this.status] || this.status}</span>
          </div>

          <div class="process-log-controls">
            <div class="log-tab-group">
              <button class="log-tab-btn ${this.activeTab === 'events' ? 'active' : ''}" data-tab="events">Events</button>
              <button class="log-tab-btn ${this.activeTab === 'stream' ? 'active' : ''}" data-tab="stream">Raw Stream</button>
            </div>
            <label class="autoscroll-label">
              <input type="checkbox" id="autoscroll-toggle" ${this.autoScroll ? 'checked' : ''} /> Auto-scroll
            </label>
            <button id="clear-log-btn" class="btn-micro" title="Clear log">Clear</button>
          </div>
        </div>

        ${this.isOpen ? `
          <div class="process-metrics-bar">
            <div class="metric-item">
              <span class="metric-label">Model:</span>
              <span class="metric-val" id="metric-model" title="${this.metrics.model}">${this.metrics.model}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Endpoint:</span>
              <span class="metric-val" id="metric-endpoint">${this.metrics.endpoint}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Candidate:</span>
              <span class="metric-val" id="metric-cand">${this.metrics.candidate}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Tokens:</span>
              <span class="metric-val highlight" id="metric-tokens">${this.metrics.tokens}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Throughput:</span>
              <span class="metric-val highlight" id="metric-tps">${this.metrics.tokPerSec > 0 ? this.metrics.tokPerSec + ' tok/s' : '-'}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">Elapsed:</span>
              <span class="metric-val" id="metric-elapsed">${(this.metrics.elapsedMs / 1000).toFixed(1)}s</span>
            </div>
          </div>

          ${this.diagnosticError ? `
            <div class="diagnostic-banner">
              <strong>Diagnostic Alert:</strong> ${this.diagnosticError}
            </div>
          ` : ''}

          <div class="process-log-body">
            <div id="events-view" class="log-view-pane ${this.activeTab === 'events' ? 'active' : ''}">
              <div class="log-entries" id="log-entries-list">
                ${this.logs.length === 0
                  ? '<div class="log-entry muted">[System] Waiting for artist generation... Click Generate or choose an action.</div>'
                  : this.logs.map(l => `
                    <div class="log-entry ${l.type}">
                      <span class="log-time">${l.time}</span>
                      <span class="log-text">${this.escapeHtml(l.text)}</span>
                    </div>
                  `).join('')}
              </div>
            </div>

            <div id="stream-view" class="log-view-pane ${this.activeTab === 'stream' ? 'active' : ''}">
              <pre class="raw-stream-terminal" id="raw-stream-content">${this.rawStreamText ? this.escapeHtml(this.rawStreamText) : 'Waiting for raw tokens...'}</pre>
            </div>
          </div>
        ` : ''}
      </section>
    `;

    this.attachEvents();
    this.scrollToBottom();
  }

  attachEvents() {
    this.container.querySelector('#log-toggle-btn')?.addEventListener('click', () => {
      this.isOpen = !this.isOpen;
      this.render();
    });

    this.container.querySelectorAll('.log-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activeTab = btn.dataset.tab;
        this.render();
      });
    });

    const scrollCheck = this.container.querySelector('#autoscroll-toggle');
    scrollCheck?.addEventListener('change', (e) => {
      this.autoScroll = e.target.checked;
    });

    this.container.querySelector('#clear-log-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clear();
    });
  }

  log(text, type = 'info') {
    const time = new Date().toLocaleTimeString();
    this.logs.push({ time, text, type });
    if (this.logs.length > 200) this.logs.shift();

    const list = this.container?.querySelector('#log-entries-list');
    if (list && this.activeTab === 'events') {
      const row = document.createElement('div');
      row.className = `log-entry ${type}`;
      row.innerHTML = `<span class="log-time">${time}</span><span class="log-text">${this.escapeHtml(text)}</span>`;
      list.appendChild(row);
      this.scrollToBottom();
    }
  }

  appendToken(chunk, fullText = null) {
    if (fullText !== null) {
      this.rawStreamText = fullText;
    } else {
      this.rawStreamText += chunk;
    }

    const pre = this.container?.querySelector('#raw-stream-content');
    if (pre && this.activeTab === 'stream') {
      pre.textContent = this.rawStreamText;
      this.scrollToBottom();
    }
  }

  updateMetrics(newMetrics = {}) {
    Object.assign(this.metrics, newMetrics);

    const mModel = this.container?.querySelector('#metric-model');
    if (mModel) mModel.textContent = this.metrics.model;

    const mEndpoint = this.container?.querySelector('#metric-endpoint');
    if (mEndpoint) mEndpoint.textContent = this.metrics.endpoint;

    const mCand = this.container?.querySelector('#metric-cand');
    if (mCand) mCand.textContent = this.metrics.candidate;

    const mTokens = this.container?.querySelector('#metric-tokens');
    if (mTokens) mTokens.textContent = this.metrics.tokens;

    const mTps = this.container?.querySelector('#metric-tps');
    if (mTps) mTps.textContent = this.metrics.tokPerSec > 0 ? `${this.metrics.tokPerSec} tok/s` : '-';

    const mElapsed = this.container?.querySelector('#metric-elapsed');
    if (mElapsed) mElapsed.textContent = `${(this.metrics.elapsedMs / 1000).toFixed(1)}s`;
  }

  setStatus(status) {
    this.status = status;
    const pill = this.container?.querySelector('.process-status-pill');
    if (pill) {
      pill.className = `process-status-pill status-${status}`;
      const labels = {
        idle: '● IDLE',
        streaming: '⏳ STREAMING',
        interrupted: '⏹ INTERRUPTED',
        error: '⚠ ERROR',
        success: '✓ READY'
      };
      pill.textContent = labels[status] || status;
    }
  }

  setDiagnostic(message) {
    this.diagnosticError = message;
    this.render();
  }

  clear() {
    this.logs = [];
    this.rawStreamText = '';
    this.diagnosticError = null;
    this.render();
  }

  scrollToBottom() {
    if (!this.autoScroll || !this.isOpen) return;
    const list = this.container?.querySelector('#log-entries-list');
    if (list && this.activeTab === 'events') {
      list.scrollTop = list.scrollHeight;
    }
    const pre = this.container?.querySelector('#raw-stream-content');
    if (pre && this.activeTab === 'stream') {
      pre.scrollTop = pre.scrollHeight;
    }
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
