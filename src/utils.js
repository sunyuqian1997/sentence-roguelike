export function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function showFloatingText(element, text, color) {
  if (!element) return;
  const d = document.createElement('div');
  d.className = 'damage-number';
  if (color === '#6bff6b') d.classList.add('heal');
  if (color === '#6b9fff') d.classList.add('block-dmg');
  d.textContent = text;
  d.style.color = color;
  d.style.left = '50%';
  d.style.top = '50%';
  d.style.transform = 'translate(-50%,-50%)';
  element.style.position = 'relative';
  element.appendChild(d);
  setTimeout(() => d.remove(), 1000);
}

export function getPosColor(pos) {
  switch (pos) {
    case 'subject': return '#e07070';
    case 'verb': return '#e8c84c';
    case 'object': return '#7090d4';
    case 'modifier': return '#70d490';
    case 'connector': return '#8a8275';
    case 'special': return '#b470d4';
    case 'punctuation': return '#9b59b6';
    case 'exclamation': return '#e8873a';
    default: return '#d4c9a8';
  }
}
