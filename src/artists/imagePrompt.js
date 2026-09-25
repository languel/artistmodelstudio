/**
 * Reference images as prompts.
 *
 * Prompt modes (toolbar "Prompt" menu):
 *   text           the typed prompt only
 *   text+image     typed prompt + the reference image
 *   image          the reference image only (a short built-in text asks for a drawing of it)
 *   describe       a vision model describes the reference; the description becomes the prompt
 *   describe+image the description, plus the reference image
 */

export const PROMPT_MODES = {
  text: 'Text',
  'text+image': 'Text + reference',
  image: 'Reference only',
  describe: 'Describe ref → text',
  'describe+image': 'Describe ref → text + reference'
};

export const usesImage = mode => mode === 'text+image' || mode === 'image' || mode === 'describe+image';

export const IMAGE_ONLY_PROMPT = 'the attached reference image';

export const DESCRIBE_INSTRUCTION = 'Describe this image as a prompt for an artist who will redraw it with simple shapes: subject, composition (what is where), main colours, and style, in one or two sentences. Reply with the prompt only.';

export const IMAGE_NOTE = 'A reference image is attached: use its composition, placement and palette (in the canvas coordinates above) while following the text.';

/** OpenAI-style user content with an optional image (data URL). */
export function openAIContent(text, image) {
  if (!image) return text;
  return [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }];
}

/** Ollama message with an optional image (bare base64). */
export function ollamaMessage(text, image) {
  const m = { role: 'user', content: text };
  if (image) m.images = [image.split(',')[1]];
  return m;
}

/** Draw an image/canvas into a JPEG data URL, longest side `max`. */
export function imageToDataUrl(img, max = 768) {
  const w = img.naturalWidth || img.videoWidth || img.width, h = img.naturalHeight || img.videoHeight || img.height;
  if (!w || !h) return null;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
