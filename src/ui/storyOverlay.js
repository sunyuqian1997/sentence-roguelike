import STORY_CHAPTERS from '../data/story.json';
import { generateCharSVG } from './svgArt.js';

export let storyQueue = [];
export let storyCallback = null;

export function skipStory() {
  storyQueue = [];
  document.getElementById('story-overlay').classList.remove('active');
  if (storyCallback) storyCallback();
  storyCallback = null;
}

export function playStory(chapterKey, callback) {
  const chapter = STORY_CHAPTERS[chapterKey];
  if (!chapter || chapter.length === 0) { if (callback) callback(); return; }
  storyQueue = [...chapter];
  storyCallback = callback || null;
  const overlay = document.getElementById('story-overlay');
  overlay.classList.add('active');

  let skipBtn = overlay.querySelector('.story-skip-btn');
  if (!skipBtn) {
    skipBtn = document.createElement('button');
    skipBtn.className = 'story-skip-btn';
    skipBtn.textContent = '跳过 »';
    skipBtn.onclick = (e) => { e.stopPropagation(); skipStory(); };
    overlay.appendChild(skipBtn);
  }

  showNextStoryLine();
}

export function showNextStoryLine() {
  if (storyQueue.length === 0) {
    document.getElementById('story-overlay').classList.remove('active');
    if (storyCallback) storyCallback();
    storyCallback = null;
    return;
  }
  const line = storyQueue.shift();
  document.getElementById('story-speaker').textContent = line.speaker;
  const textEl = document.getElementById('story-text');
  textEl.textContent = '';
  let i = 0;
  const chars = line.text.split('');
  function typeChar() {
    if (i < chars.length) {
      textEl.textContent += chars[i];
      i++;
      setTimeout(typeChar, 30);
    }
  }
  typeChar();
  const portraitEl = document.getElementById('story-portrait');
  const speakerMap = {
    '李清照': 'liqingzhao', '仓颉之影': 'cangjie', '诗圣残魂': 'shisheng',
    '词帝幽灵': 'cidi', '???': 'shadow',
  };
  portraitEl.innerHTML = generateCharSVG(speakerMap[line.speaker] || 'system', 100);
}

let _storyClickReady = true;
document.addEventListener('click', function(e) {
  const overlay = document.getElementById('story-overlay');
  if (overlay && overlay.classList.contains('active')) {
    if (e.target.classList.contains('story-skip-btn')) return;
    e.stopPropagation();
    e.preventDefault();
    if (!_storyClickReady) return;
    _storyClickReady = false;
    setTimeout(function() { _storyClickReady = true; }, 200);
    showNextStoryLine();
  }
}, true);

export { STORY_CHAPTERS as STORY_CHAPTERS_REF };
