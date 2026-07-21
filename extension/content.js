/*
 * Bollino Scan Autofill — content script
 *
 * Human-in-the-loop only. When you scan a pack barcode with a keyboard-wedge
 * scanner, this reads the Identification Number out of the code and fills the
 * AIC + ID fields on the VerificaFustella form. It then clears the captcha
 * field and focuses it so YOU can read the CAPTCHA and click Verify.
 *
 * It never solves the CAPTCHA and never submits the form.
 */
(function () {
  'use strict';

  const LS = {
    get aic()  { try { return localStorage.getItem('bsa_aic') || '028489021'; } catch { return '028489021'; } },
    set aic(v) { try { localStorage.setItem('bsa_aic', v); } catch {} },
    get sig()  { try { return localStorage.getItem('bsa_sig') || 'V5F9X'; } catch { return 'V5F9X'; } },
    set sig(v) { try { localStorage.setItem('bsa_sig', v); } catch {} },
    get selAic() { try { return localStorage.getItem('bsa_selAic') || ''; } catch { return ''; } },
    set selAic(v){ try { localStorage.setItem('bsa_selAic', v); } catch {} },
    get selId()  { try { return localStorage.getItem('bsa_selId') || ''; } catch { return ''; } },
    set selId(v) { try { localStorage.setItem('bsa_selId', v); } catch {} }
  };

  let count = 0;
  let panel, statusEl, countEl;

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
    // walk up to a row/container and grab its text as a fallback
    const row = el.closest('tr, .form-group, .row, div');
    if (row) t += ' ' + row.textContent;
    return t.toLowerCase();
  }

  function findFields() {
    // manual overrides win
    const mAic = LS.selAic ? document.querySelector(LS.selAic) : null;
    const mId  = LS.selId ? document.querySelector(LS.selId) : null;

    const inputs = [...document.querySelectorAll('input')].filter(isVisible);
    const captcha = inputs.find(i => /captcha/i.test(i.placeholder || '') ||
                                     /captcha|verific/i.test(i.id || '') && i !== mAic && i !== mId);
    const textish = inputs.filter(i =>
      i !== captcha && /^(text|number|tel|search|)$/i.test(i.type || ''));

    let aic = mAic, id = mId;
    if (!aic) aic = textish.find(i => /\baic\b/i.test(labelTextFor(i)));
    if (!id)  id  = textish.find(i => i !== aic && /identif|identificativo|identification/i.test(labelTextFor(i)));

    const rest = textish.filter(i => i !== aic && i !== id && i !== captcha);
    if (!aic) aic = rest.shift();
    if (!id)  id  = rest.shift();

    return { aic, id, captcha };
  }

  /* ---------- value setting that frameworks notice ---------- */

  function setValue(el, value) {
    if (!el) return;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    ['input', 'change', 'keyup', 'blur'].forEach(type =>
      el.dispatchEvent(new Event(type, { bubbles: true })));
  }

  /* ---------- parse + fill ---------- */

  function parse(raw) {
    const s = (raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!s) return { skip: true };
    const id = s.slice(0, 9);
    if (!/^\d{9}$/.test(id)) return { error: 'Not a recognised pack code (first 9 chars are not digits).' };
    const sig = LS.sig.trim().toUpperCase();
    if (sig && !s.endsWith(sig)) return { id, warn: 'Barcode does not end in "' + sig + '" — possibly a DIFFERENT product. AIC may be wrong; verify manually.' };
    return { id };
  }

  function handleScan(raw) {
    const res = parse(raw);
    if (res.skip) return;
    if (res.error) { setStatus('✕ ' + res.error, 'bad'); return; }

    const f = findFields();
    if (!f.id) { setStatus('✕ Could not find the Identification Number field on this page. Set it manually in the panel.', 'bad'); return; }

    if (f.aic) setValue(f.aic, LS.aic);
    setValue(f.id, res.id);
    if (f.captcha) { setValue(f.captcha, ''); f.captcha.focus(); }

    count++;
    if (countEl) countEl.textContent = count;
    if (res.warn) setStatus('⚠ ' + res.id + ' filled — ' + res.warn, 'warn');
    else setStatus('✓ Filled AIC ' + LS.aic + ' + ID ' + res.id + '. Now solve the CAPTCHA and click Verify.', 'ok');
  }

  /* ---------- scanner capture (burst timing) ---------- */

  let buf = '', lastT = 0;
  const GAP = 50; // ms; wider gaps are treated as human typing and reset the buffer

  document.addEventListener('keydown', function (e) {
    // ignore anything typed inside our own panel (it handles itself)
    if (panel && panel.contains(e.target)) return;
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

    const now = Date.now();
    if (now - lastT > GAP) buf = '';
    lastT = now;

    if (e.key === 'Enter') {
      if (buf.length >= 8) {           // fast burst ending in Enter => a scan
        e.preventDefault();            // stop the form from submitting on the scanner's Enter
        e.stopPropagation();
        const scanned = buf; buf = '';
        handleScan(scanned);
      } else {
        buf = '';
      }
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
        #bsa-panel{position:fixed;bottom:16px;right:16px;z-index:2147483647;width:320px;
          font:13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2733;
          background:#fff;border:1px solid #cdd6de;border-radius:10px;
          box-shadow:0 6px 24px rgba(0,0,0,.18);overflow:hidden}
        #bsa-panel .hd{background:#1666b8;color:#fff;padding:8px 12px;display:flex;
          justify-content:space-between;align-items:center;cursor:default}
        #bsa-panel .hd b{font-size:13px}
        #bsa-panel .hd button{background:transparent;border:0;color:#fff;cursor:pointer;font-size:15px;line-height:1}
        #bsa-panel .bd{padding:10px 12px}
        #bsa-panel .scanbox{width:100%;font-size:16px;padding:8px;border:2px solid #1666b8;
          border-radius:6px;margin-bottom:8px;box-sizing:border-box}
        #bsa-panel .st{min-height:34px;font-weight:600;margin-bottom:8px}
        #bsa-panel .cnt{color:#5b6b7a;margin-bottom:8px}
        #bsa-panel .cnt b{color:#1c2733;font-size:16px}
        #bsa-panel details{border-top:1px solid #eef1f4;padding-top:8px;margin-top:4px}
        #bsa-panel summary{cursor:pointer;color:#1666b8;font-weight:600;margin-bottom:6px}
        #bsa-panel label{display:block;font-size:11px;color:#5b6b7a;margin:6px 0 2px;text-transform:uppercase;letter-spacing:.4px}
        #bsa-panel input.cfg{width:100%;padding:6px;border:1px solid #cdd6de;border-radius:5px;box-sizing:border-box}
        #bsa-panel .note{font-size:11px;color:#8a97a3;margin-top:8px;line-height:1.4}
        #bsa-panel.min .bd{display:none}
      </style>
      <div class="hd"><b>Bollino Scan Autofill</b><button id="bsa-min" title="Minimise">–</button></div>
      <div class="bd">
        <input class="scanbox" id="bsa-scan" placeholder="Scan a pack here…" autocomplete="off" spellcheck="false">
        <div class="st" id="bsa-status">Ready. Scan a pack — AIC + ID fill in, then solve the CAPTCHA and click Verify.</div>
        <div class="cnt">Filled this session: <b id="bsa-count">0</b></div>
        <details>
          <summary>Settings</summary>
          <label>AIC code (filled on every scan)</label>
          <input class="cfg" id="bsa-aic">
          <label>Product signature (barcode must end with this)</label>
          <input class="cfg" id="bsa-sig">
          <label>AIC field selector (optional override)</label>
          <input class="cfg" id="bsa-selaic" placeholder="e.g. #aicCode">
          <label>ID field selector (optional override)</label>
          <input class="cfg" id="bsa-selid" placeholder="e.g. #idNumber">
          <div class="note">Leave selectors blank to auto-detect. Fill them only if the wrong
            fields get populated — right-click the field on the page &rarr; Inspect to read its id.</div>
        </details>
        <div class="note"><b>This does not verify authenticity and never solves the CAPTCHA or
          submits the form.</b> It only saves you typing. Check the filled numbers against the
          printed pack for your first ~10 scans.</div>
      </div>`;
    document.documentElement.appendChild(panel);

    statusEl = panel.querySelector('#bsa-status');
    countEl = panel.querySelector('#bsa-count');

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
  }

  /* ---------- init: wait for the form to exist (SPA-safe) ---------- */

  function ready() {
    const f = findFields();
    return f.id && (f.captcha || f.aic);
  }

  function init() {
    if (document.getElementById('bsa-panel')) return;
    buildPanel();
  }

  if (ready()) {
    init();
  } else {
    let tries = 0;
    const obs = new MutationObserver(() => {
      if (ready()) { obs.disconnect(); init(); }
      else if (++tries > 200) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
