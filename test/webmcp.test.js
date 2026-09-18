import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initWebMCP, MCP_TOOLS_SPEC } from '../src/mcp/webmcp.js';

describe('WebMCP Agent Bridge', () => {
  let mockStudioApp;
  let fakeWindow;

  beforeEach(() => {
    mockStudioApp = {
      canvasSize: 1024,
      variationLevel: 'medium',
      activeMediumId: 'watercolor',
      activeCandidates: [
        {
          id: 'cand-0',
          prompt: 'three red flowers',
          rating: 4,
          program: {
            version: 1,
            actions: [
              { op: 'background', color: '#faf7f2' },
              { op: 'circle', x: 0, y: 0, diameter: 0.4, color: '#d94262' }
            ]
          },
          renderedImage: 'data:image/png;base64,mockImage',
          renderMetadata: { executionTimeMs: 120, renderTimeMs: 15 }
        },
        {
          id: 'cand-1',
          prompt: 'three red flowers',
          rating: 0,
          program: {
            version: 1,
            actions: [
              { op: 'background', color: '#faf7f2' },
              { op: 'rect', x: 0, y: 0, width: 0.5, height: 0.5 }
            ]
          },
          renderedImage: 'data:image/png;base64,mockImage2',
          renderMetadata: { executionTimeMs: 110, renderTimeMs: 12 }
        }
      ],
      selectedCandidateId: 'cand-0',
      sessionStore: {
        getActiveCandidate: () => mockStudioApp.activeCandidates[0],
        getCurrentCandidates: () => mockStudioApp.activeCandidates,
        findCandidate: (id) => mockStudioApp.activeCandidates.find(c => c.id === id),
        rateCandidate: vi.fn(),
        setFeedback: vi.fn(),
        selectCandidate: vi.fn()
      },
      getActiveArtist: () => ({ id: 'mock', name: 'Procedural Artist' }),
      getActiveMedium: () => ({
        id: 'watercolor',
        name: 'Watercolor',
        capabilities: () => ({ id: 'watercolor', coordinateSystem: 'normalized' }),
        render: vi.fn().mockResolvedValue({ image: 'data:image/png;base64,mockRender', warnings: [] })
      }),
      mediaRegistry: {
        get: () => mockStudioApp.getActiveMedium()
      },
      handleGenerate: vi.fn().mockResolvedValue(),
      handleInterrupt: vi.fn(),
      handleSelectCandidate: vi.fn(),
      handleRate: vi.fn(),
      handleProgramEdit: vi.fn().mockResolvedValue(),
      handleArtistChange: vi.fn(),
      handleMediumChange: vi.fn().mockResolvedValue(),
      handleCanvasSizeChange: vi.fn(),
      handleVariationChange: vi.fn(),
      controls: {
        activeArtist: 'mock',
        activeMedium: 'watercolor'
      }
    };

    fakeWindow = {
      location: { origin: 'http://localhost:3000' },
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    };
    vi.stubGlobal('window', fakeWindow);
  });

  it('attaches window.ams and window.webmcp with full tool specifications', () => {
    const bridge = initWebMCP(mockStudioApp);
    expect(window.ams).toBeDefined();
    expect(window.webmcp).toBeDefined();
    expect(bridge).toBe(window.ams);

    const tools = bridge.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(8);
    expect(tools.some(t => t.name === 'ams_generate')).toBe(true);
    expect(tools.some(t => t.name === 'ams_render_program')).toBe(true);
    expect(tools.some(t => t.name === 'ams_evaluate_rewards')).toBe(true);
  });

  it('retrieves full studio state via getStudioState', () => {
    const bridge = initWebMCP(mockStudioApp);
    const state = bridge.getStudioState();

    expect(state.activeArtist).toBe('mock');
    expect(state.activeMedium).toBe('watercolor');
    expect(state.canvasSize).toBe(1024);
    expect(state.candidateCount).toBe(2);
    expect(state.candidates[0].tag).toBe('A');
    expect(state.candidates[1].tag).toBe('B');
    expect(state.activeProgram.actions.length).toBe(2);
  });

  it('evaluates reward functions through bridge', () => {
    const bridge = initWebMCP(mockStudioApp);
    const scores = bridge.evaluateRewards();

    expect(scores.total).toBeGreaterThanOrEqual(0);
    expect(scores.breakdown).toBeDefined();
    expect(scores.breakdown.valid).toBeDefined();
    expect(scores.breakdown.redness).toBeDefined();
  });

  it('executes candidate selection, rating, and interrupts', () => {
    const bridge = initWebMCP(mockStudioApp);
    
    bridge.selectCandidate(1);
    expect(mockStudioApp.handleSelectCandidate).toHaveBeenCalledWith('cand-1');

    bridge.rateCandidate(0, 5);
    expect(mockStudioApp.handleRate).toHaveBeenCalledWith('cand-0', 5);

    const intrRes = bridge.interrupt();
    expect(intrRes.success).toBe(true);
    expect(mockStudioApp.handleInterrupt).toHaveBeenCalled();
  });

  it('handles MCP callTool execution', async () => {
    const bridge = initWebMCP(mockStudioApp);

    const resState = await bridge.callTool('ams_get_studio_state', {});
    expect(resState.content).toBeDefined();
    expect(resState.content[0].type).toBe('text');
    const parsedState = JSON.parse(resState.content[0].text);
    expect(parsedState.canvasSize).toBe(1024);

    const resEval = await bridge.callTool('ams_evaluate_rewards', {});
    const parsedEval = JSON.parse(resEval.content[0].text);
    expect(parsedEval.total).toBeDefined();
  });

  it('registers postMessage listener for JSON-RPC 2.0 WebMCP requests', () => {
    initWebMCP(mockStudioApp);
    expect(fakeWindow.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('retrieves detailed candidate data via getCandidate and ams_get_candidate', async () => {
    const bridge = initWebMCP(mockStudioApp);
    const cand = bridge.getCandidate(0);

    expect(cand).toBeDefined();
    expect(cand.id).toBe('cand-0');
    expect(cand.renderedImage).toBe('data:image/png;base64,mockImage');
    expect(cand.rewards).toBeDefined();

    const toolRes = await bridge.callTool('ams_get_candidate', { candidate: 0 });
    const parsed = JSON.parse(toolRes.content[0].text);
    expect(parsed.id).toBe('cand-0');
  });

  it('grades candidates with scores, criteria, feedback, and selects winner', async () => {
    const bridge = initWebMCP(mockStudioApp);

    const gradeRes = bridge.gradeCandidates([
      {
        candidate: 0,
        rating: 5,
        score: 95,
        feedback: 'Superb plumage and beak',
        criteria: { aesthetic: 98, promptAdherence: 94 }
      },
      {
        candidate: 1,
        rating: 2,
        score: 40,
        feedback: 'Lacks bird anatomy'
      }
    ], 0);

    expect(gradeRes.success).toBe(true);
    expect(gradeRes.gradedCount).toBe(2);
    expect(gradeRes.chosenCandidateId).toBe('cand-0');
    expect(mockStudioApp.handleRate).toHaveBeenCalledWith('cand-0', 5);
    expect(mockStudioApp.handleRate).toHaveBeenCalledWith('cand-1', 2);
  });

  it('executes in-browser model training and model export/import via WebMCP', async () => {
    const bridge = initWebMCP(mockStudioApp);

    const trainRes = await bridge.callTool('ams_train_model', {
      prompt: 'hummingbird',
      epochs: 3,
      modelName: 'Hummingbird Test Model'
    });

    const parsedTrain = JSON.parse(trainRes.content[0].text);
    expect(parsedTrain.success).toBe(true);
    expect(parsedTrain.modelId).toBeDefined();
    expect(parsedTrain.architecture).toBe('lora-r4');

    const exportRes = await bridge.callTool('ams_export_model', {});
    const parsedExport = JSON.parse(exportRes.content[0].text);
    expect(parsedExport.success).toBe(true);
    expect(parsedExport.json).toContain('Hummingbird Test Model');

    const listRes = await bridge.callTool('ams_list_trained_models', {});
    const parsedList = JSON.parse(listRes.content[0].text);
    expect(parsedList.length).toBeGreaterThanOrEqual(1);
  });
});
