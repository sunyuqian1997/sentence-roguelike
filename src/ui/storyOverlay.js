import STORY_CHAPTERS from '../data/story.json';
import { generateCharSVG } from './svgArt.js';

export let storyQueue = [];
export let storyCallback = null;

export function playStory(chapterKey, callback) {
  const chapter = STORY_CHAPTERS[chapterKey];
  if (!chapter || chapter.length === 0) { if (callback) callback(); return; }
  storyQueue = [...chapter];
  storyCallback = callback || null;
  document.getElementById('story-overlay').classList.add('active');
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
  // Typewriter effect
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
  // Update portrait SVG
  const portraitEl = document.getElementById('story-portrait');
  if (line.speaker === '李清照') {
    portraitEl.innerHTML = generateCharSVG('liqingzhao', 100);
  } else if (line.speaker === '仓颉之影') {
    portraitEl.innerHTML = generateCharSVG('cangjie', 100);
  } else if (line.speaker === '诗圣残魂') {
    portraitEl.innerHTML = generateCharSVG('shisheng', 100);
  } else if (line.speaker === '词帝幽灵') {
    portraitEl.innerHTML = generateCharSVG('cidi', 100);
  } else if (line.speaker === '???') {
    portraitEl.innerHTML = generateCharSVG('shadow', 100);
  } else {
    portraitEl.innerHTML = generateCharSVG('system', 100);
  }
}

let _storyClickReady = true;
document.addEventListener('click', function(e) {
  const overlay = document.getElementById('story-overlay');
  if (overlay && overlay.classList.contains('active')) {
    e.stopPropagation();
    e.preventDefault();
    if (!_storyClickReady) return;
    _storyClickReady = false;
    setTimeout(function(){ _storyClickReady = true; }, 200);
    showNextStoryLine();
  }
}, true);

export { STORY_CHAPTERS as STORY_CHAPTERS_REF };
