'use strict';
/* ---------------------------------------------------------------------------
   alert-sound.js — every timer alert sound, for timers.html (on expiry) and
   tracker.html (the ▶ preview buttons), so both sound the same. Needs
   sounds/good-news-data.js loaded first.

   playAlert(choice, volume, readCustom) plays one alert:
     'beep' | 'boop' | 'chime'  — three short sine tones (v1.10.2)
     'goodnews'                 — the built-in clip (v1.11.1)
     'custom:<id>'              — a player's own file (v1.13.0): readCustom(id)
                                  resolves to its base64 bytes (main.js 'sound:read')
   Clips are auto-levelled: the loud part of any clip is brought to the same level
   the tones have at the same volume setting (measured once per clip), then
   scaled by volume like the tones, then limited so the top of the slider can't
   clip. Tuned on the Good news clip: within ~1 dB of the tones up to the default
   35%, gentler above. A clip longer than MAX_CLIP_S fades out there. Decoded from
   bytes so Web Audio never loads a file:// URL (which may count as cross-origin
   and play silence). Returns a promise; never throws synchronously.
--------------------------------------------------------------------------- */
function playAlert(choice, volume, readCustom){
  const st = playAlert;
  const MAX_CLIP_S = 8;
  const LEVEL_RMS = 0.245; // a clip's loud part before the compressor (Good news: ~0.0306 x 8)
  try{
    if(!choice || choice === 'off' || !(volume > 0)) return Promise.resolve();
    if(!st.ctx){
      st.ctx = new (window.AudioContext || window.webkitAudioContext)();
      st.clips = {}; // choice -> Promise<{buffer, boost}>
    }
    const ctx = st.ctx;
    if(ctx.state === 'suspended') ctx.resume();

    const TONES = { beep: [800, 0.3], boop: [400, 0.3], chime: [900, 0.4] };
    if(TONES[choice]){
      const [freq, dur] = TONES[choice];
      for(let i = 0; i < 3; i++){
        const t = ctx.currentTime + i * 0.5;
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.value = Math.min(0.8, volume);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur);
      }
      return Promise.resolve();
    }

    if(!st.clips[choice]){
      let bytes;
      if(choice === 'goodnews') bytes = Promise.resolve(GOOD_NEWS_MP3_B64);
      else if(choice.startsWith('custom:') && readCustom) bytes = Promise.resolve(readCustom(choice.slice(7)));
      else return Promise.resolve();
      st.clips[choice] = bytes.then(b64 => {
        if(!b64) throw new Error('sound file missing');
        const buf = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)).buffer;
        return ctx.decodeAudioData(buf);
      }).then(buffer => ({ buffer, boost: levelBoost(buffer) }));
      st.clips[choice].catch(() => { delete st.clips[choice]; }); // a bad file is retried next time, not cached
    }
    return st.clips[choice].then(({ buffer, boost }) => {
      const t0 = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const pre = ctx.createGain(); pre.gain.value = boost;
      const vol = ctx.createGain(); vol.gain.value = volume / 0.35; // 1 at the default volume
      const fade = ctx.createGain();
      if(buffer.duration > MAX_CLIP_S){
        fade.gain.setValueAtTime(1, t0 + MAX_CLIP_S - 0.4);
        fade.gain.linearRampToValueAtTime(0, t0 + MAX_CLIP_S);
        src.stop(t0 + MAX_CLIP_S);
      }
      src.connect(pre);
      pre.connect(compressor(ctx, -10, 3)).connect(vol).connect(fade);
      fade.connect(compressor(ctx, -3, 0)).connect(ctx.destination);
      src.start(t0);
    });
  }catch(e){
    return Promise.reject(e);
  }

  function compressor(c, threshold, knee){
    const n = c.createDynamicsCompressor();
    n.threshold.value = threshold; n.knee.value = knee; n.ratio.value = 20;
    n.attack.value = 0.001; n.release.value = 0.15;
    return n;
  }
  // Gain that brings the clip's loud part (50 ms windows within 20 dB of its
  // loudest) to LEVEL_RMS. Clamped so near-silence isn't blown up.
  function levelBoost(buffer){
    // only the part that plays (a long song costs no more to measure than a short clip)
    const n = Math.min(buffer.length, Math.round(buffer.sampleRate * MAX_CLIP_S));
    const chs = buffer.numberOfChannels, win = Math.max(1, Math.round(buffer.sampleRate * 0.05));
    const data = []; for(let c = 0; c < chs; c++) data.push(buffer.getChannelData(c));
    const rms = [];
    for(let i = 0; i + win <= n; i += win){
      let s = 0;
      for(let j = i; j < i + win; j++){ let v = 0; for(let c = 0; c < chs; c++) v += data[c][j]; v /= chs; s += v * v; }
      rms.push(Math.sqrt(s / win));
    }
    const loudest = Math.max(0, ...rms);
    const loud = rms.filter(r => r >= loudest * 0.1);
    const level = loud.length ? Math.sqrt(loud.reduce((a, r) => a + r * r, 0) / loud.length) : 0;
    return level > 0 ? Math.min(16, Math.max(0.2, LEVEL_RMS / level)) : 1;
  }
}
