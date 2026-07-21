/*
 * Bollino Scan Autofill — content script
 *
 * Human-in-the-loop only. When you scan a pack barcode, this reads the
 * Identification Number out of the code and fills the AIC + ID fields on the
 * VerificaFustella form, then clears/focuses the CAPTCHA field. It never
 * solves the CAPTCHA and never submits the form.
 *
 * The panel ALWAYS appears so you can see what it detected and fix it if the
 * auto-detection is wrong.
 */
(function () {
  'use strict';

  const LS = {
    g(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    s(k, v) { try { localStorage.setItem(k, v); } catch {} },
    get aic()    { return this.g('bsa_aic', '028489021'); }, set aic(v)    { this.s('bsa_aic', v); },
    get sig()    { return this.g('bsa_sig', 'V5F9X'); },     set sig(v)    { this.s('bsa_sig', v); },
    get selAic() { return this.g('bsa_selAic', ''); },       set selAic(v) { this.s('bsa_selAic', v); },
    get selId()  { return this.g('bsa_selId', ''); },        set selId(v)  { this.s('bsa_selId', v); }
  };

  let count = 0;
  let panel, statusEl, countEl, detectEl;

  /* ---------- field detection ---------- */

  function isVisible(el) {
    if (!el || el.type === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return el.offsetParent !== null && r.width > 0 && r.height > 0;
  }

  function labelTextFor(el) {
    let t = '';
    if (el.labels && el.labels.length) t += [...el.labels].map(l => l.textContent).join(' ');
    t += ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.placeholder || '') +
         ' ' + (el.name || '') + ' ' + (el.id || '');
    const row = el.closest('tr, .form-group, .row, div');
    if (row) t += ' ' + row.textContent;
    return t.toLowerCase();
  }

  function describe(el) {
    if (!el) return '(none)';
    return el.tagName.toLowerCase() +
      (el.id ? '#' + el.id : '') +
      (el.name ? ' name=' + el.name : '') +
      (el.placeholder ? ' ph="' + el.placeholder + '"' : '');
  }

  function findFields() {
    const mAic = LS.selAic ? document.querySelector(LS.selAic) : null;
    const mId  = LS.selId ? document.querySelector(LS.selId) : null;

    const inputs = [...document.querySelectorAll('input')].filter(isVisible);
    const captcha = inputs.find(i =>
      i !== mAic && i !== mId &&
      (/captcha/i.test(i.placeholder || '') || /captcha|verific/i.test(i.id || '')));
    const textish = inputs.filter(i =>
      i !== captcha && /^(text|number|tel|search|)$/i.test(i.type || ''));

    let aic = mAic, id = mId;
    if (!aic) aic = textish.find(i => /\baic\b/i.test(labelTextFor(i)));
    if (!id)  id  = textish.find(i => i !== aic && /identif|identificativo|identification/i.test(labelTextFor(i)));

    const rest = textish.filter(i => i !== aic && i !== id && i !== captcha);
    if (!aic) aic = rest.shift();
    if (!id)  id  = rest.shift();

    return { aic, id, captcha, allInputs: inputs };
  }

  function flash(el, color) {
    if (!el) return;
    const prev = el.style.outline;
    el.style.outline = '3px solid ' + color;
    el.style.outlineOffset = '1px';
    setTimeout(() => { el.style.outline = prev; }, 2500);
  }

  function detectAndShow() {
    const f = findFields();
    console.log('[Bollino Scan Autofill] detected fields:',
      { AIC: describe(f.aic), ID: describe(f.id), CAPTCHA: describe(f.captcha) },
      '| all visible inputs:', f.allInputs.map(describe));
    flash(f.aic, '#1666b8'); flash(f.id, '#137a3a'); flash(f.captcha, '#a86500');
    if (detectEl) {
      detectEl.innerHTML =
        'AIC → <b>' + describe(f.aic) + '</b><br>' +
        'ID → <b>' + describe(f.id) + '</b><br>' +
        'CAPTCHA → <b>' + describe(f.captcha) + '</b>';
    }
    if (!f.id) setStatus('✕ Could not find the ID field. Open Settings and set the ID field selector.', 'bad');
    else setStatus('Detected the fields (highlighted on the page). Scan a pack, or press "Test fill".', 'ok');
    return f;
  }

  /* ---------- value setting that frameworks notice ---------- */

  function setValue(el, value) {
    if (!el) return;
    el.focus();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    ['input', 'change', 'keydown', 'keyup', 'blur'].forEach(type =>
      el.dispatchEvent(new Event(type, { bubbles: true })));
  }

  /* ---------- parse + fill ---------- */

  function parse(raw) {
    const s = (raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!s) return { skip: true };
    const id = s.slice(0, 9);
    if (!/^\d{9}$/.test(id)) return { error: 'Not a recognised pack code (first 9 chars are not digits): "' + s + '"' };
    const sig = LS.sig.trim().toUpperCase();
    if (sig && !s.endsWith(sig)) return { id, warn: 'Barcode does not end in "' + sig + '" — possibly a DIFFERENT product. AIC may be wrong; verify manually.' };
    return { id };
  }

  function fill(id, isTest) {
    const f = findFields();
    if (!f.id) { setStatus('✕ No ID field found — set the selector in Settings.', 'bad'); return; }
    if (f.aic) setValue(f.aic, LS.aic);
    setValue(f.id, id);
    if (f.captcha) { setValue(f.captcha, ''); f.captcha.focus(); }
    if (!isTest) { count++; if (countEl) countEl.textContent = count; }
  }

  function handleScan(raw) {
    const res = parse(raw);
    if (res.skip) return;
    if (res.error) { setStatus('✕ ' + res.error, 'bad'); return; }
    fill(res.id, false);
    if (res.warn) setStatus('⚠ ' + res.id + ' filled — ' + res.warn, 'warn');
    else setStatus('✓ Filled AIC ' + LS.aic + ' + ID ' + res.id + '. Now solve the CAPTCHA and click Verify.', 'ok');
  }

  /* ---------- scanner capture (burst timing) ---------- */

  let buf = '', lastT = 0;
  const GAP = 60;

  document.addEventListener('keydown', function (e) {
    if (panel && panel.contains(e.target)) return;
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    const now = Date.now();
    if (now - lastT > GAP) buf = '';
    lastT = now;
    if (e.key === 'Enter') {
      if (buf.length >= 8) { e.preventDefault(); e.stopPropagation(); const s = buf; buf = ''; handleScan(s); }
      else buf = '';
      return;
    }
    if (e.key.length === 1) buf += e.key;
  }, true);

  /* ---------- panel UI ---------- */

  function setStatus(msg, cls) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = cls === 'ok' ? '#137a3a' : cls === 'warn' ? '#a86500' : cls === 'bad' ? '#b02020' : '#333';
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'bsa-panel';
    panel.innerHTML = `
      <style>
        #bsa-panel{position:fixed;bottom:16px;right:16px;z-index:2147483647;width:340px;
          font:13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2733;
          background:#fff;border:1px solid #cdd6de;border-radius:10px;
          box-shadow:0 6px 24px rgba(0,0,0,.18);overflow:hidden}
        #bsa-panel .hd{background:#1666b8;color:#fff;padding:8px 12px;display:flex;justify-content:space-between;align-items:center}
        #bsa-panel .hd b{font-size:13px}
        #bsa-panel .hd button{background:transparent;border:0;color:#fff;cursor:pointer;font-size:15px;line-height:1}
        #bsa-panel .bd{padding:10px 12px}
        #bsa-panel .scanbox{width:100%;font-size:16px;padding:8px;border:2px solid #1666b8;border-radius:6px;margin-bottom:8px;box-sizing:border-box}
        #bsa-panel .st{min-height:34px;font-weight:600;margin-bottom:8px}
        #bsa-panel .btns{display:flex;gap:8px;margin-bottom:8px}
        #bsa-panel .btns button{flex:1;padding:7px;border:1px solid #cdd6de;border-radius:6px;background:#f0f4f8;cursor:pointer;font-size:12px}
        #bsa-panel .det{font-size:11px;color:#5b6b7a;background:#f7f9fb;border:1px solid #eef1f4;border-radius:6px;padding:6px 8px;margin-bottom:8px;word-break:break-all}
        #bsa-panel .cnt{color:#5b6b7a;margin-bottom:8px}
        #bsa-panel .cnt b{color:#1c2733;font-size:16px}
        #bsa-panel details{border-top:1px solid #eef1f4;padding-top:8px}
        #bsa-panel summary{cursor:pointer;color:#1666b8;font-weight:600;margin-bottom:6px}
        #bsa-panel label{display:block;font-size:11px;color:#5b6b7a;margin:6px 0 2px;text-transform:uppercase;letter-spacing:.4px}
        #bsa-panel input.cfg{width:100%;padding:6px;border:1px solid #cdd6de;border-radius:5px;box-sizing:border-box}
        #bsa-panel .note{font-size:11px;color:#8a97a3;margin-top:8px;line-height:1.4}
        #bsa-panel.min .bd{display:none}
      </style>
      <div class="hd"><b>Bollino Scan Autofill</b><button id="bsa-min" title="Minimise">–</button></div>
      <div class="bd">
        <input class="scanbox" id="bsa-scan" placeholder="Scan a pack here (or scan anywhere on the page)…" autocomplete="off" spellcheck="false">
        <div class="st" id="bsa-status">Starting…</div>
        <div class="btns">
          <button id="bsa-redetect">Re-detect fields</button>
          <button id="bsa-test">Test fill</button>
        </div>
        <div class="det" id="bsa-detect">Detecting…</div>
        <div class="cnt">Filled this session: <b id="bsa-count">0</b></div>
        <details>
          <summary>Settings</summary>
          <label>AIC code (filled on every scan)</label>
          <input class="cfg" id="bsa-aic">
          <label>Product signature (barcode must end with this)</label>
          <input class="cfg" id="bsa-sig">
          <label>AIC field selector (optional override)</label>
          <input class="cfg" id="bsa-selaic" placeholder="e.g. #aicCode or input[name=aic]">
          <label>ID field selector (optional override)</label>
          <input class="cfg" id="bsa-selid" placeholder="e.g. #idNumber">
          <div class="note">Leave selectors blank to auto-detect. If the wrong boxes fill,
            right-click the correct field on the page &rarr; Inspect, read its id/name, and paste
            a selector here (then press "Re-detect fields").</div>
        </details>
        <div class="note"><b>Does not verify authenticity, never solves the CAPTCHA, never submits.</b>
          Check the filled numbers against the printed pack for your first ~10 scans.</div>
      </div>`;
    document.documentElement.appendChild(panel);

    statusEl = panel.querySelector('#bsa-status');
    countEl = panel.querySelector('#bsa-count');
    detectEl = panel.querySelector('#bsa-detect');

    const scanIn = panel.querySelector('#bsa-scan');
    scanIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); handleScan(scanIn.value); scanIn.value = ''; }
    });

    const aicIn = panel.querySelector('#bsa-aic');
    const sigIn = panel.querySelector('#bsa-sig');
    const selAicIn = panel.querySelector('#bsa-selaic');
    const selIdIn = panel.querySelector('#bsa-selid');
    aicIn.value = LS.aic; sigIn.value = LS.sig; selAicIn.value = LS.selAic; selIdIn.value = LS.selId;
    aicIn.addEventListener('input', () => LS.aic = aicIn.value.trim());
    sigIn.addEventListener('input', () => LS.sig = sigIn.value.trim());
    selAicIn.addEventListener('input', () => LS.selAic = selAicIn.value.trim());
    selIdIn.addEventListener('input', () => LS.selId = selIdIn.value.trim());

    panel.querySelector('#bsa-min').addEventListener('click', () => panel.classList.toggle('min'));
    panel.querySelector('#bsa-redetect').addEventListener('click', detectAndShow);
    panel.querySelector('#bsa-test').addEventListener('click', () => {
      fill('000000000', true);
      setStatus('Test: filled ID 000000000 + AIC ' + LS.aic + '. Did both boxes fill on the page?', 'warn');
    });
  }

  /* ---------- init ---------- */

  function init() {
    if (document.getElementById('bsa-panel')) return;
    buildPanel();
    detectAndShow();
    // re-run detection a few times in case the form loads late (SPA)
    let n = 0;
    const t = setInterval(() => { if (++n > 8 || findFields().id) { detectAndShow(); clearInterval(t); } }, 700);
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
