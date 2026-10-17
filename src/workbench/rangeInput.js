/** The shared slider look (code, canvas popovers, panels): the filled part follows the value. */
export function rangeInput({ min, max, step, value, title = '' }) {
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'wb-range';
  Object.assign(input, { min, max, step });
  input.value = String(value);
  input.title = title;
  paintRange(input);
  input.addEventListener('input', () => paintRange(input));
  return input;
}
export function paintRange(input) {
  const min = Number(input.min), max = Number(input.max);
  input.style.setProperty('--p', `${((Number(input.value) - min) / ((max - min) || 1)) * 100}%`);
}

