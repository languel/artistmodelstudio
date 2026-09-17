/**
 * Studio Application Coordinator
 * Glues Artists, Media, Sessions, Rewards, and UI components together.
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
import { EXAMPLES } from '../examples/index.js';

export class StudioApp {
  constructor() {
    this.artistRegistry = defaultArtistRegistry;
    this.mediaRegistry = defaultMediaRegistry;
    this.sessionStore = defaultSessionStore;

    this.activeMediumId = 'watercolor';
    this.activeMode = 'draw'; // 'draw' | 'reward' | 'datasets'

    this.statusBanner = new StatusBanner();

    this.candidateGrid = new CandidateGrid({
      onSelectCandidate: (id) => this.handleSelectCandidate(id),
      onVariations: (id) => this.handleVariations(id),
      onContinue: (id) => this.handleContinue(id),
      onCritique: (id) => this.handleCritique(id),
      onCompareMedia: (id) => this.handleCompareMedia(id),
      onStartOver: () => this.handleStartOver(),
      onRate: (id, rating) => this.handleRate(id, rating)
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

    this.settingsModal = new SettingsModal({
      artistRegistry: this.artistRegistry,
      mediaRegistry: this.mediaRegistry,
      onSaveSettings: () => this.handleSettingsSaved()
    });

    this.controls = new Controls({
      artists: this.artistRegistry.list(),
      media: this.mediaRegistry.list(),
      activeArtist: this.artistRegistry.activeId,
      activeMedium: this.activeMediumId,
      activeMode: this.activeMode,
      onArtistChange: (id) => this.handleArtistChange(id),
      onMediumChange: (id) => this.handleMediumChange(id),
      onModeChange: (mode) => this.handleModeChange(mode),
      onGenerate: (prompt) => this.handleGenerate(prompt),
      onLoadExample: (example) => this.handleLoadExample(example),
      onOpenSettings: () => this.settingsModal.open()
    });
  }

  async init(rootElement) {
    this.root = rootElement;
    this.root.innerHTML = `
      <div id="controls-container"></div>
      <div id="status-banner-container"></div>
      <main class="studio-main">
        <div id="studio-view" class="studio-grid-layout">
          <div id="candidate-grid-container"></div>
          <div id="program-editor-container"></div>
        </div>
        <div id="reward-lab-container" style="display: none;"></div>
      </main>
    `;

    this.controls.render(this.root.querySelector('#controls-container'));
    this.statusBanner.render(this.root.querySelector('#status-banner-container'));

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
      // Pick first example to initialize the studio deterministically
      if (EXAMPLES.length > 0) {
        await this.handleLoadExample(EXAMPLES[0]);
      }
    }
  }

  getActiveArtist() {
    return this.artistRegistry.getActive();
  }

  getActiveMedium() {
    return this.mediaRegistry.get(this.activeMediumId) || this.mediaRegistry.get('watercolor');
  }

  async handleGenerate(prompt, previousProgram = null, feedback = null, parentId = null) {
    this.controls.setGenerating(true);
    const artist = this.getActiveArtist();
    const medium = this.getActiveMedium();

    try {
      const generatedCandidates = await artist.generate({
        prompt,
        count: 4,
        mediumCapabilities: medium.capabilities(),
        previousProgram,
        feedback
      });

      let totalGenTime = 0;
      let totalRenderTime = 0;
      let totalOps = 0;

      const fullCandidates = [];

      for (let i = 0; i < generatedCandidates.length; i++) {
        const item = generatedCandidates[i];
        totalGenTime += item.generationTimeMs || 0;
        totalOps += item.program.actions?.length || 0;

        const renderStartTime = performance.now();
        const renderRes = await medium.render(item.program);
        const renderTime = Math.round(performance.now() - renderStartTime);
        totalRenderTime += renderTime;

        const cand = this.sessionStore.createCandidate({
          prompt,
          model: artist.name,
          medium: medium.name,
          program: item.program,
          parentId,
          generation: this.sessionStore.generations.length,
          renderMetadata: {
            executionTimeMs: item.generationTimeMs,
            renderTimeMs: renderTime,
            warnings: [...(item.warnings || []), ...(renderRes.warnings || [])]
          },
          rawResponse: item.rawResponse
        });

        cand.renderedImage = renderRes.image;
        fullCandidates.push(cand);
      }

      this.sessionStore.addGeneration({
        prompt,
        candidates: fullCandidates,
        parentId
      });

      this.candidateGrid.update(fullCandidates, fullCandidates[0]?.id);
      this.programEditor.update(fullCandidates[0], medium.capabilities());
      this.rewardPanel.update(fullCandidates[0]);

      this.statusBanner.update({
        model: artist.name,
        medium: medium.name,
        generationTimeMs: Math.round(totalGenTime / fullCandidates.length),
        renderTimeMs: Math.round(totalRenderTime / fullCandidates.length),
        actionCount: fullCandidates[0]?.program?.actions?.length || 0,
        generationIndex: this.sessionStore.currentGeneration
      });
    } catch (err) {
      alert('Generation error: ' + err.message);
      console.error(err);
    } finally {
      this.controls.setGenerating(false);
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
      this.sessionStore.clearSession();
      this.candidateGrid.update([]);
      this.programEditor.update(null);
      this.rewardPanel.update(null);
    }
  }

  handleRate(candidateId, rating) {
    this.sessionStore.rateCandidate(candidateId, rating);
    const cands = this.sessionStore.getCurrentCandidates();
    this.candidateGrid.update(cands, this.sessionStore.activeCandidateId);
  }

  async handleSelectCandidate(candidateId) {
    this.sessionStore.selectCandidate(candidateId);
    const cand = this.sessionStore.getActiveCandidate();
    const medium = this.getActiveMedium();

    this.candidateGrid.update(this.sessionStore.getCurrentCandidates(), candidateId);
    this.programEditor.update(cand, medium.capabilities());
    this.rewardPanel.update(cand);

    if (cand) {
      this.statusBanner.update({
        actionCount: cand.program?.actions?.length || 0,
        generationTimeMs: cand.renderMetadata?.executionTimeMs || 0,
        renderTimeMs: cand.renderMetadata?.renderTimeMs || 0
      });
    }
  }

  async handleProgramEdit(candidateId, newProgram) {
    this.sessionStore.updateCandidateProgram(candidateId, newProgram);
    const cand = this.sessionStore.findCandidate(candidateId);
    const medium = this.getActiveMedium();

    // Re-render immediately on canvas
    const startRender = performance.now();
    const renderRes = await medium.render(newProgram);
    const renderTime = Math.round(performance.now() - startRender);

    if (cand) {
      cand.renderedImage = renderRes.image;
      cand.renderMetadata.renderTimeMs = renderTime;
    }

    this.candidateGrid.update(this.sessionStore.getCurrentCandidates(), candidateId);
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
    this.statusBanner.update({ model: this.getActiveArtist().name });
  }

  async handleMediumChange(mediumId) {
    this.activeMediumId = mediumId;
    const medium = this.getActiveMedium();
    this.statusBanner.update({ medium: medium.name });

    // Re-render current candidates in the newly selected medium
    const cands = this.sessionStore.getCurrentCandidates();
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
      // Keep previous view under modal
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
    this.statusBanner.update({
      model: this.getActiveArtist().name,
      medium: this.getActiveMedium().name
    });
  }
}
