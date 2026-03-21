/* ══════════════════════════════════════════════════
   DCG QUIZ v3 — script.js
   ──────────────────────────────────────────────────
   MODULES :
     1. APP_STATE   – état centralisé
     2. DATA        – chargement JSON
     3. NAVIGATION  – transitions entre écrans
     4. UI_HOME     – écran Thèmes
     5. UI_CHAPTERS – écran Chapitres
     6. UI_CONFIG   – écran Config
     7. QUIZ_ENGINE – logique métier
     8. UI_QUIZ     – rendu questions + animations
     9. TIMER       – minuteur adaptatif (VF/QCU/QCM)
    10. UI_RESULTS  – écran résultats complet
    11. STORAGE     – localStorage
    12. UTILS       – helpers
   ══════════════════════════════════════════════════ */

'use strict';

/* ══ 1. APP_STATE ══════════════════════════════════ */
const S = {
  data:       null,   // JSON
  theme:      null,   // thème actif
  chapitre:   null,   // chapitre actif
  questions:  [],     // tirage mélangé
  timerOn:    true,
  cur:        0,
  score:      0,
  selected:   [],
  answered:   false,
  timerHandle:null,
  timeLeft:   0,
  timeSecs:   0,      // durée pour cette question
  errors:     [],     // { q, userSelected, correct }
};

// Durées timer par type
const TIMER_BY_TYPE = { VF: 8, QCU: 15, QCM: 20 };

// Circonférence anneau résultats (r=64)
const CIRCUM_RING = 402.12;

const STORE_KEY = 'dcgquiz_v3';

/* ══ 2. DATA ══════════════════════════════════════ */
fetch('data/questions.json')
  .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
  .then(json => { S.data = json; HOME.render(); })
  .catch(err => {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;
                  min-height:100svh;font-family:sans-serif;text-align:center;padding:2rem;background:#0f0f13;color:#e8e6f0;">
        <div>
          <p style="font-size:2.5rem;margin-bottom:1rem">⚠️</p>
          <strong style="color:#e06b6b">Erreur de chargement</strong><br>
          <small style="color:#888">${err.message}</small><br><br>
          <code style="color:#888;font-size:.8rem">data/questions.json</code>
        </div>
      </div>`;
  });

/* ══ 3. NAVIGATION ═════════════════════════════════ */
const SCREENS = {
  home:     document.getElementById('s-home'),
  chapters: document.getElementById('s-chapters'),
  config:   document.getElementById('s-config'),
  quiz:     document.getElementById('s-quiz'),
  results:  document.getElementById('s-results'),
};

function showScreen(name) {
  Object.entries(SCREENS).forEach(([k, e]) =>
    e.classList.toggle('active', k === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══ 4. UI_HOME ════════════════════════════════════ */
const HOME = {
  render() {
    const { data } = S;
    setText('site-matiere', data.matiere);
    document.title = `Quiz — ${data.matiere}`;

    const totalQ  = sumQ(data);
    const totalCh = data.themes.reduce((s,t) => s + t.chapitres.length, 0);
    setText('home-kpi', `${totalQ} questions · ${totalCh} chapitres · ${data.themes.length} thèmes`);

    const scores  = STORAGE.get();
    const doneCh  = Object.keys(scores).length;
    setText('footer-info',
      `${totalQ} questions · ${doneCh} chapitre${doneCh!==1?'s':''} complété${doneCh!==1?'s':''}`);

    const wrap = document.getElementById('themes-wrap');
    wrap.innerHTML = '';
    data.themes.forEach((t, i) => {
      const chCount = t.chapitres.length;
      const qCount  = t.chapitres.reduce((s,ch) => s + ch.questions.length, 0);
      const done    = t.chapitres.filter(ch => scores[ch.id]).length;
      const pct     = chCount > 0 ? Math.round(done/chCount*100) : 0;
      const nums    = t.chapitres.map(ch => `Ch.${ch.id}`).join(' · ');

      const card = mk('div','theme-card');
      card.style.setProperty('--tc', t.couleur);
      card.style.animationDelay = `${i*55}ms`;
      card.innerHTML = `
        <div class="tc-row">
          <span class="tc-icon">${t.icon}</span>
          <div><div class="tc-name">${t.theme}</div></div>
        </div>
        <div class="tc-meta">${chCount} chapitre${chCount!==1?'s':''} · ${qCount} questions</div>
        <div class="tc-chips"><span class="tc-chip">${nums}</span></div>
        <div class="tc-progress"><div class="tc-bar" style="width:${pct}%"></div></div>
        <span class="tc-arrow">›</span>`;
      card.addEventListener('click', () => CHAPTERS.open(t));
      wrap.appendChild(card);
    });
    showScreen('home');
  }
};

/* ══ 5. UI_CHAPTERS ════════════════════════════════ */
const CHAPTERS = {
  open(theme) {
    S.theme = theme;
    const scores = STORAGE.get();
    setText('nav-theme-label', theme.theme);
    setText('ch-emoji', theme.icon);
    setText('ch-title', theme.theme);

    const list = document.getElementById('ch-list');
    list.innerHTML = '';
    theme.chapitres.forEach((ch, i) => {
      const types = [...new Set(ch.questions.map(q => q.type))];
      const saved = scores[ch.id];
      const pills = types.map(t => {
        const c = t==='QCU'?'qcu':t==='QCM'?'qcm':'vf';
        return `<span class="pill ${c}">${t==='VF'?'V/F':t}</span>`;
      }).join('');
      const scoreBadge = saved
        ? `<span class="ch-score">✓ ${saved.score}/${saved.total}</span>` : '';

      const item = mk('li','ch-item');
      item.style.setProperty('--ch-c', theme.couleur);
      item.style.animationDelay = `${i*45}ms`;
      item.innerHTML = `
        <span class="ch-num">Ch. ${ch.id}</span>
        <div class="ch-info">
          <div class="ch-name">${stripNum(ch.titre)}</div>
          <div class="ch-pills">${pills}</div>
        </div>
        ${scoreBadge}
        <span class="ch-arrow">›</span>`;
      item.addEventListener('click', () => CONFIG.open(ch, theme));
      list.appendChild(item);
    });
    showScreen('chapters');
  }
};

/* ══ 6. UI_CONFIG ══════════════════════════════════ */
const CONFIG = {
  open(chapitre, theme) {
    S.chapitre = chapitre;
    const total = chapitre.questions.length;
    setText('nav-chap-label', `Ch. ${chapitre.id}`);
    setText('cfg-emoji', theme.icon);
    setText('cfg-title', stripNum(chapitre.titre));
    setText('cfg-sub',   `${total} questions · ${theme.theme}`);

    document.querySelectorAll('.count-opt').forEach(lbl => {
      const radio = lbl.querySelector('input');
      const n = parseInt(radio.value);
      const dis = n > total;
      radio.disabled = dis;
      lbl.classList.toggle('disabled', dis);
    });

    document.querySelectorAll('[name="qcount"]').forEach(r => r.checked = false);
    const enabled = [...document.querySelectorAll('[name="qcount"]:not(:disabled)')];
    if (enabled.length) enabled[enabled.length-1].checked = true;

    this.updateWarn(total);
    document.getElementById('count-row').onchange = () => this.updateWarn(total);
    showScreen('config');
  },
  updateWarn(total) {
    const chosen = parseInt(
      (document.querySelector('[name="qcount"]:checked') || {value:40}).value);
    const warn = document.getElementById('count-warn');
    if (chosen > total) {
      warn.textContent = `⚠ Seulement ${total} questions disponibles.`;
      warn.classList.remove('hidden');
    } else {
      warn.classList.add('hidden');
    }
  },
  getCount()   { return parseInt((document.querySelector('[name="qcount"]:checked')||{value:40}).value); },
  getTimerOn() { return document.getElementById('timer-toggle').checked; }
};

/* ══ 7. QUIZ_ENGINE ════════════════════════════════ */
const QUIZ = {
  start() {
    const count = Math.min(CONFIG.getCount(), S.chapitre.questions.length);
    S.questions  = shuffle([...S.chapitre.questions]).slice(0, count);
    S.timerOn    = CONFIG.getTimerOn();
    S.cur        = 0;
    S.score      = 0;
    S.errors     = [];
    showScreen('quiz');
    UI_QUIZ.render();
  },

  validate(forceWrong = false) {
    if (S.answered) return;
    S.answered = true;
    TIMER.stop();

    const q       = S.questions[S.cur];
    const correct = getCorrect(q);
    const sel     = [...S.selected].sort((a,b) => a-b);
    const cor     = [...correct].sort((a,b) => a-b);
    const ok      = !forceWrong && arrEq(sel, cor);

    if (ok) {
      S.score++;
    } else {
      // Enregistrer l'erreur pour l'affichage final
      S.errors.push({ q, userSelected: [...S.selected], correct });
    }

    UI_QUIZ.revealAnswer(q, correct, ok, forceWrong);
  },

  next() {
    S.cur++;
    if (S.cur < S.questions.length) {
      UI_QUIZ.render();
    } else {
      STORAGE.save(S.chapitre.id, S.score, S.questions.length);
      RESULTS.show();
    }
  }
};

/* ══ 8. UI_QUIZ ════════════════════════════════════ */
const UI_QUIZ = {
  render() {
    const q     = S.questions[S.cur];
    const total = S.questions.length;
    S.answered  = false;
    S.selected  = [];

    // Topbar progress
    document.getElementById('prog-fill').style.width = `${S.cur/total*100}%`;
    setText('prog-text',  `${S.cur+1} / ${total}`);
    this.updateScoreChip();

    // Badge type
    const typeMap = { QCU:'QCU', QCM:'QCM', VF:'V/F' };
    const clsMap  = { QCU:'qcu', QCM:'qcm', VF:'vf' };
    const badge   = document.getElementById('type-badge');
    badge.textContent = typeMap[q.type] || q.type;
    badge.className   = `type-badge ${clsMap[q.type]||''}`;

    setText('q-index',     `Q ${S.cur+1}`);
    setText('q-statement', q.enonce);
    setText('q-hint', q.type==='QCM' ? '⚠ Plusieurs réponses possibles' : '');

    // Reset score-delta
    const delta = document.getElementById('score-delta');
    delta.textContent = '';
    delta.className   = 'score-delta';

    // Couleur thème
    document.getElementById('card-body').style.setProperty('--qcolor', S.theme.couleur);

    // Reset carte
    const card = document.getElementById('card-body');
    card.className = 'card-body';
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';

    // Reset feedback
    const fb = document.getElementById('feedback-box');
    fb.className   = 'feedback-box';
    fb.textContent = '';

    // Boutons
    document.getElementById('btn-confirm').disabled = true;
    document.getElementById('btn-forward').classList.add('hidden');

    // Options
    const list = document.getElementById('opts-list');
    list.innerHTML = '';
    const opts = q.type==='VF' ? ['Vrai','Faux'] : (q.options||[]);
    opts.forEach((txt, i) => list.appendChild(this.makeOpt(i, txt, q.type)));

    // Timer
    const wrap = document.getElementById('timer-bar-wrap');
    wrap.style.display = S.timerOn ? 'flex' : 'none';
    if (S.timerOn) TIMER.start(q.type);
  },

  makeOpt(idx, txt, type) {
    const btn = mk('button','opt-btn');
    btn.dataset.idx = idx;
    const ltr = type==='VF' ? (idx===0?'V':'F') : ['A','B','C','D'][idx]||String(idx+1);
    btn.innerHTML = `<span class="opt-ltr">${ltr}</span><span>${txt}</span>`;
    btn.addEventListener('click', () => this.toggle(idx, type, btn));
    return btn;
  },

  toggle(idx, type, btn) {
    if (S.answered) return;
    if (type !== 'QCM') {
      S.selected = [idx];
      document.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
    } else {
      const pos = S.selected.indexOf(idx);
      if (pos===-1) { S.selected.push(idx); btn.classList.add('sel'); }
      else          { S.selected.splice(pos,1); btn.classList.remove('sel'); }
    }
    document.getElementById('btn-confirm').disabled = S.selected.length===0;
  },

  revealAnswer(q, correct, ok, forceWrong) {
    // Coloriser options
    document.querySelectorAll('.opt-btn').forEach(btn => {
      const idx = parseInt(btn.dataset.idx);
      btn.disabled = true;
      btn.classList.remove('sel');
      if (correct.includes(idx)) {
        btn.classList.add('ok');
        btn.querySelector('.opt-ltr').textContent = '✓';
      } else if (S.selected.includes(idx)) {
        btn.classList.add('err');
        btn.querySelector('.opt-ltr').textContent = '✕';
      }
    });

    // Flash carte + effet score
    const card = document.getElementById('card-body');
    if (ok) {
      card.classList.add('flash-ok');
      setTimeout(() => card.classList.remove('flash-ok'), 700);
      this.showScoreDelta('+1');
    } else {
      card.classList.add('flash-err');
      setTimeout(() => card.classList.remove('flash-err'), 700);
      if (forceWrong) this.showScoreDelta('⏱ Temps !', 'time');
      else            this.showScoreDelta('✕', 'wrong');
    }

    // Feedback
    const fb = document.getElementById('feedback-box');
    fb.className   = `feedback-box ${ok?'ok':'err'}`;
    const prefix = ok ? '✓ Bonne réponse ! ' : (forceWrong ? '⏱ Temps écoulé ! ' : '✗ Mauvaise réponse. ');
    fb.textContent = prefix + (q.explication||'');

    // Score topbar
    this.updateScoreChip();
    document.getElementById('prog-fill').style.width = `${(S.cur+1)/S.questions.length*100}%`;

    // Bouton suivant — auto-avance après 1.8s si timer épuisé
    document.getElementById('btn-confirm').disabled = true;
    const fwd = document.getElementById('btn-forward');
    fwd.textContent = S.cur < S.questions.length-1 ? 'Suivant →' : 'Voir les résultats →';
    fwd.classList.remove('hidden');
    if (forceWrong) {
      setTimeout(() => { if (!S.answered || S.cur >= 0) QUIZ.next(); }, 1800);
    }
  },

  showScoreDelta(text, cls='ok') {
    const d = document.getElementById('score-delta');
    d.textContent = text;
    d.className   = `score-delta show ${cls}`;
    setTimeout(() => { d.className = 'score-delta'; }, 1500);
  },

  updateScoreChip() {
    const chip = document.getElementById('score-chip');
    chip.textContent = `${S.score} pt${S.score!==1?'s':''}`;
    // Pulse animation
    chip.classList.remove('pulse');
    void chip.offsetWidth;
    chip.classList.add('pulse');
  }
};

/* ══ 9. TIMER adaptatif ════════════════════════════
   VF = 8s · QCU = 15s · QCM = 20s
   Barre horizontale CSS + dégradé vert→rouge
══════════════════════════════════════════════════ */
const TIMER = {
  start(qType) {
    const secs = TIMER_BY_TYPE[qType] || 15;
    S.timeSecs  = secs;
    S.timeLeft  = secs;
    this.draw(secs, secs);
    clearInterval(S.timerHandle);
    S.timerHandle = setInterval(() => {
      S.timeLeft--;
      this.draw(S.timeLeft, secs);
      if (S.timeLeft <= 0) {
        clearInterval(S.timerHandle);
        QUIZ.validate(true);
      }
    }, 1000);
  },

  stop() {
    clearInterval(S.timerHandle);
    S.timerHandle = null;
  },

  draw(t, total) {
    const bar   = document.getElementById('timer-bar');
    const label = document.getElementById('timer-label');
    const ratio = t / total;       // 1 → 0
    const pct   = ratio * 100;

    // Largeur de la barre
    bar.style.width = `${pct}%`;

    // Couleur : vert → orange → rouge
    const r = Math.round(94  + (224-94)  * (1-ratio));
    const g = Math.round(203 + (107-203) * (1-ratio));
    const b = Math.round(138 + (107-138) * (1-ratio));
    bar.style.background = `rgb(${r},${g},${b})`;

    // Ombre pulsante quand ≤ 3s
    bar.classList.toggle('timer-urgent', t <= 3);

    label.textContent = t;
    label.style.color = t <= 3 ? `rgb(${r},${g},${b})` : 'var(--muted)';
  }
};

/* ══ 10. UI_RESULTS ════════════════════════════════ */
const RESULTS = {
  show() {
    TIMER.stop();
    const { score, questions, chapitre, errors } = S;
    const total  = questions.length;
    const pct    = Math.round(score/total*100);
    const note20 = (score/total*20).toFixed(2);

    setText('res-label', chapitre.titre);

    // Emoji résultat
    const emoji = pct>=90?'🏆':pct>=75?'⭐':pct>=60?'👍':pct>=40?'📚':'💪';
    setText('res-emoji', emoji);

    // Anneau animé
    const bar = document.getElementById('ring-bar');
    const color = pct>=60 ? 'var(--green)' : pct>=40 ? '#e09a3e' : 'var(--red)';
    bar.style.stroke = color;
    bar.style.strokeDashoffset = CIRCUM_RING;
    requestAnimationFrame(() => setTimeout(() => {
      bar.style.strokeDashoffset = CIRCUM_RING * (1-score/total);
    }, 80));

    // Score animé (compteur)
    this.animateCount('ring-score', score);
    setText('ring-total', `/${total}`);

    // Pourcentage animé
    this.animateCount('res-pct', pct, '%');

    // Note colorée
    const noteEl = document.getElementById('note-value');
    noteEl.textContent = note20;
    noteEl.style.color = color;

    // Message adaptatif + encouragement
    const { mention, encourage } = this.getMessages(pct, score, total, errors.length);
    setText('res-mention',      mention);
    setText('res-encouragement', encourage);
    document.getElementById('res-message-block').style.borderColor = color;

    // Stats par type
    const typeCount = {};
    const typeOk    = {};
    questions.forEach((q,i) => {
      typeCount[q.type] = (typeCount[q.type]||0)+1;
      // savoir si bonne réponse : erreurs contient les mauvaises
      const wasWrong = errors.some(e => e.q===q);
      if (!wasWrong) typeOk[q.type] = (typeOk[q.type]||0)+1;
    });
    const typeLabels = { QCU:'QCU', QCM:'QCM', VF:'V/F' };
    const bd = document.getElementById('res-breakdown');
    bd.innerHTML = Object.entries(typeCount).map(([t,n]) => {
      const ok  = typeOk[t]||0;
      const tpct= Math.round(ok/n*100);
      return `
        <div class="res-stat">
          <div class="res-stat-v">${ok}<span class="res-stat-sub">/${n}</span></div>
          <div class="res-stat-l">${typeLabels[t]||t}</div>
          <div class="res-stat-bar"><div class="res-stat-fill" style="width:${tpct}%;background:${tpct>=60?'var(--green)':tpct>=40?'#e09a3e':'var(--red)'}"></div></div>
        </div>`;
    }).join('') + `
      <div class="res-stat res-stat-total">
        <div class="res-stat-v" style="color:${color}">${score}<span class="res-stat-sub">/${total}</span></div>
        <div class="res-stat-l">Total</div>
        <div class="res-stat-bar"><div class="res-stat-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>`;

    // Section erreurs
    const errSec = document.getElementById('errors-section');
    const errCount = errors.length;
    if (errCount === 0) {
      errSec.style.display = 'none';
    } else {
      errSec.style.display = 'block';
      setText('errors-count', errCount);
      this.buildErrorsList(errors);
    }

    showScreen('results');
  },

  getMessages(pct, score, total, errCount) {
    let mention, encourage;
    if (pct >= 90) {
      mention    = '🏆 Excellent ! Maîtrise parfaite.';
      encourage  = `${total-errCount} bonnes réponses sur ${total}. Tu maîtrises ce chapitre !`;
    } else if (pct >= 75) {
      mention    = '⭐ Très bon résultat !';
      encourage  = `Plus que ${errCount} point${errCount>1?'s':''} à peaufiner. Continue comme ça !`;
    } else if (pct >= 60) {
      mention    = '👍 Bon travail.';
      encourage  = `${errCount} erreur${errCount>1?'s':''} à revoir. Tu es sur la bonne voie !`;
    } else if (pct >= 40) {
      mention    = '📚 Des lacunes à combler.';
      encourage  = `${errCount} erreur${errCount>1?'s':''}. Relis le cours et recommence, tu vas y arriver !`;
    } else {
      mention    = '💪 À retravailler.';
      encourage  = `${errCount} erreur${errCount>1?'s':''}. Pas de panique — revois le cours et retente le quiz !`;
    }
    return { mention, encourage };
  },

  buildErrorsList(errors) {
    const list  = document.getElementById('errors-list');
    const opts  = ['A','B','C','D'];
    list.innerHTML = errors.map((e,i) => {
      const {q, userSelected, correct: corr} = e;
      const isVF = q.type === 'VF';
      const optsArr = isVF ? ['Vrai','Faux'] : (q.options||[]);
      const corrTxt  = corr.map(ci => isVF ? optsArr[ci] : `${opts[ci]}. ${optsArr[ci]||''}` ).join(' · ');
      const userTxt  = userSelected.length
        ? userSelected.map(ci => isVF ? optsArr[ci] : `${opts[ci]}. ${optsArr[ci]||''}`).join(' · ')
        : '(pas de réponse — temps écoulé)';
      return `
        <div class="error-item">
          <div class="err-q-num">Q${i+1} · ${q.type}</div>
          <div class="err-statement">${q.enonce}</div>
          <div class="err-row err-wrong">
            <span class="err-badge wrong">Votre réponse</span>
            <span>${userTxt}</span>
          </div>
          <div class="err-row err-correct">
            <span class="err-badge correct">Bonne réponse</span>
            <span>${corrTxt}</span>
          </div>
          ${q.explication ? `<div class="err-expl">${q.explication}</div>` : ''}
        </div>`;
    }).join('');
  },

  animateCount(id, target, suffix='') {
    const el  = document.getElementById(id);
    if (!el) return;
    let cur   = 0;
    const dur = 900;
    const step= 1000/60;
    const inc = target / (dur/step);
    el.textContent = `0${suffix}`;
    const iv = setInterval(() => {
      cur = Math.min(cur+inc, target);
      el.textContent = `${Math.round(cur)}${suffix}`;
      if (cur >= target) clearInterval(iv);
    }, step);
  }
};

/* ══ 11. STORAGE ═══════════════════════════════════ */
const STORAGE = {
  get() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch { return {}; }
  },
  save(chapId, score, total) {
    const d = this.get();
    if (!d[chapId] || score > d[chapId].score) {
      d[chapId] = { score, total, date: new Date().toISOString() };
      localStorage.setItem(STORE_KEY, JSON.stringify(d));
    }
  }
};

/* ══ 12. UTILS ═════════════════════════════════════ */
function mk(tag, cls) { const e = document.createElement(tag); if(cls) e.className=cls; return e; }
function setText(id, val) { const e = document.getElementById(id); if(e) e.textContent=val; }
function stripNum(t) { return t.replace(/^Chapitre\s+\d+\s*[—–-]\s*/i,''); }
function shuffle(arr) {
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
function arrEq(a,b) { return a.length===b.length && a.every((v,i)=>v===b[i]); }
function sumQ(data) {
  return data.themes.reduce((s,t)=>s+t.chapitres.reduce((ss,ch)=>ss+ch.questions.length,0),0);
}
function getCorrect(q) {
  if (q.type==='VF') {
    if (typeof q.correct==='boolean') return [q.correct?0:1];
    if (Array.isArray(q.correct)) return q.correct;
    return [0];
  }
  return Array.isArray(q.correct) ? q.correct : [q.correct];
}

/* ══ ÉVÉNEMENTS ════════════════════════════════════ */
document.getElementById('back-home').addEventListener('click',     () => { TIMER.stop(); HOME.render(); });
document.getElementById('back-chapters').addEventListener('click', () => { TIMER.stop(); CHAPTERS.open(S.theme); });
document.getElementById('btn-quit').addEventListener('click',      () => { TIMER.stop(); CONFIG.open(S.chapitre, S.theme); });
document.getElementById('btn-launch').addEventListener('click',    () => QUIZ.start());
document.getElementById('btn-confirm').addEventListener('click',   () => QUIZ.validate());
document.getElementById('btn-forward').addEventListener('click',   () => QUIZ.next());
document.getElementById('btn-replay').addEventListener('click',    () => CONFIG.open(S.chapitre, S.theme));
document.getElementById('btn-pick').addEventListener('click',      () => { TIMER.stop(); CHAPTERS.open(S.theme); });

// Toggle erreurs
document.getElementById('btn-toggle-errors').addEventListener('click', function() {
  const list = document.getElementById('errors-list');
  const hidden = list.classList.toggle('hidden');
  this.querySelector('svg').style.transform = hidden ? '' : 'rotate(180deg)';
});
