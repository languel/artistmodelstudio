/**
 * Dataset Export Utilities
 *
 * Exports interaction sessions, SFT datasets (JSONL), and Preference datasets (JSONL)
 * for downstream training (LoRA / SFT / DPO).
 */

export function exportSessionJSON(store) {
  const payload = {
    sessionId: store.sessionId,
    exportedAt: new Date().toISOString(),
    totalGenerations: store.generations.length,
    generations: store.generations
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Exports SFT Dataset in standard chat format:
 * {"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "{...}"}]}
 *
 * filterMode: 'selected' | 'rated' | 'all' | 'edited'
 */
export function exportSFTJSONL(store, filterMode = 'selected') {
  const lines = [];

  for (const gen of store.generations) {
    for (const cand of gen.candidates) {
      let include = false;
      if (filterMode === 'selected' && cand.selected) include = true;
      else if (filterMode === 'rated' && (cand.rating || 0) > 0) include = true;
      else if (filterMode === 'edited' && cand.isEdited) include = true;
      else if (filterMode === 'all') include = true;

      if (include && cand.program?.actions?.length > 0) {
        const record = {
          messages: [
            {
              role: 'user',
              content: cand.prompt
            },
            {
              role: 'assistant',
              content: JSON.stringify(cand.program)
            }
          ],
          metadata: {
            candidateId: cand.id,
            medium: cand.medium,
            model: cand.model,
            rating: cand.rating || 0,
            isEdited: Boolean(cand.isEdited),
            sessionId: store.sessionId
          }
        };
        lines.push(JSON.stringify(record));
      }
    }
  }

  return lines.join('\n');
}

/**
 * Exports Preference Dataset (DPO/RLHF pairwise ranking):
 * {"prompt": "...", "chosen": "{...}", "rejected": "{...}", "metadata": {...}}
 */
export function exportPreferenceJSONL(store) {
  const lines = [];

  for (const gen of store.generations) {
    const candidates = gen.candidates || [];
    const chosen = candidates.find(c => c.selected);

    if (!chosen) continue;

    const rejectedList = candidates.filter(c => c.id !== chosen.id);

    for (const rejected of rejectedList) {
      const pair = {
        prompt: gen.prompt,
        chosen: JSON.stringify(chosen.program),
        rejected: JSON.stringify(rejected.program),
        metadata: {
          chosenId: chosen.id,
          rejectedId: rejected.id,
          medium: chosen.medium,
          generation: gen.generationIndex,
          sessionId: store.sessionId
        }
      };
      lines.push(JSON.stringify(pair));
    }
  }

  return lines.join('\n');
}

/**
 * Browser download trigger for text/json/jsonl content.
 */
export function downloadBlob(content, filename, mimeType = 'application/json') {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
