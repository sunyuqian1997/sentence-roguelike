export function generateCharSVG(type, size) {
  const s = size || 80;
  const half = s / 2;

  const svgs = {
    // Modern Li Qingzhao — woman with ink brush, modern coat, traditional hair ornament
    liqingzhao: `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lqz-hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#0a0a12"/></linearGradient>
        <linearGradient id="lqz-coat" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2a2a3e"/><stop offset="100%" stop-color="#1a1a2e"/></linearGradient>
        <radialGradient id="lqz-aura"><stop offset="0%" stop-color="#00ffcc" stop-opacity="0.2"/><stop offset="100%" stop-color="#00ffcc" stop-opacity="0"/></radialGradient>
        <filter id="glow-c"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <circle cx="${half}" cy="${half}" r="${s*0.42}" fill="url(#lqz-aura)"/>
      <path d="M${s*0.3} ${s*0.42} Q${s*0.5} ${s*0.38} ${s*0.7} ${s*0.42} L${s*0.72} ${s*0.92} Q${s*0.5} ${s*0.98} ${s*0.28} ${s*0.92} Z" fill="url(#lqz-coat)" stroke="#00ffcc" stroke-width="0.7" opacity="0.9"/>
      <path d="M${s*0.38} ${s*0.52} Q${s*0.5} ${s*0.48} ${s*0.62} ${s*0.52}" fill="none" stroke="#e8c84c" stroke-width="0.8" opacity="0.5"/>
      <path d="M${s*0.36} ${s*0.62} Q${s*0.5} ${s*0.58} ${s*0.64} ${s*0.62}" fill="none" stroke="#e8c84c" stroke-width="0.6" opacity="0.3"/>
      <ellipse cx="${half}" cy="${s*0.28}" rx="${s*0.13}" ry="${s*0.16}" fill="#d4b896"/>
      <path d="M${s*0.37} ${s*0.26} Q${s*0.37} ${s*0.1} ${half} ${s*0.08} Q${s*0.63} ${s*0.1} ${s*0.63} ${s*0.26} Q${s*0.68} ${s*0.32} ${s*0.66} ${s*0.4} L${s*0.56} ${s*0.32} Q${half} ${s*0.3} ${s*0.44} ${s*0.32} L${s*0.34} ${s*0.4} Q${s*0.32} ${s*0.32} ${s*0.37} ${s*0.26}" fill="url(#lqz-hair)"/>
      <circle cx="${s*0.58}" cy="${s*0.14}" r="${s*0.025}" fill="#e8c84c" filter="url(#glow-c)"/>
      <ellipse cx="${s*0.44}" cy="${s*0.28}" rx="${s*0.02}" ry="${s*0.015}" fill="#1a1a2e"/>
      <ellipse cx="${s*0.56}" cy="${s*0.28}" rx="${s*0.02}" ry="${s*0.015}" fill="#1a1a2e"/>
      <line x1="${s*0.68}" y1="${s*0.48}" x2="${s*0.8}" y2="${s*0.22}" stroke="#4a4a66" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="${s*0.8}" cy="${s*0.2}" r="${s*0.025}" fill="#00ffcc" filter="url(#glow-c)"/>
      <path d="M${s*0.78} ${s*0.18} Q${s*0.82} ${s*0.14} ${s*0.84} ${s*0.16}" fill="none" stroke="#00ffcc" stroke-width="0.5" opacity="0.6"/>
    </svg>`,

    // Ink Demon (墨妖) — dark swirling blob with glowing eyes
    moyao: `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="moyao-body"><stop offset="0%" stop-color="#2a1a2e"/><stop offset="60%" stop-color="#0f0a12"/><stop offset="100%" stop-color="#050508"/></radialGradient>
        <filter id="moyao-blur"><feGaussianBlur stdDeviation="3"/></filter>
      </defs>
      <ellipse cx="${half}" cy="${s*0.55}" rx="${s*0.38}" ry="${s*0.35}" fill="url(#moyao-body)" filter="url(#moyao-blur)" opacity="0.7"/>
      <ellipse cx="${half}" cy="${s*0.5}" rx="${s*0.3}" ry="${s*0.32}" fill="#0f0a12"/>
      <path d="M${s*0.2} ${s*0.4} Q${s*0.15} ${s*0.2} ${s*0.25} ${s*0.15} Q${s*0.3} ${s*0.25} ${s*0.35} ${s*0.3}" fill="#0f0a12" opacity="0.8"/>
      <path d="M${s*0.65} ${s*0.3} Q${s*0.7} ${s*0.15} ${s*0.8} ${s*0.18} Q${s*0.75} ${s*0.28} ${s*0.7} ${s*0.35}" fill="#0f0a12" opacity="0.8"/>
      <ellipse cx="${s*0.4}" cy="${s*0.42}" rx="${s*0.05}" ry="${s*0.04}" fill="#ff4444" opacity="0.9"/>
      <ellipse cx="${s*0.6}" cy="${s*0.42}" rx="${s*0.05}" ry="${s*0.04}" fill="#ff4444" opacity="0.9"/>
      <ellipse cx="${s*0.4}" cy="${s*0.42}" rx="${s*0.02}" ry="${s*0.02}" fill="#ffcc00"/>
      <ellipse cx="${s*0.6}" cy="${s*0.42}" rx="${s*0.02}" ry="${s*0.02}" fill="#ffcc00"/>
      <path d="M${s*0.35} ${s*0.58} Q${half} ${s*0.65} ${s*0.65} ${s*0.58}" fill="none" stroke="#ff4444" stroke-width="1.5" opacity="0.6"/>
    </svg>`,

    // Cangjie's Shadow — ancient figure with glowing symbol eyes
    cangjie: `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cj-robe" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#0a0510"/></linearGradient>
        <filter id="cj-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M${s*0.25} ${s*0.35} Q${half} ${s*0.3} ${s*0.75} ${s*0.35} L${s*0.8} ${s*0.95} Q${half} ${s} ${s*0.2} ${s*0.95} Z" fill="url(#cj-robe)" stroke="#e8c84c" stroke-width="0.5" opacity="0.8"/>
      <circle cx="${half}" cy="${s*0.25}" r="${s*0.14}" fill="#c4a87a"/>
      <path d="M${s*0.35} ${s*0.2} Q${s*0.35} ${s*0.08} ${half} ${s*0.05} Q${s*0.65} ${s*0.08} ${s*0.65} ${s*0.2}" fill="#1a1a2e" stroke="#e8c84c" stroke-width="0.5"/>
      <text x="${s*0.42}" y="${s*0.28}" font-size="${s*0.08}" fill="#e8c84c" filter="url(#cj-glow)" font-family="serif">目</text>
      <text x="${s*0.54}" y="${s*0.28}" font-size="${s*0.08}" fill="#e8c84c" filter="url(#cj-glow)" font-family="serif">目</text>
      <text x="${s*0.42}" y="${s*0.24}" font-size="${s*0.06}" fill="#e8c84c" filter="url(#cj-glow)" font-family="serif">目</text>
      <text x="${s*0.56}" y="${s*0.24}" font-size="${s*0.06}" fill="#e8c84c" filter="url(#cj-glow)" font-family="serif">目</text>
      <path d="M${s*0.3} ${s*0.7} L${s*0.7} ${s*0.7}" stroke="#e8c84c" stroke-width="0.5" opacity="0.3"/>
    </svg>`,

    // Poet Saint Remnant (诗圣残魂)
    shisheng: `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ss-robe" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a2a1a"/><stop offset="100%" stop-color="#0a120a"/></linearGradient>
        <filter id="ss-glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M${s*0.28} ${s*0.38} Q${half} ${s*0.34} ${s*0.72} ${s*0.38} L${s*0.74} ${s*0.95} Q${half} ${s} ${s*0.26} ${s*0.95} Z" fill="url(#ss-robe)" stroke="#00ffcc" stroke-width="0.5" opacity="0.85"/>
      <ellipse cx="${half}" cy="${s*0.26}" rx="${s*0.12}" ry="${s*0.14}" fill="#b8a080" opacity="0.9"/>
      <path d="M${s*0.38} ${s*0.22} Q${s*0.38} ${s*0.1} ${half} ${s*0.08} Q${s*0.62} ${s*0.1} ${s*0.62} ${s*0.22}" fill="#1a2a1a"/>
      <rect x="${s*0.3}" y="${s*0.52}" width="${s*0.4}" height="${s*0.28}" rx="3" fill="none" stroke="#e8c84c" stroke-width="0.5" opacity="0.4"/>
      <text x="${s*0.38}" y="${s*0.64}" font-size="${s*0.06}" fill="#e8c84c" opacity="0.6" font-family="serif">国破</text>
      <text x="${s*0.38}" y="${s*0.74}" font-size="${s*0.06}" fill="#e8c84c" opacity="0.4" font-family="serif">山河</text>
      <ellipse cx="${s*0.44}" cy="${s*0.26}" rx="${s*0.015}" ry="${s*0.01}" fill="#00ffcc" filter="url(#ss-glow)"/>
      <ellipse cx="${s*0.56}" cy="${s*0.26}" rx="${s*0.015}" ry="${s*0.01}" fill="#00ffcc" filter="url(#ss-glow)"/>
    </svg>`,

    // Word Emperor Ghost (词帝幽灵)
    cidi: `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cd-robe" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2a1030"/><stop offset="100%" stop-color="#0a0510"/></linearGradient>
        <filter id="cd-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M${s*0.2} ${s*0.35} Q${half} ${s*0.28} ${s*0.8} ${s*0.35} L${s*0.85} ${s*0.95} Q${half} ${s} ${s*0.15} ${s*0.95} Z" fill="url(#cd-robe)" stroke="#b44aff" stroke-width="0.8" opacity="0.9"/>
      <circle cx="${half}" cy="${s*0.25}" r="${s*0.13}" fill="#1a1020" stroke="#b44aff" stroke-width="1"/>
      <path d="M${s*0.35} ${s*0.1} L${s*0.4} ${s*0.02} L${half} ${s*0.06} L${s*0.6} ${s*0.02} L${s*0.65} ${s*0.1}" fill="#e8c84c" stroke="#b44aff" stroke-width="0.5" filter="url(#cd-glow)"/>
      <ellipse cx="${s*0.43}" cy="${s*0.25}" rx="${s*0.03}" ry="${s*0.025}" fill="#ff4444" filter="url(#cd-glow)"/>
      <ellipse cx="${s*0.57}" cy="${s*0.25}" rx="${s*0.03}" ry="${s*0.025}" fill="#ff4444" filter="url(#cd-glow)"/>
      <path d="M${s*0.4} ${s*0.32} Q${half} ${s*0.36} ${s*0.6} ${s*0.32}" fill="none" stroke="#ff4444" stroke-width="1" opacity="0.7"/>
      <text x="${s*0.4}" y="${s*0.65}" font-size="${s*0.1}" fill="#b44aff" opacity="0.4" filter="url(#cd-glow)" font-family="serif">帝</text>
    </svg>`,

    // Shadow (unknown speaker)
    shadow: `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="sh-body"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#0a0a12" stop-opacity="0"/></radialGradient>
      </defs>
      <ellipse cx="${half}" cy="${half}" rx="${s*0.35}" ry="${s*0.4}" fill="url(#sh-body)"/>
      <ellipse cx="${s*0.42}" cy="${s*0.4}" rx="${s*0.035}" ry="${s*0.025}" fill="#ff4444" opacity="0.8"/>
      <ellipse cx="${s*0.58}" cy="${s*0.4}" rx="${s*0.035}" ry="${s*0.025}" fill="#ff4444" opacity="0.8"/>
      <text x="${s*0.43}" y="${s*0.62}" font-size="${s*0.12}" fill="#ff4444" opacity="0.3" font-family="serif">?</text>
    </svg>`,

    // System / narrator
    system: `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="sys-glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <circle cx="${half}" cy="${half}" r="${s*0.3}" fill="none" stroke="#e8c84c" stroke-width="1" opacity="0.3"/>
      <circle cx="${half}" cy="${half}" r="${s*0.2}" fill="none" stroke="#e8c84c" stroke-width="0.5" opacity="0.5"/>
      <text x="${half}" y="${s*0.54}" text-anchor="middle" font-size="${s*0.15}" fill="#e8c84c" filter="url(#sys-glow)" font-family="serif">文</text>
    </svg>`,
  };

  return svgs[type] || svgs.shadow;
}

export function getEnemyPortraitSVG(enemy) {
  const s = 80;
  const half = s / 2;
  if (enemy.enemyKey === 'moyao' || enemy.name === '墨妖') return generateCharSVG('moyao', s);
  if (enemy.enemyKey === 'cangjie' || enemy.name === '仓颉之影') return generateCharSVG('cangjie', s);
  if (enemy.enemyKey === 'shisheng' || enemy.name === '诗圣残魂') return generateCharSVG('shisheng', s);
  if (enemy.enemyKey === 'cidi' || enemy.name === '词帝幽灵') return generateCharSVG('cidi', s);
  // Fallback: generate a generic demon SVG
  const colors = { '💀': '#b44aff', '📜': '#e8c84c', '❓': '#ff4444', '⭐': '#e8c84c', '🖊️': '#00ffcc', '🪞': '#4a9eff', '👤': '#8a8275', '🌀': '#b44aff', '🌑': '#1a1a2e', '👁️': '#e8c84c', '📖': '#00ffcc', '👑': '#ff4444' };
  const color = colors[enemy.emoji] || '#ff4444';
  return `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="eg-${enemy.name}"><stop offset="0%" stop-color="${color}" stop-opacity="0.2"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="${half}" cy="${half}" r="${s*0.35}" fill="url(#eg-${enemy.name})"/>
    <text x="${half}" y="${s*0.58}" text-anchor="middle" font-size="${s*0.4}">${enemy.emoji || '👾'}</text>
  </svg>`;
}
