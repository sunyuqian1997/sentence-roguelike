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
  if (color === '#4A7C6B' || color === 'var(--pine)') d.classList.add('heal');
  if (color === '#2D4B73' || color === 'var(--blue-ink)') d.classList.add('block-dmg');
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
    case 'subject': return '#C54B3C';
    case 'verb': return '#B8862B';
    case 'object': return '#2D4B73';
    case 'modifier': return '#4A7C6B';
    case 'connector': return '#7A7872';
    case 'special': return '#6B4C6E';
    case 'punctuation': return '#6B4C6E';
    case 'exclamation': return '#B87333';
    default: return '#4A4A48';
  }
}
