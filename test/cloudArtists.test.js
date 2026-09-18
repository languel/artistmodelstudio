import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterArtist, OPENROUTER_MODEL_PRESETS } from '../src/artists/OpenRouterArtist.js';
import { OpenAICompatibleArtist, OPENAI_MODEL_PRESETS } from '../src/artists/OpenAICompatibleArtist.js';

describe('Cloud & OpenAI-Compatible Artists', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('OpenRouterArtist', () => {
    it('has valid model presets', () => {
      expect(OPENROUTER_MODEL_PRESETS.length).toBeGreaterThanOrEqual(4);
      expect(OPENROUTER_MODEL_PRESETS.some(p => p.id.includes('claude'))).toBe(true);
      expect(OPENROUTER_MODEL_PRESETS.some(p => p.id.includes('gpt-4o'))).toBe(true);
    });

    it('throws descriptive error if API key is missing', async () => {
      const artist = new OpenRouterArtist({ apiKey: '' });
      await expect(artist.generate({
        prompt: 'test prompt',
        count: 1,
        mediumCapabilities: { id: 'flat', coordinateSystem: 'normalized' }
      })).rejects.toThrow(/OpenRouter API key is missing/);
    });

    it('streams SSE tokens, calculates speed, and extracts valid JSON program', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"{\\"version\\": 1, \\"actions\\": ["}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"{\\"op\\": \\"background\\", \\"color\\": \\"#faf7f2\\"}, "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"{\\"op\\": \\"circle\\", \\"x\\": 0, \\"y\\": 0, \\"diameter\\": 0.5}"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"]}"}}]}\n\n',
        'data: [DONE]\n\n'
      ];

      let chunkIdx = 0;
      const mockStream = new ReadableStream({
        pull(controller) {
          if (chunkIdx < sseChunks.length) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(sseChunks[chunkIdx++]));
          } else {
            controller.close();
          }
        }
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: mockStream
      });
      vi.stubGlobal('fetch', mockFetch);

      const artist = new OpenRouterArtist({ apiKey: 'sk-or-test-key', model: 'anthropic/claude-3.5-sonnet' });
      const progressEvents = [];
      const partialEvents = [];

      const candidates = await artist.generate({
        prompt: 'red flower',
        count: 1,
        mediumCapabilities: { id: 'watercolor', coordinateSystem: 'normalized' },
        onProgress: (p) => progressEvents.push(p),
        onPartialCandidate: (part) => partialEvents.push(part)
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, req] = mockFetch.mock.calls[0];
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(req.headers['Authorization']).toBe('Bearer sk-or-test-key');

      expect(candidates).toHaveLength(1);
      expect(candidates[0].program.actions).toHaveLength(2);
      expect(candidates[0].program.actions[0].op).toBe('background');
      expect(candidates[0].program.actions[1].op).toBe('circle');
      expect(candidates[0].tokenCount).toBeGreaterThan(0);
      expect(progressEvents.some(e => e.type === 'stream_token')).toBe(true);
    });

    it('gracefully handles AbortController user cancellation', async () => {
      const abortController = new AbortController();

      const mockStream = new ReadableStream({
        async pull(controller) {
          abortController.abort();
          throw new DOMException('Aborted by user', 'AbortError');
        }
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: mockStream
      });
      vi.stubGlobal('fetch', mockFetch);

      const artist = new OpenRouterArtist({ apiKey: 'sk-or-test-key' });
      const candidates = await artist.generate({
        prompt: 'test',
        count: 1,
        signal: abortController.signal,
        mediumCapabilities: { id: 'flat', coordinateSystem: 'normalized' }
      });

      expect(candidates).toHaveLength(0);
    });
  });

  describe('OpenAICompatibleArtist', () => {
    it('supports custom baseURL and header configuration', async () => {
      const customBase = 'http://localhost:1234/v1';
      const artist = new OpenAICompatibleArtist({
        baseURL: customBase,
        apiKey: 'bearer-custom-chatgpt-token',
        model: 'chatgpt-4o-latest',
        customHeaders: JSON.stringify({ 'X-Client-Session': 'session-123' })
      });

      expect(artist.getEndpoint()).toBe('http://localhost:1234/v1/chat/completions');

      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"{\\"version\\": 1, \\"actions\\": [{\\"op\\": \\"background\\", \\"color\\": \\"#111\\"}]}"}}]}\n\n',
        'data: [DONE]\n\n'
      ];

      let chunkIdx = 0;
      const mockStream = new ReadableStream({
        pull(controller) {
          if (chunkIdx < sseChunks.length) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(sseChunks[chunkIdx++]));
          } else {
            controller.close();
          }
        }
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: mockStream
      });
      vi.stubGlobal('fetch', mockFetch);

      const candidates = await artist.generate({
        prompt: 'geometric art',
        count: 1,
        mediumCapabilities: { id: 'flat', coordinateSystem: 'normalized' }
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, req] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('http://localhost:1234/v1/chat/completions');
      expect(req.headers['Authorization']).toBe('Bearer bearer-custom-chatgpt-token');
      expect(req.headers['X-Client-Session']).toBe('session-123');

      expect(candidates).toHaveLength(1);
      expect(candidates[0].program.actions[0].op).toBe('background');
    });

    it('diagnoses 401 authentication errors clearly', () => {
      const artist = new OpenAICompatibleArtist();
      const err = new Error('HTTP 401: Unauthorized');
      const diag = artist.diagnoseError(err, 'https://api.openai.com/v1/chat/completions');
      expect(diag).toContain('Authentication failed');
    });
  });
});
