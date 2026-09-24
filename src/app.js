/**
 * Studio Application Coordinator
 * Glues Artists, Media, Sessions, Rewards, Process Log, and UI components together.
 */

import { defaultArtistRegistry } from './artists/artistRegistry.js';
import { defaultMediaRegistry } from './media/mediaRegistry.js';
import { defaultSessionStore } from './sessions/sessionStore.js';
import { Controls } from './ui/Controls.js';
import { StatusBanner } from './ui/StatusBanner.js';
import { CandidateGrid } from './ui/CandidateGrid.js';
import { ProgramEditor } from './ui/ProgramEditor.js';
import { CompareModal } from './ui/CompareModal.js';
import { RewardPanel } from './ui/RewardPanel.js';
import { DatasetModal } from './ui/DatasetModal.js';
import { SettingsModal } from './ui/SettingsModal.js';
import { ModelExplorerModal } from './ui/ModelExplorerModal.js';
import { HelpModal } from './ui/HelpModal.js';
import { ProcessLog } from './ui/ProcessLog.js';
import { ReferencePanel } from './ui/ReferencePanel.js';
import { EXAMPLES } from '../examples/index.js';
import { initWebMCP } from './mcp/webmcp.js';
import { icon } from './ui/icons.js';

export class StudioApp {
  constructor() {
    this.artistRegistry = defaultArtistRegistry;
    this.mediaRegistry = defaultMediaRegistry;
    this.sessionStore = defaultSessionStore;

    this.activeMediumId = 'watercolor';
    this.activeMode = 'draw'; // 'draw' | 'reward' | 'datasets'
    this.canvasSize = Number(localStorage.getItem('ams_canvas_size') || 1024);
    this.variationLevel = localStorage.getItem('ams_variation_level') || 'medium';

    this.abortController = null;
    this.rightPaneTab = 'editor'; // 'editor' | 'log'
    this.activeCandidates = [];
    this.selectedCandidateId = null;

    // Configure media canvas dimensions
    for (const m of this.mediaRegistry.getAll()) {
      if (typeof m.reset === 'function') {
        m.reset({ width: this.canvasSize, height: this.canvasSize });
      }
    }

    this.statusBanner = new StatusBanner();
    this.processLog = new ProcessLog();

    this.candidateGrid = new CandidateGrid({
      onSelectCandidate: (id) => this.handleSelectCandidate(id),
      onVariations: (id) => this.handleVariations(id),
      onContinue: (id) => this.handleContinue(id),
      onCritique: (id) => this.handleCritique(id),
      onCompareMedia: (id) => this.handleCompareMedia(id),
      onStartOver: () => this.handleStartOver(),
      onRate: (id, rating) => this.handleRate(id, rating),
      onAnimateStrokes: (cand) => this.handleAnimateStrokes(cand)
    });

    this.programEditor = new ProgramEditor({
      onProgramChange: (candId, newProgram) => this.handleProgramEdit(candId, newProgram),
      onRenderWithOtherMedium: (cand) => this.handleSwapMedium(cand)
    });

    this.rewardPanel = new RewardPanel({
      onApplyOptimizedProgram: (newProg) => this.handleApplyOptimizedProgram(newProg)
    });

    this.compareModal = new CompareModal({
      flatMedium: this.mediaRegistry.get('flat'),
      watercolorMedium: this.mediaRegistry.get('watercolor')
    });

    this.datasetModal = new DatasetModal({
      sessionStore: this.sessionStore
    });

    const openrouterArtist = this.artistRegistry.get('openrouter');
    this.modelExplorerModal = new ModelExplorerModal({
      openrouterArtist,
      onSelectModel: (modelId) => {
        if (this.artistRegistry.activeId !== 'openrouter') {
          this.artistRegistry.setActive('openrouter');
          this.controls.activeArtist = 'openrouter';
          const artistSelect = document.querySelector('#artist-select');
          if (artistSelect) artistSelect.value = 'openrouter';
        }
        openrouterArtist.setModel(modelId);
        this.controls.updateModels('openrouter');
        const modelSelect = document.querySelector('#model-select');
        if (modelSelect) modelSelect.value = modelId;
        this.handleModelChange(modelId, 'openrouter');
      },
      onFavoritesChange: () => {
        if (this.artistRegistry.activeId === 'openrouter') {
          this.controls.updateModels('openrouter');
        }
      }
    });

    this.settingsModal = new SettingsModal({
      artistRegistry: this.artistRegistry,
      mediaRegistry: this.mediaRegistry,
      onSaveSettings: () => this.handleSettingsSaved(),
      onOpenModelExplorer: () => this.modelExplorerModal.open()
    });

    this.helpModal = new HelpModal();

    this.referencePanel = new ReferencePanel({
      onReferenceChange: (ref) => {
        this.artistRegistry.get('fitter')?.setReference(ref);
        if (ref && this.processLog) this.processLog.log(`Reference set: ${ref.name}`, 'info');
      }
    });

    this.controls = new Controls({
      artists: this.artistRegistry.list(),
      media: this.mediaRegistry.list(),
      activeArtist: this.artistRegistry.activeId,
      activeMedium: this.activeMediumId,
      activeMode: this.activeMode,
      canvasSize: this.canvasSize,
      variationLevel: this.variationLevel,
      artistRegistry: this.artistRegistry,
      onArtistChange: (id, modelId) => this.handleArtistChange(id, modelId),
      onModelChange: (modelId, artistId) => this.handleModelChange(modelId, artistId),
      onMediumChange: (id) => this.handleMediumChange(id),
      onModeChange: (mode) => this.handleModeChange(mode),
      onCanvasSizeChange: (size) => this.handleCanvasSizeChange(size),
      onVariationChange: (level) => this.handleVariationChange(level),
      onGenerate: (prompt) => this.handleGenerate(prompt),
      onInterrupt: () => this.handleInterrupt(),
      onLoadExample: (example) => this.handleLoadExample(example),
      onOpenSettings: () => this.settingsModal.open(),
      onOpenHelp: (tab) => this.helpModal.open(tab),
      onToggleLog: () => this.handleToggleLog(),
      onOpenModelExplorer: () => this.modelExplorerModal.open()
    });
  }

  async init(rootElement) {
    this.root = rootElement;
    this.root.innerHTML = `
      <div id="controls-container"></div>
      <div id="status-banner-container"></div>
      <main class="studio-main">
        <div id="studio-view" class="studio-hero-layout">
          <div id="candidate-grid-container" class="studio-main-column"></div>
          
          <div id="right-column-container" class="studio-side-column">
            <div class="side-column-tabs">
              <button class="side-tab-btn active" id="tab-btn-editor" data-tab="editor">
                ${icon('codeBracket', 'icon-sm')} <span>Code Editor</span>
              </button>
              <button class="side-tab-btn" id="tab-btn-log" data-tab="log">
                ${icon('terminal', 'icon-sm')} <span>Process Log</span>
              </button>
              <button class="side-tab-btn" id="tab-btn-reference" data-tab="reference">
                ${icon('photo', 'icon-sm')} <span>Reference</span>
              </button>
            </div>
            <div id="side-pane-editor" class="side-pane active">
              <div id="program-editor-container"></div>
            </div>
            <div id="side-pane-log" class="side-pane">
              <div id="process-log-container"></div>
            </div>
            <div id="side-pane-reference" class="side-pane">
              <div id="reference-panel-container"></div>
            </div>
          </div>
        </div>
        <div id="reward-lab-container" style="display: none;"></div>
      </main>
    `;

    this.controls.render(this.root.querySelector('#controls-container'));
    this.statusBanner.render(this.root.querySelector('#status-banner-container'));
    this.processLog.render(this.root.querySelector('#process-log-container'));
    this.referencePanel.render(this.root.querySelector('#reference-panel-container'));

    const initialArtist = this.getActiveArtist();
    const initialModel = (typeof initialArtist.getModel === 'function') ? initialArtist.getModel() : '';
    this.statusBanner.update({
      provider: initialArtist.name,
      model: initialModel || initialArtist.name,
      medium: this.getActiveMedium().name
    });

    // Check Ollama models in background to refresh models list if running
    const ollama = this.artistRegistry.get('ollama');
    if (ollama && typeof ollama.fetchAvailableModels === 'function') {
      ollama.fetchAvailableModels().then(models => {
        if (models && models.length > 0 && this.artistRegistry.activeId === 'ollama') {
          this.controls.updateModels('ollama');
        }
      }).catch(() => {});
    }

    // Fetch OpenRouter models catalog in background if online
    const openrouter = this.artistRegistry.get('openrouter');
    if (openrouter && typeof openrouter.fetchModels === 'function') {
      openrouter.fetchModels().then(() => {
        if (this.artistRegistry.activeId === 'openrouter') {
          this.controls.updateModels('openrouter');
        }
      }).catch(() => {});
    }

    this.attachSideTabEvents();

    // Mount WebMCP & Agent programmatic bridge on window.ams
    this.webmcp = initWebMCP(this);

    // Check if session has existing candidates
    const existing = this.sessionStore.getCurrentCandidates();
    if (existing.length > 0) {
      await this.renderCandidates(existing);
      const active = this.sessionStore.getActiveCandidate();
      if (active) {
        this.programEditor.update(active, this.getActiveMedium().capabilities());
        this.rewardPanel.update(active);
      }
    } else {
      if (EXAMPLES.length > 0) {
        await this.handleLoadExample(EXAMPLES[0]);
      }
    }
  }

  attachSideTabEvents() {
    const buttons = [...this.root.querySelectorAll('.side-tab-btn')];
    for (const btn of buttons) {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.rightPaneTab = tab;
        for (const other of buttons) {
          const active = other === btn;
          other.classList.toggle('active', active);
          this.root.querySelector(`#side-pane-${other.dataset.tab}`)?.classList.toggle('active', active);
        }
        if (tab === 'log') this.processLog.render();
      });
    }
  }

  handleToggleLog() {
    const logBtn = this.root.querySelector('#tab-btn-log');
    if (logBtn) logBtn.click();
  }

  getActiveArtist() {
    return this.artistRegistry.getActive();
  }

  getActiveMedium() {
    return this.mediaRegistry.get(this.activeMediumId) || this.mediaRegistry.get('watercolor');
  }

  async handleGenerate(prompt, previousProgram = null, feedback = null, parentId = null) {
    this.abortController = new AbortController();
    this.controls.setGenerating(true);

    const artist = this.getActiveArtist();
    const medium = this.getActiveMedium();

    this.processLog.setStatus('streaming');
    this.processLog.log(`Starting generation with ${artist.name} (Medium: ${medium.name}, Canvas: ${this.canvasSize}x${this.canvasSize}, Variation: ${this.variationLevel})...`, 'info');

    // If local Ollama or WebGPU, automatically switch side tab to Process Log so the user sees live progress
    if (artist.type === 'ollama' || artist.type === 'webgpu') {
      const logBtn = this.root.querySelector('#tab-btn-log');
      if (logBtn && this.rightPaneTab !== 'log') logBtn.click();
    }

    const currentGenerationCandidates = [];
    const count = 4;

    // Create preliminary placeholder candidates
    for (let i = 0; i < count; i++) {
      const activeModelId = (typeof artist.getModel === 'function') ? artist.getModel() : artist.name;
      const tempCand = {
        id: `gen-${Date.now()}-${i}`,
        prompt,
        model: activeModelId,
        provider: artist.name,
        medium: medium.name,
        program: { version: 1, actions: [] },
        renderedImage: null,
        rating: 0,
        renderMetadata: { actionCount: 0, renderTimeMs: 0 }
      };
      currentGenerationCandidates.push(tempCand);
    }

    this.activeCandidates = currentGenerationCandidates;
    this.selectedCandidateId = currentGenerationCandidates[0].id;

    this.candidateGrid.update(this.activeCandidates, this.selectedCandidateId);
    this.candidateGrid.setStreaming(0, 'Initializing model connection...');

    let completedCandidates = [];

    try {
      const generatedCandidates = await artist.generate({
        prompt,
        count: 4,
        mediumCapabilities: medium.capabilities(),
        previousProgram,
        feedback,
        signal: this.abortController.signal,
        settings: {
          variationSpread: this.variationLevel === 'low' ? 0.1 : this.variationLevel === 'high' ? 0.35 : this.variationLevel === 'wild' ? 0.5 : 0.22,
          temperature: this.variationLevel === 'low' ? 0.5 : this.variationLevel === 'high' ? 1.0 : this.variationLevel === 'wild' ? 1.25 : 0.8
        },
        onProgress: (p) => {
          if (p.type === 'start') {
            this.processLog.log(p.message, 'info');
            this.processLog.updateMetrics({ model: p.model, endpoint: p.endpoint });
          } else if (p.type === 'loading_model') {
            this.processLog.log(p.message, 'info');
            this.candidateGrid.setDownloadProgress({ model: p.model, progress: 0, message: p.message });
            this.statusBanner.setDownloadProgress({ model: p.model, progress: 0, message: p.message });
          } else if (p.type === 'download_progress') {
            this.candidateGrid.setDownloadProgress(p);
            this.statusBanner.setDownloadProgress(p);
            this.processLog.updateMetrics({
              download: `${p.progress}%`,
              shard: p.shardName || ''
            });
          } else if (p.type === 'model_ready') {
            this.processLog.log(p.message, 'success');
            this.candidateGrid.clearDownloadProgress();
            this.statusBanner.clearDownloadProgress();
          } else if (p.type === 'candidate_start') {
            this.candidateGrid.clearDownloadProgress();
            this.statusBanner.clearDownloadProgress();
            this.candidateGrid.setStreaming(p.candidateIndex, p.message);
            this.processLog.log(p.message, 'info');
            this.processLog.updateMetrics({
              candidate: `${String.fromCharCode(65 + p.candidateIndex)} (${p.candidateIndex + 1}/${count})`
            });
          } else if (p.type === 'stream_token') {
            this.processLog.appendToken(p.tokenChunk, p.fullText);
            this.processLog.updateMetrics({
              tokens: p.tokenCount,
              tokPerSec: p.speedTokPerSec,
              elapsedMs: p.elapsedMs
            });
          } else if (p.type === 'aborted') {
            this.processLog.log(p.message, 'warning');
            this.processLog.setStatus('interrupted');
          } else if (p.type === 'error') {
            this.processLog.log(p.message, 'error');
            this.processLog.setStatus('error');
            this.processLog.setDiagnostic(p.error);
          }
        },
        onPartialCandidate: async ({ candidateIndex, partialProgram, actionCount }) => {
          try {
            const renderRes = await medium.render(partialProgram);
            this.candidateGrid.updateStreamingImage(candidateIndex, renderRes.image, actionCount);
          } catch (e) {
            // Ignore partial render errors while stream is in flight
          }
        },
        onCandidateComplete: async ({ candidateIndex, candidate }) => {
          this.processLog.log(`Candidate ${String.fromCharCode(65 + candidateIndex)} complete (${candidate.program?.actions?.length || 0} actions, ${candidate.generationTimeMs}ms). Rendering...`, 'success');

          const startRender = performance.now();
          const renderRes = await medium.render(candidate.program);
          const renderTime = Math.round(performance.now() - startRender);

          const activeModelId = (typeof artist.getModel === 'function') ? artist.getModel() : artist.name;
          const fullCand = this.sessionStore.createCandidate({
            prompt,
            model: activeModelId,
            provider: artist.name,
            medium: medium.name,
            program: candidate.program,
            parentId,
            generation: this.sessionStore.generations.length,
            renderMetadata: {
              executionTimeMs: candidate.generationTimeMs,
              renderTimeMs: renderTime,
              actionCount: candidate.program?.actions?.length || 0,
              warnings: [...(candidate.warnings || []), ...(renderRes.warnings || [])]
            },
            rawResponse: candidate.rawResponse
          });
          fullCand.renderedImage = renderRes.image;

          currentGenerationCandidates[candidateIndex] = fullCand;
          completedCandidates.push(fullCand);
          this.activeCandidates = currentGenerationCandidates;

          // Preserve whatever candidate the user has selected! Never force back to 0!
          const currentSelection = this.candidateGrid.selectedId || this.selectedCandidateId || currentGenerationCandidates[0].id;
          this.selectedCandidateId = currentSelection;
          this.candidateGrid.update(currentGenerationCandidates, currentSelection);
          this.candidateGrid.setStreaming(candidateIndex + 1 < count ? candidateIndex + 1 : null);
        }
      });

      this.candidateGrid.setStreaming(null);

      if (completedCandidates.length > 0) {
        this.sessionStore.addGeneration({
          prompt,
          candidates: completedCandidates,
          parentId
        });
        this.activeCandidates = completedCandidates;

        const finalSelection = this.candidateGrid.selectedId || this.selectedCandidateId || completedCandidates[0].id;
        this.selectedCandidateId = finalSelection;
        this.sessionStore.selectCandidate(finalSelection);

        const activeCand = completedCandidates.find(c => c.id === finalSelection) || completedCandidates[0];
        this.candidateGrid.update(completedCandidates, finalSelection);
        this.programEditor.update(activeCand, medium.capabilities());
        this.rewardPanel.update(activeCand);

        const activeModelId = (typeof artist.getModel === 'function') ? artist.getModel() : artist.name;
        this.statusBanner.update({
          provider: artist.name,
          model: activeModelId,
          medium: medium.name,
          actionCount: activeCand?.program?.actions?.length || 0,
          generationTimeMs: activeCand?.renderMetadata?.executionTimeMs || 0,
          renderTimeMs: activeCand?.renderMetadata?.renderTimeMs || 0,
          generationIndex: this.sessionStore.currentGeneration
        });

        this.processLog.setStatus('success');
        this.processLog.log(`Generation round completed successfully. ${completedCandidates.length} candidate(s) ready.`, 'success');
      }
    } catch (err) {
      if (err.name === 'AbortError' || this.abortController?.signal?.aborted) {
        this.processLog.setStatus('interrupted');
        this.processLog.log('Generation interrupted by user.', 'warning');
      } else {
        this.processLog.setStatus('error');
        this.processLog.log(`Error: ${err.message}`, 'error');
        this.processLog.setDiagnostic(err.message);
      }
    } finally {
      this.candidateGrid.setStreaming(null);
      this.candidateGrid.clearDownloadProgress();
      this.statusBanner.clearDownloadProgress();
      this.controls.setGenerating(false);
      this.abortController = null;
    }
  }

  handleInterrupt() {
    if (this.abortController) {
      this.abortController.abort();
      this.controls.setGenerating(false);
      this.candidateGrid.setStreaming(null);
      this.candidateGrid.clearDownloadProgress();
      this.statusBanner.clearDownloadProgress();
      this.processLog.setStatus('interrupted');
      this.processLog.log('Interrupted! Aborted in-flight network requests and generation.', 'warning');
    }
  }

  async handleCanvasSizeChange(newSize) {
    this.canvasSize = Number(newSize);
    localStorage.setItem('ams_canvas_size', String(this.canvasSize));

    for (const m of this.mediaRegistry.getAll()) {
      if (typeof m.reset === 'function') {
        m.reset({ width: this.canvasSize, height: this.canvasSize });
      }
    }

    this.processLog.log(`Canvas resolution set to ${this.canvasSize} × ${this.canvasSize}. Re-rendering...`, 'info');

    // Re-render current candidates in the new resolution
    const cands = this.sessionStore.getCurrentCandidates();
    const medium = this.getActiveMedium();
    for (const c of cands) {
      const res = await medium.render(c.program);
      c.renderedImage = res.image;
    }

    this.candidateGrid.update(cands, this.sessionStore.activeCandidateId);
    const active = this.sessionStore.getActiveCandidate();
    if (active) {
      this.programEditor.update(active, medium.capabilities());
    }
  }

  handleVariationChange(newLevel) {
    this.variationLevel = newLevel;
    localStorage.setItem('ams_variation_level', newLevel);
    this.processLog.log(`Candidate variation level set to "${newLevel}".`, 'info');
  }

  async handleAnimateStrokes(candidate) {
    if (!candidate?.program?.actions) return;
    const actions = candidate.program.actions;
    const medium = this.getActiveMedium();

    this.processLog.log(`Replaying ${actions.length} strokes progressively on Hero Preview...`, 'info');

    for (let i = 1; i <= actions.length; i++) {
      const partial = { version: 1, actions: actions.slice(0, i) };
      try {
        const res = await medium.render(partial);
        const heroImg = this.root.querySelector('#hero-main-img');
        const heroBadge = this.root.querySelector('#hero-ops-badge');
        if (heroImg) heroImg.src = res.image;
        if (heroBadge) heroBadge.textContent = `Animating: stroke ${i}/${actions.length}...`;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 45));
    }

    const finalRes = await medium.render(candidate.program);
    const heroImg = this.root.querySelector('#hero-main-img');
    const heroBadge = this.root.querySelector('#hero-ops-badge');
    if (heroImg) heroImg.src = finalRes.image;
    if (heroBadge) {
      heroBadge.textContent = `${actions.length} ops · ${candidate.renderMetadata?.renderTimeMs || 0}ms`;
    }
  }

  async handleVariations(candidateId) {
    const cand = this.sessionStore.findCandidate(candidateId);
    if (!cand) return;
    await this.handleGenerate(cand.prompt, cand.program, null, cand.id);
  }

  async handleContinue(candidateId) {
    const cand = this.sessionStore.findCandidate(candidateId);
    if (!cand) return;
    await this.handleGenerate(cand.prompt + ' (continuation)', cand.program, null, cand.id);
  }

  async handleCritique(candidateId) {
    const cand = this.sessionStore.findCandidate(candidateId);
    if (!cand) return;

    const feedback = prompt(
      `Human Critique for Candidate ${cand.id.slice(-4)}:\n(e.g. "more empty space", "shift forms left", "redder palette")`,
      'more empty space, redder palette'
    );

    if (feedback && feedback.trim()) {
      this.sessionStore.setFeedback(candidateId, feedback.trim());
      await this.handleGenerate(cand.prompt, cand.program, feedback.trim(), cand.id);
    }
  }

  handleCompareMedia(candidateId) {
    const cand = this.sessionStore.findCandidate(candidateId);
    if (cand) {
      this.compareModal.open(cand);
    }
  }

  handleStartOver() {
    if (confirm('Start a new session? Current session history will be saved in archive.')) {
      this.activeCandidates = [];
      this.selectedCandidateId = null;
      this.sessionStore.clearSession();
      this.candidateGrid.update([]);
      this.programEditor.update(null);
      this.rewardPanel.update(null);
      this.processLog.clear();
    }
  }

  handleRate(candidateId, rating) {
    this.sessionStore.rateCandidate(candidateId, rating);
    const target = (this.activeCandidates || []).find(c => c.id === candidateId);
    if (target) target.rating = rating;
    const cands = (this.activeCandidates && this.activeCandidates.length > 0)
      ? this.activeCandidates
      : this.sessionStore.getCurrentCandidates();
    this.candidateGrid.update(cands, this.candidateGrid.selectedId || this.selectedCandidateId);
  }

  async handleSelectCandidate(candidateId) {
    this.selectedCandidateId = candidateId;
    this.candidateGrid.selectedId = candidateId;

    // Check active in-flight candidates first, fallback to sessionStore
    const cand = (this.activeCandidates || []).find(c => c.id === candidateId)
      || this.sessionStore.findCandidate(candidateId);

    if (cand) {
      this.sessionStore.selectCandidate(cand.id);
      const medium = this.getActiveMedium();

      const displayCandidates = (this.activeCandidates && this.activeCandidates.length > 0)
        ? this.activeCandidates
        : this.sessionStore.getCurrentCandidates();

      this.candidateGrid.update(displayCandidates, candidateId);

      if (cand.renderedImage) {
        this.programEditor.update(cand, medium.capabilities());
        this.rewardPanel.update(cand);
      }

      this.statusBanner.update({
        actionCount: cand.program?.actions?.length || 0,
        generationTimeMs: cand.renderMetadata?.executionTimeMs || 0,
        renderTimeMs: cand.renderMetadata?.renderTimeMs || 0
      });
    }
  }

  async handleProgramEdit(candidateId, newProgram) {
    this.sessionStore.updateCandidateProgram(candidateId, newProgram);
    let cand = (this.activeCandidates || []).find(c => c.id === candidateId)
      || this.sessionStore.findCandidate(candidateId);

    if (cand) {
      cand.program = newProgram;
    }
    const medium = this.getActiveMedium();

    const startRender = performance.now();
    const renderRes = await medium.render(newProgram);
    const renderTime = Math.round(performance.now() - startRender);

    if (cand) {
      cand.renderedImage = renderRes.image;
      cand.renderMetadata.renderTimeMs = renderTime;
    }

    const cands = (this.activeCandidates && this.activeCandidates.length > 0)
      ? this.activeCandidates
      : this.sessionStore.getCurrentCandidates();

    this.candidateGrid.update(cands, candidateId);
    this.rewardPanel.update(cand);

    this.statusBanner.update({
      actionCount: newProgram.actions?.length || 0,
      renderTimeMs: renderTime
    });
  }

  async handleSwapMedium(candidate) {
    const mediaList = this.mediaRegistry.list();
    const currentIdx = mediaList.findIndex(m => m.id === this.activeMediumId);
    const nextIdx = (currentIdx + 1) % mediaList.length;
    const nextMedium = mediaList[nextIdx];

    this.activeMediumId = nextMedium.id;
    this.controls.activeMedium = nextMedium.id;
    this.controls.render(this.root.querySelector('#controls-container'));

    await this.handleProgramEdit(candidate.id, candidate.program);
  }

  handleApplyOptimizedProgram(optimizedProgram) {
    const activeCand = this.sessionStore.getActiveCandidate();
    if (activeCand) {
      this.handleProgramEdit(activeCand.id, optimizedProgram);
    }
  }

  handleArtistChange(artistId) {
    this.artistRegistry.setActive(artistId);
    const artist = this.getActiveArtist();
    const model = (typeof artist.getModel === 'function') ? artist.getModel() : '';
    this.statusBanner.update({
      provider: artist.name,
      model: model || artist.name
    });
    this.controls.updateModels(artistId);
    this.processLog.log(`Switched provider to: ${artist.name} [model: ${model}]`, 'info');
  }

  handleModelChange(modelId, artistId) {
    const artist = this.getActiveArtist();
    if (typeof artist.setModel === 'function') {
      artist.setModel(modelId);
    }
    this.statusBanner.update({
      provider: artist.name,
      model: modelId
    });
    this.processLog.log(`Switched model for ${artist.name} to: ${modelId}`, 'info');
  }

  async handleMediumChange(mediumId) {
    this.activeMediumId = mediumId;
    const medium = this.getActiveMedium();
    this.statusBanner.update({ medium: medium.name });
    this.processLog.log(`Switched active medium to: ${medium.name}`, 'info');

    const cands = this.sessionStore.getCurrentCandidates();
    for (const c of cands) {
      try {
        const res = await medium.render(c.program);
        if (res && res.image) {
          c.renderedImage = res.image;
        }
      } catch (err) {
        console.error('Failed to render candidate in medium:', medium.name, err);
      }
    }
    this.candidateGrid.update(cands, this.sessionStore.activeCandidateId);
    const active = this.sessionStore.getActiveCandidate();
    if (active) {
      this.programEditor.update(active, medium.capabilities());
    }
  }

  handleModeChange(mode) {
    this.activeMode = mode;
    const studioView = this.root.querySelector('#studio-view');
    const rewardView = this.root.querySelector('#reward-lab-container');

    if (mode === 'reward') {
      studioView.style.display = 'none';
      rewardView.style.display = 'block';
      this.rewardPanel.render(rewardView);
    } else if (mode === 'datasets') {
      this.datasetModal.open();
    } else {
      studioView.style.display = 'grid';
      rewardView.style.display = 'none';
    }
  }

  async handleLoadExample(example) {
    this.activeMediumId = example.medium;
    this.controls.activeMedium = example.medium;
    this.controls.render(this.root.querySelector('#controls-container'));

    const medium = this.getActiveMedium();
    const renderRes = await medium.render(example.program);

    const cand = this.sessionStore.createCandidate({
      prompt: example.name,
      model: 'Handcrafted Example',
      medium: medium.name,
      program: example.program,
      renderMetadata: {
        executionTimeMs: 0,
        renderTimeMs: renderRes.executionTimeMs,
        actionCount: example.program.actions?.length || 0
      }
    });
    cand.renderedImage = renderRes.image;

    this.sessionStore.addGeneration({
      prompt: example.name,
      candidates: [cand]
    });

    this.activeCandidates = [cand];
    this.selectedCandidateId = cand.id;

    this.candidateGrid.update([cand], cand.id);
    this.programEditor.update(cand, medium.capabilities());
    this.rewardPanel.update(cand);

    this.statusBanner.update({
      model: 'Handcrafted Example',
      medium: medium.name,
      actionCount: example.program.actions?.length || 0,
      generationTimeMs: 0,
      renderTimeMs: renderRes.executionTimeMs,
      generationIndex: this.sessionStore.currentGeneration
    });

    this.processLog.log(`Loaded example: ${example.name}`, 'info');
  }

  async renderCandidates(candidates) {
    const medium = this.getActiveMedium();
    for (const c of candidates) {
      if (!c.renderedImage) {
        const res = await medium.render(c.program);
        c.renderedImage = res.image;
      }
    }
    this.candidateGrid.update(candidates, this.sessionStore.activeCandidateId);
  }

  handleSettingsSaved() {
    const artist = this.getActiveArtist();
    const model = (typeof artist.getModel === 'function') ? artist.getModel() : '';
    this.controls.updateModels();
    this.statusBanner.update({
      provider: artist.name,
      model: model || artist.name,
      medium: this.getActiveMedium().name
    });
  }
}
