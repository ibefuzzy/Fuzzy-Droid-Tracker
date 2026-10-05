'use strict';
/* ---------------------------------------------------------------------------
   overlay-backgrounds.js (v1.20.0): the panel backgrounds of ⚙ Overlay Settings → Appearance.
   30 designs (Star Wars + Halloween), all vector, drawn here as SVG/CSS layers behind each
   overlay's panels. A theme's themeBg / themeBgStrength / themeBgColor (null natural, 'border',
   or a hex: recoloured keeping its shading) / themeBgMotion / themeBgSpeed choose and tune it;
   requirements.js validates them (OVERLAY_BG_KEYS). Designed and approved in
   dev/overlay-backgrounds-lab.html. Loaded after requirements.js (borderIconSvg, BORDER_SKINS).
--------------------------------------------------------------------------- */
const OVERLAY_BG = (function(){
  const NS = 'http://www.w3.org/2000/svg';
  const f = (n) => (Math.round(n * 10) / 10).toString();
  const a2 = (n) => (Math.round(n * 100) / 100).toString();
  // Alpha that the "breathe"/"flicker" pulse can scale (--fp animates 1 -> lower while animated).
  const fa = (n) => 'calc(' + a2(n) + ' * var(--fp, 1))';
  const url = (s) => 'url("data:image/svg+xml,' + encodeURIComponent(s) + '")';

  // Recolour: every colour takes the tint's hue + saturation but keeps its own lightness
  // (pulled a little toward the tint's), so shading survives. Near-black stays black.
  function hexToHsl(hex){
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if(mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  }
  function hslToRgb(h, s, l){
    if(!s) return [l, l, l].map(v => Math.round(v * 255));
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const t = (x) => { x = (x + 1) % 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < .5 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
    return [t(h + 1 / 3), t(h), t(h - 1 / 3)].map(v => Math.round(v * 255));
  }
  function recolor(hex, tint){
    const [, , l] = hexToHsl(hex);
    if(l < .12) return hex;
    const [th, ts, tl] = hexToHsl(tint);
    return '#' + hslToRgb(th, ts, .6 * l + .4 * tl).map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function tintLayers(ls, tint){
    if(!tint) return ls;
    const re = /#([0-9a-f]{6})\b/gi;
    return ls.map(l => {
      let img = l.img;
      if(img.startsWith('url("data:image/svg+xml,')){
        const raw = decodeURIComponent(img.slice(24, -2)).replace(re, (m) => recolor(m, tint));
        img = url(raw);
      } else {
        img = img.replace(/rgba\((\d+),(\d+),(\d+),/g, (m, r, g, b) => {
          const c = recolor('#' + [r, g, b].map(v => (+v).toString(16).padStart(2, '0')).join(''), tint);
          const n = parseInt(c.slice(1), 16);
          return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',';
        });
      }
      return { ...l, img };
    });
  }
  function svg(w, h, body, k, extra){
    return url('<svg xmlns="' + NS + '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"' + (extra || '') + '><g opacity="' + k + '">' + body + '</g></svg>');
  }
  const L = (img, size, pos, rep) => ({ img, size: size || 'auto', pos: pos || '0 0', rep: rep || 'repeat' });
  function rng(seed){ let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  const blur = (id, sd) => '<filter id="' + id + '" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="' + sd + '"/></filter>';

  // ---- shapes ----
  const BAT = 'M0,-2 C2,-6 4,-6 5,-3 C7,-6 11,-7 14,-4 C12,-3 11,-1 11,1 C9,0 7,0 6,2 C5,1 4,1 3,3 L0,1 L-3,3 C-4,1 -5,1 -6,2 C-7,0 -9,0 -11,1 C-11,-1 -12,-3 -14,-4 C-11,-7 -7,-6 -5,-3 C-4,-6 -2,-6 0,-2 Z M-1.6,-2.4 L-2.2,-5.4 L-0.6,-3.4 L0.6,-3.4 L2.2,-5.4 L1.6,-2.4 Z';
  const GHOST = 'M0,-6 C4,-6 5,-3 5,0 L5,6 L3.3,4.6 L1.6,6 L0,4.6 L-1.6,6 L-3.3,4.6 L-5,6 L-5,0 C-5,-3 -4,-6 0,-6 Z';
  const ghostEyes = '<ellipse cx="-1.8" cy="-1.5" rx=".9" ry="1.3" fill="#0a0e14"/><ellipse cx="1.8" cy="-1.5" rx=".9" ry="1.3" fill="#0a0e14"/>';
  const PUMPKIN =
    '<path d="M-1,-8 q1,-5 4,-6" stroke="#6bbf3a" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="-5" cy="0" rx="6.5" ry="8" fill="#d9661a"/><ellipse cx="5" cy="0" rx="6.5" ry="8" fill="#d9661a"/>' +
    '<ellipse cx="0" cy="0" rx="6" ry="8.6" fill="#ff8f2e"/>' +
    '<path d="M-6,-2 l2.5,-3.2 l2.5,3.2z M1,-2 l2.5,-3.2 l2.5,3.2z M-6,2.4 l2,1.6 l2,-1.6 l2,1.6 l2,-1.6 l2,1.6 l2,-1.6 q-1,4.2 -6,4.2 q-5,0 -6,-4.2z" fill="#ffe08a"/>';
  const CANDY =
    '<path d="M0,-10 Q3,-2 7,8 Q0,11 -7,8 Q-3,-2 0,-10Z" fill="#ffc93c"/>' +
    '<path d="M0,-10 Q2.3,-3.5 5,3 Q0,4.6 -5,3 Q-2.3,-3.5 0,-10Z" fill="#ff7a1a"/>' +
    '<path d="M0,-10 Q1.3,-6 2.6,-3.5 Q0,-2.8 -2.6,-3.5 Q-1.3,-6 0,-10Z" fill="#fff6e0"/>';
  const SKULL =
    '<circle r="7" fill="#efe6d2"/><rect x="-4.6" y="3.6" width="9.2" height="5.4" rx="1.6" fill="#efe6d2"/>' +
    '<circle cx="-2.7" cy=".4" r="2" fill="#0a0a0a"/><circle cx="2.7" cy=".4" r="2" fill="#0a0a0a"/>' +
    '<path d="M0,2.6 l-1,2 h2z" fill="#0a0a0a"/><path d="M-2.4,6.2 v2.6 M0,6.2 v2.6 M2.4,6.2 v2.6" stroke="#0a0a0a" stroke-width=".7"/>';
  const BONES =
    '<g stroke="#efe6d2" stroke-width="2.6" stroke-linecap="round"><path d="M-7,-7 L7,7 M7,-7 L-7,7"/></g>' +
    '<g fill="#efe6d2"><circle cx="-8.4" cy="-6.2" r="1.9"/><circle cx="-6.2" cy="-8.4" r="1.9"/><circle cx="8.4" cy="6.2" r="1.9"/><circle cx="6.2" cy="8.4" r="1.9"/>' +
    '<circle cx="8.4" cy="-6.2" r="1.9"/><circle cx="6.2" cy="-8.4" r="1.9"/><circle cx="-8.4" cy="6.2" r="1.9"/><circle cx="-6.2" cy="8.4" r="1.9"/></g>';
  const DAMASK =
    '<path d="M0,-22 C6,-12 14,-10 12,0 C10,8 3,6 0,14 C-3,6 -10,8 -12,0 C-14,-10 -6,-12 0,-22Z M0,-12 C2,-6 5,-4 4,0 C3,3 1,3 0,6 C-1,3 -3,3 -4,0 C-5,-4 -2,-6 0,-12Z" fill="#9b6bd6" fill-rule="evenodd"/>' +
    '<path d="M0,14 C2,20 8,22 10,28 M0,14 C-2,20 -8,22 -10,28 M12,0 C18,-2 20,4 17,6 M-12,0 C-18,-2 -20,4 -17,6" stroke="#9b6bd6" stroke-width="1.4" fill="none" stroke-linecap="round"/>';
  const at = (x, y, body, s, r) => '<g transform="translate(' + x + ' ' + y + ')' + (r ? ' rotate(' + r + ')' : '') + (s ? ' scale(' + s + ')' : '') + '">' + body + '</g>';

  function webPath(R, n){
    const angs = [...Array(n)].map((_, i) => (i / (n - 1)) * Math.PI / 2);
    let d = '';
    angs.forEach(a => { d += 'M0,0 L' + f(R * Math.cos(a)) + ',' + f(R * Math.sin(a)) + ' '; });
    for(let r = R * 0.16; r < R * 0.98; r += R * 0.155){
      for(let i = 0; i < n - 1; i++){
        const a1 = angs[i], a2 = angs[i + 1], am = (a1 + a2) / 2;
        d += 'M' + f(r * Math.cos(a1)) + ',' + f(r * Math.sin(a1)) + ' Q' + f(r * .8 * Math.cos(am)) + ',' + f(r * .8 * Math.sin(am)) + ' ' + f(r * Math.cos(a2)) + ',' + f(r * Math.sin(a2)) + ' ';
      }
    }
    return d;
  }

  // ---- candidates: layers(k = strength, hex = skin colour) ----
  const CANDIDATES = [
    { key: 'none', label: 'Off', sub: "today's look: no background", group: 'off', layers: () => [] },

    { key: 'batmoon', label: 'Bat Moon', sub: 'crescent moon, bats, a few stars', group: 'halloween', skin: 'nightsister',
      layers: (k) => {
        const r = rng(7); let stars = '';
        for(let i = 0; i < 14; i++) stars += '<circle cx="' + f(r() * 160) + '" cy="' + f(r() * 120) + '" r="' + f(.4 + r() * .7) + '" fill="#fff4d6" opacity="' + f(.3 + r() * .5) + '"/>';
        const bats = at(30, 30, '<path d="' + BAT + '"/>', 1.1, -8) + at(110, 18, '<path d="' + BAT + '"/>', .7, 10) + at(80, 82, '<path d="' + BAT + '"/>', .9, -4) + at(140, 100, '<path d="' + BAT + '"/>', .55, 14);
        return [
          L(svg(120, 120, blur('g', 9) + '<mask id="m"><rect width="120" height="120" fill="#fff"/><circle cx="76" cy="48" r="34" fill="#000"/></mask>' +
            '<circle cx="60" cy="60" r="44" fill="#ffd77a" opacity=".35" filter="url(#g)"/><circle cx="60" cy="60" r="38" fill="#ffe9a8" opacity=".8" mask="url(#m)"/>', k), '110px 110px', 'right 8px top 8px', 'no-repeat'),
          L(svg(160, 120, '<g fill="#c9a7ff" opacity=".55">' + bats + '</g>', k), '160px 120px'),
          L(svg(160, 120, stars, k), '160px 120px')
        ];
      } },

    { key: 'pumpkins', label: 'Pumpkin Patch', sub: 'jack-o\'-lanterns on curly vines', group: 'halloween', skin: 'harvest',
      layers: (k) => [L(svg(96, 84,
        '<path d="M0,30 C14,22 22,40 36,34 S58,18 72,26 S90,44 96,36 M0,72 C10,80 24,64 40,72 S66,86 80,74 S94,62 96,70" stroke="#4c8a2e" stroke-width="1.4" fill="none" opacity=".7"/>' +
        '<g fill="none" stroke="#4c8a2e" stroke-width="1" opacity=".7"><path d="M36,34 c3,-6 9,-4 7,1 c-1,3 -5,2 -4,-1"/><path d="M80,74 c3,-6 9,-4 7,1 c-1,3 -5,2 -4,-1"/></g>' +
        '<g opacity=".6">' + at(22, 26, PUMPKIN, 1.1) + at(68, 66, PUMPKIN, .85) + at(90, 20, PUMPKIN, .6) + '</g>', k), '96px 84px')] },

    { key: 'webs', label: 'Spider Webs', sub: 'cobwebs in two corners + a dangling spider', group: 'halloween', skin: 'nightsister',
      layers: (k) => {
        const web = '<path d="' + webPath(130, 7) + '" stroke="#e8e6f4" stroke-width=".8" fill="none" opacity=".5"/>';
        const spider = '<line x1="16" y1="0" x2="16" y2="40" stroke="#e8e6f4" stroke-width=".6" opacity=".6"/>' +
          '<g stroke="#0d0a12" stroke-width="1.3" fill="none" stroke-linecap="round">' +
          '<path d="M13,44 l-5,-5 l-3,3 M13,46 l-7,-2 l-3,4 M13,48 l-6,2 l-2,5 M14,50 l-4,4 l0,5"/>' +
          '<path d="M19,44 l5,-5 l3,3 M19,46 l7,-2 l3,4 M19,48 l6,2 l2,5 M18,50 l4,4 l0,5"/></g>' +
          '<ellipse cx="16" cy="43" rx="3" ry="3" fill="#0d0a12"/><ellipse cx="16" cy="50" rx="4.2" ry="5.2" fill="#0d0a12"/>' +
          '<path d="M16,47 l-1.5,2.5 l1.5,2.5 l1.5,-2.5z" fill="#d22" opacity=".85"/>';
        return [
          L(svg(130, 130, web, k), '130px 130px', 'left top', 'no-repeat'),
          L(svg(130, 130, '<g transform="translate(130 130) scale(-1 -1)">' + web + '</g>', k), '130px 130px', 'right bottom', 'no-repeat'),
          L(svg(32, 64, spider, k), '32px 64px', '74% 0', 'no-repeat')
        ];
      } },

    { key: 'graveyard', label: 'Graveyard Fog', sub: 'tombstones, a dead tree, green fog', group: 'halloween', skin: 'forceghost',
      layers: (k) => [
        L(svg(400, 60, blur('b', 7) + '<g fill="#bfffd8" opacity=".32" filter="url(#b)"><ellipse cx="60" cy="38" rx="80" ry="12"/><ellipse cx="220" cy="30" rx="90" ry="10"/><ellipse cx="350" cy="40" rx="70" ry="12"/></g>', k), '400px 60px', 'left bottom 8px', 'repeat-x'),
        L(svg(320, 70,
          '<g fill="#aab9c9" opacity=".42">' +
          '<path d="M0,70 L0,60 Q40,52 80,58 T160,56 T240,59 T320,57 L320,70Z"/>' +
          '<path d="M30,60 L30,42 Q30,32 40,32 Q50,32 50,42 L50,60Z"/>' +
          '<rect x="103" y="34" width="4" height="26"/><rect x="96.5" y="41" width="17" height="4"/>' +
          '<path d="M148,59 L150,44 Q151,38 158,38 Q165,38 166,44 L168,59Z" transform="rotate(-8 158 50)"/>' +
          '<rect x="200" y="47" width="15" height="12" rx="2"/></g>' +
          '<g stroke="#aab9c9" stroke-linecap="round" fill="none" opacity=".42"><path d="M268,60 L270,40" stroke-width="4"/>' +
          '<path d="M270,40 L262,26 L256,22 M270,40 L280,24 L288,20 M266,33 L274,30 M280,24 L282,16 M262,26 L264,18" stroke-width="2"/></g>', k), '320px 70px', 'left bottom', 'repeat-x'),
        L('radial-gradient(90% 40% at 50% 100%, rgba(150,255,190,' + fa(.16 * k) + '), transparent 70%)', '100% 100%', '0 0', 'no-repeat')
      ] },

    { key: 'candycorn', label: 'Candy Corn', sub: 'scattered candy corn', group: 'halloween', skin: 'harvest',
      layers: (k) => [L(svg(64, 56, '<g opacity=".55">' + at(16, 16, CANDY, .9, -22) + at(48, 42, CANDY, .9, 18) + at(52, 10, CANDY, .55, 60) + '</g>', k), '64px 56px')] },

    { key: 'bones', label: 'Bone Yard', sub: 'skulls and crossbones', group: 'halloween', skin: 'forceghost',
      layers: (k) => [L(svg(72, 72, '<g opacity=".38">' + at(18, 18, SKULL) + at(54, 54, BONES, .8) + '</g>', k), '72px 72px')] },

    { key: 'brew', label: "Nightsister Brew", sub: 'witch-green mist, bubbles, a rune circle', group: 'halloween', skin: 'nightsister',
      layers: (k) => {
        const r = rng(3); let bub = '';
        for(let i = 0; i < 9; i++) bub += '<circle cx="' + f(r() * 80) + '" cy="' + f(r() * 130) + '" r="' + f(1.5 + r() * 4) + '"/>';
        let runes = '';
        for(let i = 0; i < 12; i++){ const a = i * 30; runes += '<path d="M0,-45 l0,-6 M-2,-48 l4,0" transform="rotate(' + a + ')"/>'; }
        return [
          L(svg(120, 120, '<g transform="translate(60 60)" stroke="#8dffb5" fill="none" opacity=".55" stroke-width="1.1">' +
            '<circle r="54"/><circle r="40"/><path d="M0,-40 L34.6,20 L-34.6,20Z M0,40 L-34.6,-20 L34.6,-20Z"/>' + runes + '</g>', k), '120px 120px', 'right 6px top 6px', 'no-repeat'),
          L(svg(80, 130, '<g stroke="#7dffa8" fill="none" stroke-width="1" opacity=".5">' + bub + '</g>', k), '80px 130px'),
          L('radial-gradient(70% 55% at 15% 100%, rgba(90,255,140,' + fa(.22 * k) + '), transparent 70%)', '100% 100%', '0 0', 'no-repeat'),
          L('radial-gradient(55% 45% at 90% 0%, rgba(160,70,255,' + fa(.2 * k) + '), transparent 70%)', '100% 100%', '0 0', 'no-repeat')
        ];
      } },

    { key: 'damask', label: 'Haunted Wallpaper', sub: 'Victorian damask with little ghosts', group: 'halloween', skin: 'forceghost',
      layers: (k) => {
        const ghost = '<path d="' + GHOST + '" fill="#f2f0ff"/>' + ghostEyes;
        return [L(svg(60, 84, '<g opacity=".38">' + at(30, 30, DAMASK, .8) + at(0, 72, DAMASK, .8) + at(60, 72, DAMASK, .8) + at(0, -12, DAMASK, .8) + at(60, -12, DAMASK, .8) + '</g>' +
          '<g opacity=".45">' + at(30, 72, ghost, .9) + at(0, 30, ghost, .9) + at(60, 30, ghost, .9) + '</g>', k), '60px 84px')];
      } },

    { key: 'ghosts', label: 'Ghost Drift', sub: 'glowing ghosts floating by', group: 'halloween', skin: 'forceghost',
      layers: (k) => {
        const g = (x, y, s, r) => at(x, y, '<path d="' + GHOST + '" fill="#cdeeff" filter="url(#gl)"/><path d="' + GHOST + '" fill="#e9f7ff" opacity=".7"/>' + ghostEyes, s, r);
        const spark = (x, y, s) => at(x, y, '<path d="M0,-4 L1,-1 L4,0 L1,1 L0,4 L-1,1 L-4,0 L-1,-1Z" fill="#dff4ff"/>', s);
        return [L(svg(180, 150, blur('gl', 2.2) + '<g opacity=".42">' + g(36, 40, 2.6, -10) + g(130, 96, 2, 8) + g(150, 22, 1.3, 4) + g(60, 124, 1.5, -6) + '</g>' +
          '<g opacity=".55">' + spark(96, 30, .9) + spark(20, 100, .7) + spark(168, 70, .6) + spark(104, 140, .8) + '</g>', k), '180px 150px')];
      } },

    { key: 'jack', label: "Jack-o'-Lantern Glow", sub: 'one big carved face glowing behind the list', group: 'halloween', skin: 'harvest',
      layers: (k) => {
        const face = '<path d="M50,42 L76,14 L94,46Z M126,46 L144,14 L170,42Z M100,62 L110,48 L120,62Z' +
          ' M36,72 Q110,128 184,72 L172,86 L160,76 L148,92 L134,82 L122,98 L110,86 L98,98 L86,82 L72,92 L60,76 L48,86Z"/>';
        return [L(svg(220, 120, blur('jg', 6) + '<g fill="#ff9a2a" opacity=".6" filter="url(#jg)">' + face + '</g><g fill="#ffcf6b" opacity=".42">' + face + '</g>', k), '78% auto', 'center', 'no-repeat'),
          L('radial-gradient(45% 35% at 50% 50%, rgba(255,150,40,' + fa(.26 * k) + '), transparent 70%)', '100% 100%', '0 0', 'no-repeat')];
      } },

    { key: 'bloodmoon', label: 'Blood Moon', sub: 'red moon, bare branches, red mist', group: 'halloween', skin: 'nightsister',
      layers: (k) => [
        L(svg(220, 100, '<g stroke="#120508" stroke-linecap="round" fill="none" opacity=".85">' +
          '<path d="M0,10 C40,14 70,24 110,22 C140,20 160,30 190,28" stroke-width="4"/>' +
          '<path d="M60,20 C70,36 66,50 78,62 M110,22 C118,10 130,6 140,4 M150,25 C160,40 172,44 184,52 M30,12 C34,24 28,36 34,48 M190,28 L214,24" stroke-width="2"/>' +
          '<path d="M78,62 L74,74 M78,62 L88,70 M140,4 L152,6 M184,52 L190,62 M34,48 L28,56" stroke-width="1.2"/></g>', k), '220px 100px', 'left top', 'no-repeat'),
        L(svg(140, 140, blur('rm', 10) + '<circle cx="70" cy="70" r="56" fill="#ff2a1a" opacity=".45" filter="url(#rm)"/><circle cx="70" cy="70" r="44" fill="#d8261c" opacity=".7"/>' +
          '<g fill="#8a1410" opacity=".55"><circle cx="56" cy="58" r="8"/><circle cx="84" cy="80" r="11"/><circle cx="78" cy="50" r="5"/><circle cx="54" cy="88" r="4"/></g>', k), '120px 120px', 'right 10px top 14px', 'no-repeat'),
        L('linear-gradient(0deg, rgba(200,20,30,' + fa(.22 * k) + '), transparent 45%)', '100% 100%', '0 0', 'no-repeat')
      ] },

    // ---- Star Wars: tinted with the border skin's colour ----
    { key: 'mesh', label: 'Durasteel Mesh', sub: 'fine dot mesh like your example', group: 'sw',
      layers: (k, hex) => [
        L(svg(4, 4, '<circle cx="2" cy="2" r=".85" fill="' + hex + '" opacity=".4"/>', k), '4px 4px'),
        L(svg(40, 40, '<path d="M0,0 V40" stroke="' + hex + '" stroke-width="1" opacity=".22"/>', k), '40px 40px')
      ] },

    { key: 'stars', label: 'Starfield', sub: 'deep space, a few twinkles', group: 'sw',
      layers: (k, hex) => {
        const r = rng(42); let s = '';
        for(let i = 0; i < 40; i++) s += '<circle cx="' + f(r() * 160) + '" cy="' + f(r() * 160) + '" r="' + f(.3 + r() * .8) + '" fill="#fff" opacity="' + f(.25 + r() * .6) + '"/>';
        s += at(40, 120, '<path d="M0,-5 L.7,-.7 L5,0 L.7,.7 L0,5 L-.7,.7 L-5,0 L-.7,-.7Z" fill="' + hex + '"/>', 1) + at(130, 34, '<path d="M0,-4 L.6,-.6 L4,0 L.6,.6 L0,4 L-.6,.6 L-4,0 L-.6,-.6Z" fill="#fff"/>', 1);
        return [L(svg(160, 160, s, k), '160px 160px')];
      } },

    { key: 'hyperspace', label: 'Hyperspace', sub: 'light streaks from the centre', group: 'sw',
      layers: (k, hex) => {
        const r = rng(11); let s = '';
        for(let i = 0; i < 80; i++){
          const a = r() * Math.PI * 2, r1 = 22 + r() * 90, len = 20 + r() * 130;
          s += '<line x1="' + f(200 + Math.cos(a) * r1) + '" y1="' + f(150 + Math.sin(a) * r1) + '" x2="' + f(200 + Math.cos(a) * (r1 + len)) + '" y2="' + f(150 + Math.sin(a) * (r1 + len)) +
            '" stroke="' + (r() < .5 ? '#ffffff' : hex) + '" stroke-width="' + f(.5 + r()) + '" opacity="' + f(.15 + r() * .4) + '" stroke-linecap="round"/>';
        }
        return [L(svg(400, 300, s, k, ' preserveAspectRatio="xMidYMid slice"'), '100% 100%', 'center', 'no-repeat')];
      } },

    { key: 'blueprint', label: 'Battle Station Blueprint', sub: 'schematic grid + a station outline', group: 'sw',
      layers: (k, hex) => {
        let ticks = '';
        for(let i = 0; i < 24; i++) ticks += '<path d="M0,-70 v-6" transform="rotate(' + (i * 15) + ')"/>';
        return [
          L(svg(180, 180, '<g transform="translate(90 90)" stroke="' + hex + '" fill="none" stroke-width="1" opacity=".45">' +
            '<circle r="70"/><path d="M-70,0 H70" stroke-width="2"/><circle cx="-26" cy="-30" r="14"/><circle cx="-26" cy="-30" r="5"/>' +
            '<path d="M-90,0 H-76 M76,0 H90 M0,-90 V-76 M0,76 V90" stroke-dasharray="3 3"/>' + ticks + '</g>', k), '170px 170px', 'right -40px center', 'no-repeat'),
          L(svg(100, 100, '<path d="M0,0 H100 M0,0 V100" stroke="' + hex + '" stroke-width="1" opacity=".22"/>', k), '100px 100px'),
          L(svg(20, 20, '<path d="M0,0 H20 M0,0 V20" stroke="' + hex + '" stroke-width=".6" opacity=".14"/>', k), '20px 20px')
        ];
      } },

    { key: 'emblems', label: 'Emblem Lattice', sub: "your border skin's emblem, tiled", group: 'sw',
      layers: (k, hex, skin) => {
        const icon = (x, y, size) => {
          const s = borderIconSvg(skin || 'rebel', size).replace(/currentColor/g, hex).replace('<svg', '<svg x="' + x + '" y="' + y + '"');
          return s;
        };
        return [L(svg(64, 64, '<g opacity=".3">' + icon(6, 6, 20) + icon(40, 38, 14) + '</g>', k), '64px 64px')];
      } },

    { key: 'twinsuns', label: 'Twin Suns', sub: 'Tatooine sunset over the dunes', group: 'sw',
      layers: (k) => [
        L(svg(220, 110, blur('ts', 7) + '<circle cx="150" cy="64" r="22" fill="#ffcf6b" opacity=".5" filter="url(#ts)"/><circle cx="150" cy="64" r="15" fill="#ffe3a0" opacity=".85"/>' +
          '<circle cx="186" cy="74" r="15" fill="#ffab5c" opacity=".45" filter="url(#ts)"/><circle cx="186" cy="74" r="10" fill="#ffc184" opacity=".85"/>', k), '220px 110px', 'right 0 bottom 22px', 'no-repeat'),
        L(svg(300, 50, '<path d="M0,50 L0,30 Q50,12 110,26 T220,22 T300,28 L300,50Z" fill="#c98a4a" opacity=".5"/><path d="M0,50 L0,40 Q70,26 150,38 T300,36 L300,50Z" fill="#a8693a" opacity=".6"/>', k), '300px 50px', 'left bottom', 'repeat-x'),
        L('linear-gradient(0deg, rgba(255,150,60,' + fa(.22 * k) + '), transparent 60%)', '100% 100%', '0 0', 'no-repeat')
      ] },

    { key: 'targeting', label: 'Targeting Computer', sub: 'the trench-run display', group: 'sw',
      layers: (k) => {
        const c = '#ffb02e'; let s = '';
        // Rings 1.5x apart, so zooming 150% lands each ring on the next: a seamless fly-down-the-trench loop.
        [.088, .132, .198, .296, .444, .667, 1].forEach(z => { s += '<rect x="' + f(200 - 200 * z) + '" y="' + f(150 - 150 * z) + '" width="' + f(400 * z) + '" height="' + f(300 * z) + '"/>'; });
        [[0, 0], [400, 0], [0, 300], [400, 300], [120, 300], [280, 300]].forEach(([x, y]) => { s += '<path d="M200,150 L' + x + ',' + y + '"/>'; });
        return [
          L(svg(400, 300, '<g stroke="' + c + '" fill="none" stroke-width="1.5" opacity=".75"><circle cx="200" cy="150" r="14"/><path d="M200,126 v12 M200,162 v12 M176,150 h12 M212,150 h12"/></g>', k, ' preserveAspectRatio="none"'), '100% 100%', '0 0', 'no-repeat'),
          L(svg(400, 300, '<g stroke="' + c + '" fill="none" stroke-width="1" opacity=".45" vector-effect="non-scaling-stroke">' + s + '</g>', k, ' preserveAspectRatio="none"'), '100% 100%', 'center', 'no-repeat')
        ];
      } },

    { key: 'sabers', label: 'Lightsaber Duel', sub: 'two blades crossing behind the list', group: 'sw',
      layers: (k) => {
        const blade = (x1, y1, x2, y2, col) => {
          const ln = (w, c, o, extra) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + c + '" stroke-width="' + w + '" opacity="' + o + '" stroke-linecap="round"' + (extra || '') + '/>';
          return ln(11, col, .5, ' filter="url(#sg)"') + ln(4, col, .9) + ln(1.6, '#ffffff', .95);
        };
        const hilt = (x1, y1, x2, y2) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#9aa3ad" stroke-width="5" stroke-linecap="round" opacity=".8"/>';
        return [L(svg(240, 160, blur('sg', 4) + '<g opacity=".55">' + hilt(26, 154, 40, 140) + blade(40, 140, 190, 20, '#4fb8ff') + hilt(214, 154, 200, 140) + blade(200, 140, 50, 20, '#ff3b3b') +
          '<circle cx="120" cy="76" r="9" fill="#fff6d0" filter="url(#sg)"/></g>', k), '82% auto', 'center', 'no-repeat'),
          L('radial-gradient(16% 20% at 50% 48%, rgba(255,246,208,' + fa(.4 * k) + '), transparent 70%)', '100% 100%', '0 0', 'no-repeat')];
      } },

    { key: 'holocron', label: 'Holocron Lattice', sub: 'glowing cube pattern', group: 'sw',
      layers: (k, hex) => {
        const cube = '<path d="M17.32,0 L34.64,10 L17.32,20 L0,10Z" fill="' + hex + '" opacity=".32"/><path d="M0,10 L17.32,20 L17.32,40 L0,30Z" fill="' + hex + '" opacity=".16"/>' +
          '<path d="M17.32,20 L34.64,10 L34.64,30 L17.32,40Z" fill="' + hex + '" opacity=".05"/>' +
          '<path d="M17.32,0 L34.64,10 L34.64,30 L17.32,40 L0,30 L0,10Z M0,10 L17.32,20 L34.64,10 M17.32,20 V40" stroke="' + hex + '" stroke-width=".6" fill="none" opacity=".5"/>';
        return [L(svg(34.64, 60, '<g opacity=".55">' + at(0, 0, cube) + at(-17.32, 30, cube) + at(17.32, 30, cube) + at(-17.32, -30, cube) + at(17.32, -30, cube) + at(0, 60, cube) + '</g>', k), '34.64px 60px')];
      } },

    { key: 'kyber', label: 'Kyber Crystals', sub: 'scattered glowing crystals', group: 'sw',
      layers: (k) => {
        const shape = '<path d="M0,-12 L4,-6 L4,8 L0,12 L-4,8 L-4,-6Z"/>';
        const cr = (x, y, s, r, col) => at(x, y, '<g fill="' + col + '"><g opacity=".55" filter="url(#kg)">' + shape + '</g><g opacity=".75">' + shape + '</g></g>' +
          '<path d="M0,-12 L0,12 M-4,-6 L0,-3 L4,-6" stroke="#ffffff" stroke-width=".6" fill="none" opacity=".6"/>', s, r);
        return [L(svg(110, 100, blur('kg', 3) + '<g opacity=".6">' + cr(20, 24, 1, -20, '#50c878') + cr(76, 18, .7, 25, '#6ad3ff') + cr(56, 70, 1.1, 10, '#50c878') +
          cr(98, 80, .6, -35, '#ff5a5a') + cr(16, 82, .65, 30, '#b07cff') + '</g>', k), '110px 100px')];
      } },

    { key: 'beskar', label: 'Beskar Plate', sub: 'brushed steel plates and rivets', group: 'sw',
      layers: (k) => [
        L('linear-gradient(115deg, transparent 30%, rgba(230,240,250,' + a2(.14 * k) + ') 45%, transparent 60%)', '300% 100%', '35% 0', 'no-repeat'),
        L(svg(120, 80, '<g stroke="#dfe7ee" fill="none" opacity=".35"><path d="M0,0 H120 M0,0 V80" stroke-width="1.4"/><path d="M60,0 V80" stroke-width=".6" opacity=".6"/></g>' +
          '<g fill="#dfe7ee" opacity=".5"><circle cx="6" cy="6" r="1.6"/><circle cx="114" cy="6" r="1.6"/><circle cx="6" cy="74" r="1.6"/><circle cx="114" cy="74" r="1.6"/><circle cx="54" cy="6" r="1.2"/><circle cx="66" cy="74" r="1.2"/></g>', k), '120px 80px'),
        L(svg(6, 3, '<rect width="6" height="1" fill="#cfd8e0" opacity=".14"/>', k), '6px 3px')
      ] },

    { key: 'carbonite', label: 'Carbonite', sub: 'frozen panel blocks + control lights', group: 'sw',
      layers: (k) => [
        L(svg(24, 90, '<g opacity=".85"><rect x="8" y="10" width="8" height="5" rx="1" fill="#ff4040"/><rect x="8" y="22" width="8" height="5" rx="1" fill="#5dff6e"/><rect x="8" y="34" width="8" height="5" rx="1" fill="#4fb8ff"/>' +
          '<rect x="8" y="46" width="8" height="5" rx="1" fill="#5dff6e"/><rect x="8" y="58" width="8" height="5" rx="1" fill="#ffd84a"/></g>', k), '24px 90px', 'right 4px top 40px', 'no-repeat'),
        L(svg(90, 90, '<g fill="none" stroke="#a7b4c2" opacity=".42"><rect x="4" y="4" width="38" height="24" rx="3"/><rect x="48" y="4" width="38" height="50" rx="3"/><rect x="4" y="34" width="38" height="52" rx="3"/><rect x="48" y="60" width="38" height="26" rx="3"/></g>' +
          '<g fill="#a7b4c2" opacity=".14"><rect x="6" y="6" width="34" height="20" rx="2"/><rect x="50" y="62" width="34" height="22" rx="2"/></g>', k), '90px 90px')
      ] },

    { key: 'nebula', label: 'Nebula', sub: 'purple, pink and blue space clouds + stars', group: 'sw',
      layers: (k) => {
        const r = rng(5); let s = '';
        for(let i = 0; i < 30; i++) s += '<circle cx="' + f(r() * 160) + '" cy="' + f(r() * 160) + '" r="' + f(.3 + r() * .7) + '" fill="#fff" opacity="' + f(.3 + r() * .6) + '"/>';
        return [
          L(svg(160, 160, s, k), '160px 160px'),
          L('radial-gradient(60% 50% at 25% 30%, rgba(122,77,255,' + fa(.32 * k) + '), transparent 70%)', '100% 100%', '0 0', 'no-repeat'),
          L('radial-gradient(50% 45% at 75% 72%, rgba(255,79,163,' + fa(.26 * k) + '), transparent 70%)', '100% 100%', '0 0', 'no-repeat'),
          L('radial-gradient(40% 35% at 72% 18%, rgba(63,184,255,' + fa(.22 * k) + '), transparent 70%)', '100% 100%', '0 0', 'no-repeat')
        ];
      } },

    { key: 'ties', label: 'TIE Squadron', sub: 'TIE fighters and laser bolts', group: 'sw',
      layers: (k) => {
        const tie = '<g fill="#c7d0d8"><path d="M-13,-14 L-10,-11 L-10,11 L-13,14 L-16,11 L-16,-11Z M13,-14 L10,-11 L10,11 L13,14 L16,11 L16,-11Z"/><rect x="-10" y="-1.2" width="20" height="2.4"/><circle r="5"/></g><circle r="2.4" fill="#141a20"/>';
        const bolt = (x, y, col) => '<line x1="' + x + '" y1="' + y + '" x2="' + (x + 12) + '" y2="' + (y - 3) + '" stroke="' + col + '" stroke-width="1.6" stroke-linecap="round"/>';
        return [L(svg(160, 120, '<g opacity=".42">' + at(30, 30, tie, 1, -6) + at(118, 50, tie, .7, 8) + at(70, 96, tie, .85, -2) + '</g>' +
          '<g opacity=".7">' + bolt(48, 22, '#5dff6e') + bolt(52, 30, '#5dff6e') + bolt(128, 44, '#5dff6e') + bolt(16, 80, '#ff4040') + bolt(140, 100, '#ff4040') + '</g>', k), '160px 120px')];
      } },

    { key: 'droids', label: 'Droid Schematics', sub: 'astromech blueprints and gears', group: 'sw',
      layers: (k, hex) => {
        const droid = '<path d="M-12,-8 A12,12 0 0 1 12,-8 Z M-12,-8 H12 V16 H-12Z M-12,-4 L-17,-2 L-17,20 L-12,22 M12,-4 L17,-2 L17,20 L12,22 M-19,20 h6 M13,20 h6 M-6,0 h12 M-6,5 h12 M-6,10 h5"/><circle cx="-3" cy="-13" r="2.6"/>';
        const gear = (x, y, r) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" stroke-width="3" stroke-dasharray="2.4 2.4"/><circle cx="' + x + '" cy="' + y + '" r="' + f(r * .55) + '"/>';
        return [L(svg(90, 100, '<g stroke="' + hex + '" fill="none" stroke-width="1" opacity=".45">' + at(30, 40, droid) + gear(72, 80, 8) + gear(76, 18, 5) + gear(16, 88, 4) + '</g>', k), '90px 100px')];
      } },

    { key: 'jawas', label: 'Jawa Eyes', sub: 'glowing eyes watching from the dark', group: 'sw',
      layers: (k) => {
        const eyes = (x, y, s, open) => at(x, y, '<g fill="#ffd84a"><g opacity=".7" filter="url(#je)"><ellipse cx="-4.4" rx="2.8" ry="' + (open ? 2 : .6) + '"/><ellipse cx="4.4" rx="2.8" ry="' + (open ? 2 : .6) + '"/></g>' +
          '<ellipse cx="-4.4" rx="2" ry="' + (open ? 1.4 : .4) + '"/><ellipse cx="4.4" rx="2" ry="' + (open ? 1.4 : .4) + '"/></g>', s);
        return [L(svg(140, 110, blur('je', 2.2) + '<g opacity=".6">' + eyes(24, 22, 1, true) + eyes(96, 36, .8, true) + eyes(60, 80, 1.1, true) + eyes(124, 94, .7, false) + eyes(14, 70, .6, true) + '</g>', k), '140px 110px')];
      } },

    { key: 'hoth', label: 'Hoth Snowfall', sub: 'snowflakes and ice ridges', group: 'sw',
      layers: (k) => {
        const flake = (x, y, s) => {
          let d = '';
          for(let i = 0; i < 6; i++) d += '<g transform="rotate(' + (i * 60) + ')"><path d="M0,0 V-8 M0,-5 l-2,-2 M0,-5 l2,-2"/></g>';
          return at(x, y, '<g stroke="#e6f4ff" stroke-width=".8" stroke-linecap="round" fill="none">' + d + '</g>', s);
        };
        const r = rng(9); let dots = '';
        for(let i = 0; i < 16; i++) dots += '<circle cx="' + f(r() * 120) + '" cy="' + f(r() * 120) + '" r="' + f(.6 + r() * 1.1) + '" fill="#e6f4ff" opacity="' + f(.3 + r() * .5) + '"/>';
        return [
          L(svg(200, 40, '<path d="M0,40 L0,22 L30,8 L60,22 L95,4 L130,24 L160,12 L200,26 L200,40Z" fill="#e6f4ff" opacity=".28"/><path d="M30,8 L38,22 M95,4 L100,20 M160,12 L166,24" stroke="#ffffff" stroke-width=".8" opacity=".4"/>', k), '200px 40px', 'left bottom', 'repeat-x'),
          L(svg(120, 120, '<g opacity=".5">' + flake(24, 26, 1) + flake(88, 60, .7) + flake(40, 98, .55) + flake(104, 12, .45) + '</g>' + dots, k), '120px 120px'),
          L('linear-gradient(0deg, rgba(170,215,255,' + fa(.16 * k) + '), transparent 55%)', '100% 100%', '0 0', 'no-repeat')
        ];
      } },

    { key: 'holomap', label: 'Holo-Map', sub: 'planet, orbits and a plotted route', group: 'sw',
      layers: (k, hex) => [L(svg(200, 160, '<g stroke="' + hex + '" fill="none" opacity=".55">' +
        '<circle cx="120" cy="70" r="26" fill="' + hex + '" fill-opacity=".14"/><path d="M96,64 Q120,58 144,64 M98,80 Q120,86 142,80" opacity=".6"/>' +
        '<ellipse cx="120" cy="70" rx="64" ry="18" transform="rotate(-14 120 70)" stroke-dasharray="4 3"/>' +
        '<circle cx="62" cy="86" r="4" fill="' + hex + '"/><circle cx="30" cy="136" r="7"/><circle cx="30" cy="136" r="2" fill="' + hex + '"/>' +
        '<path d="M36,130 Q70,120 92,94" stroke-dasharray="1.5 3" stroke-width="1.4"/>' +
        '<path d="M86,36 h-6 v6 M154,36 h6 v6 M86,104 h-6 v-6 M154,104 h6 v-6"/></g>', k), '200px 160px', 'right 4px center', 'no-repeat')] },

    { key: 'readout', label: 'Data Readout', sub: 'rows of glyph code, like a ship computer', group: 'sw',
      layers: (k, hex) => {
        const r = rng(21); let d = '';
        const SEG = ['M0,0 h6', 'M0,8 h6', 'M0,4 h6', 'M0,0 v8', 'M6,0 v8', 'M0,0 L6,8', 'M6,0 L0,8', 'M3,0 v8'];
        [6, 22, 38, 54].forEach(y => {
          let x = 4;
          while(x < 112){
            if(r() < .18){ x += 8; continue; }
            const n = 2 + Math.floor(r() * 2);
            for(let i = 0; i < n; i++) d += '<path d="' + SEG[Math.floor(r() * SEG.length)] + '" transform="translate(' + x + ' ' + y + ')"/>';
            x += 9;
          }
        });
        return [L(svg(120, 64, '<g stroke="' + hex + '" stroke-width="1" fill="none" stroke-linecap="square" opacity=".42">' + d + '</g>', k), '120px 64px')];
      } }
  ];

  // ---- motion: per layer index. loop = position (or size) reached at 100%, then it jumps back
  // seamlessly (a whole number of tiles); bob = reached at 50%, back at 100%.
  // pulse = the glow/mist layers (fa() alphas) breathe or flicker. ----
  const ANIMS = {
    batmoon:   { dur: 30, loop: { 1: '-320px 0' }, bob: { 0: 'right 8px top 2px' }, note: 'bats fly past, the moon floats' },
    pumpkins:  { dur: 40, loop: { 0: '-96px 0' }, note: 'the patch slowly scrolls' },
    webs:      { dur: 6, bob: { 2: '74% 16px' }, note: 'the spider drops and climbs back' },
    graveyard: { dur: 24, loop: { 0: 'left 400px bottom 8px' }, pulse: 'breathe', note: 'the fog rolls, the glow breathes' },
    candycorn: { dur: 20, loop: { 0: '0 112px' }, note: 'candy corn falls' },
    bones:     { dur: 40, loop: { 0: '72px 72px' }, note: 'slow diagonal drift' },
    brew:      { dur: 12, loop: { 1: '0 -260px' }, bob: { 0: 'right 6px top 0px' }, pulse: 'breathe', note: 'bubbles rise, the mist breathes' },
    damask:    { dur: 40, loop: { 0: '0 -84px' }, note: 'the wallpaper ghosts float up' },
    ghosts:    { dur: 30, loop: { 0: '180px -150px' }, note: 'ghosts drift by' },
    jack:      { dur: 20, pulse: 'flicker', note: 'the candle glow flickers' },
    bloodmoon: { dur: 16, bob: { 1: 'right 10px top 8px' }, pulse: 'breathe', note: 'the moon floats, the mist breathes' },
    mesh:      { dur: 6, loop: { 1: '40px 0' }, note: 'scan lines slide' },
    stars:     { dur: 40, loop: { 0: '-160px 0' }, note: 'flying through space' },
    hyperspace:{ dur: 4, sizeBob: { 0: '130% 130%' }, note: 'the streaks surge and settle' },
    blueprint: { dur: 30, loop: { 1: '100px 100px', 2: '100px 100px' }, note: 'the grid pans' },
    emblems:   { dur: 40, loop: { 0: '64px 64px' }, note: 'slow diagonal drift' },
    twinsuns:  { dur: 20, bob: { 0: 'right 0 bottom 12px' }, pulse: 'breathe', note: 'the suns dip, the heat haze breathes' },
    targeting: { dur: 2.4, sizeLoop: { 1: '150% 150%' }, note: 'flying down the trench' },
    sabers:    { dur: 20, pulse: 'flicker', note: 'the clash flickers' },
    holocron:  { dur: 30, loop: { 0: '0 60px' }, note: 'the cubes slide' },
    kyber:     { dur: 30, loop: { 0: '0 -100px' }, note: 'crystals float up' },
    beskar:    { dur: 7, loop: { 0: '-50% 0' }, from: { 0: '150% 0' }, note: 'a glint runs across the steel' },
    nebula:    { dur: 40, loop: { 0: '-160px 0' }, pulse: 'breathe', note: 'stars drift, the clouds breathe' },
    ties:      { dur: 16, loop: { 0: '320px 0' }, note: 'TIEs fly across' },
    droids:    { dur: 40, loop: { 0: '-90px 0' }, note: 'the blueprints scroll' },
    jawas:     { dur: 10, bob: { 0: '6px 3px' }, note: 'the eyes shift' },
    hoth:      { dur: 16, loop: { 1: '120px 240px' }, pulse: 'breathe', note: 'snow falls' },
    holomap:   { dur: 8, bob: { 0: 'right 4px top calc(50% - 6px)' }, note: 'the hologram bobs' },
    readout:   { dur: 10, loop: { 0: '0 -128px' }, note: 'the code scrolls' }
  };
  CANDIDATES.forEach(c => { c.anim = ANIMS[c.key] || null; });

  const halfPx = (v) => v.replace(/(-?\d+(?:\.\d+)?)px/g, (m, n) => (n / 2) + 'px');
  // One keyframes rule moving every layer at once. extraPos/extraSize = trailing non-pattern layers (the HUD's highlight).
  function motionCss(name, sel, ls, a, speed, light, extraPos, extraSize){
    if(!a) return '';
    const dur = a.dur * speed;
    const moves = a.loop || a.bob || a.sizeLoop || a.sizeBob;
    let css = '';
    const anims = [];
    if(moves){
      const hasMid = !!(a.bob || a.sizeBob);
      const frame = (pct) => {
        const pos = ls.map((l, i) => {
          if(pct === 0) return (a.from && a.from[i]) || l.pos;
          if(pct === 50){ if(a.bob && a.bob[i]) return a.bob[i]; if(a.loop && a.loop[i]) return halfPx(a.loop[i]); return (a.from && a.from[i]) || l.pos; }
          return (a.loop && a.loop[i]) || (a.from && a.from[i]) || l.pos;
        });
        const size = ls.map((l, i) => {
          if(pct === 50 && a.sizeBob && a.sizeBob[i]) return a.sizeBob[i];
          if(pct === 100 && a.sizeLoop && a.sizeLoop[i]) return a.sizeLoop[i];
          return l.size;
        });
        return pct + '%{background-position:' + pos.join(',') + (extraPos || '') + ';background-size:' + size.join(',') + (extraSize || '') + '}';
      };
      css += '@keyframes ' + name + '{' + frame(0) + (hasMid ? frame(50) : '') + frame(100) + '}';
      const steps = Math.max(2, Math.round(dur * 15 / (hasMid ? 2 : 1)));
      anims.push(name + ' ' + dur + 's ' + (light ? 'steps(' + steps + ')' : 'linear') + ' infinite');
    }
    if(a.pulse === 'breathe') anims.push('fdtBreathe ' + (3.4 * speed) + 's ease-in-out infinite alternate');
    if(a.pulse === 'flicker') anims.push('fdtFlicker ' + (2.6 * speed) + 's linear infinite');
    if(!anims.length) return css;
    return css + sel + '{animation:' + anims.join(',') + '!important}';
  }
  const PULSE_CSS = '@property --fp{syntax:"<number>";inherits:false;initial-value:1}' +
    '@keyframes fdtBreathe{from{--fp:1}to{--fp:.45}}' +
    '@keyframes fdtFlicker{0%{--fp:1}8%{--fp:.6}11%{--fp:1}38%{--fp:.85}41%{--fp:1}64%{--fp:.5}67%{--fp:.95}88%{--fp:.75}100%{--fp:1}}';

  // ---- what the app uses ----
  const byKey = {};
  CANDIDATES.forEach(c => { byKey[c.key] = c; });
  const skinHex = (skin) => ((skin && BORDER_SKINS[skin]) || {}).hex || '#8fd6ff';
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

  /** The drawn layers for background `key` under a theme (strength + colour), on an overlay with border skin `skin`. */
  function layersFor(key, theme, skin){
    const c = byKey[key];
    if(!c) return [];
    const t = theme || {};
    const custom = isHex(t.themeBgColor) ? t.themeBgColor : null;
    const sh = skinHex(skin);
    const tint = t.themeBgColor === 'border' ? sh : custom;
    return tintLayers(c.layers(num(t.themeBgStrength, 0.75), custom || sh, skin), tint);
  }
  const join = (ls, p) => ls.map(l => l[p]).join(',');
  // The panels each overlay draws its backdrop on: list cards, the HUD's level blocks + READY strip,
  // the timers' banners, the Spawn Alert. Fixed attachment = one continuous picture across the HUD's blocks.
  // The HUD's blocks and the timers' banners keep their own corner glow as an extra last layer.
  const HUD_HI = 'radial-gradient(140% 160% at 0% 0%, rgba(255,255,255,0.05), transparent 60%)';
  const HUD_HI_CUR = 'radial-gradient(140% 160% at 0% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%)';
  const BANNER_HI = 'radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent-color, #9aa39d) 22%, transparent), transparent 60%)';
  function panelRules(sel, img, size, pos, rep, att, extra){
    const x = extra ? ',' + extra : '', xs = extra ? ',auto' : '', xp = extra ? ',0 0' : '', xr = extra ? ',no-repeat' : '', xa = extra ? ',scroll' : '';
    const doubled = sel.split(',').map(s => 'html ' + s + s).join(',');
    return sel + '{background-image:' + img + x + '!important;background-repeat:' + rep + xr + '!important;background-attachment:' + att + xa + '!important}' +
      doubled + '{background-size:' + size + xs + ';background-position:' + pos + xp + '}';
  }

  /** The page CSS for a theme's background ('' = none). opts: { light: 15 fps motion, motion: false = never animate }. */
  function css(theme, skin, opts){
    const key = theme && theme.themeBg;
    if(!key || key === 'none' || !byKey[key]) return '';
    const ls = layersFor(key, theme, skin);
    if(!ls.length) return '';
    const img = join(ls, 'img'), size = join(ls, 'size'), pos = join(ls, 'pos'), rep = join(ls, 'rep');
    const att = ls.map(() => 'fixed').join(',');
    // size/position are NOT !important (that would freeze the motion); doubled classes out-rank the pages' own rules.
    // The HUD's fade-in (fdt-in, fill "both") would leave transform:translateY(0) on each block, and any
    // transform turns a fixed background into one copy per block; fill "backwards" leaves none once it ends.
    let out = panelRules('.card,.ready-strip,.alert', img, size, pos, rep, att) +
      panelRules('.block', img, size, pos, rep, att, HUD_HI) +
      '.block,.ready-strip{animation-fill-mode:backwards!important}' +
      '.block.current{background-image:' + img + ',' + HUD_HI_CUR + '!important}' +
      panelRules('.banner', img, size, pos, rep, att, BANNER_HI);
    if(theme.themeBgMotion === true && !(opts && opts.motion === false)){
      const a = byKey[key].anim, speed = num(theme.themeBgSpeed, 1), light = !!(opts && opts.light);
      // The Spawn Alert keeps its pop-in, so its picture stays still; the HUD keeps its fade-in;
      // a timer about to fire keeps its pulse (and stands still for those last seconds).
      const moving = motionCss('ovBgMoveC', '.card,.ready-strip', ls, a, speed, light) +
        motionCss('ovBgMoveB', '.block', ls, a, speed, light, ',0 0', ',auto').replace('.block{animation:', '.block{animation:fdt-in .22s ease-out backwards,') +
        motionCss('ovBgMoveT', '.banner', ls, a, speed, light, ',0 0', ',auto');
      if(moving) out += PULSE_CSS + '@media (prefers-reduced-motion:no-preference){' + moving +
        '.banner.imminent{animation:pulse-glow 1s ease-in-out infinite!important}}';
    }
    return out;
  }

  /** Inline style for a still preview tile of background `key`. */
  function preview(key, theme, skin){
    const ls = layersFor(key, theme, skin);
    return { backgroundImage: ls.length ? join(ls, 'img') : 'none', backgroundSize: join(ls, 'size'),
      backgroundPosition: join(ls, 'pos'), backgroundRepeat: join(ls, 'rep') };
  }

  return { list: CANDIDATES, byKey, layersFor, css, preview };
})();

/** Puts (or clears) the panel background on this page. theme = effectiveTheme(settings, overlay name). */
function applyOverlayBackground(theme, skinKey, opts){
  const text = OVERLAY_BG.css(theme, skinKey, opts);
  let st = document.head.querySelector('style[data-ov-bg]');
  if(!st){
    if(!text) return;
    st = document.createElement('style');
    st.setAttribute('data-ov-bg', '');
    document.head.appendChild(st);
  }
  if(st.textContent !== text) st.textContent = text;
}
