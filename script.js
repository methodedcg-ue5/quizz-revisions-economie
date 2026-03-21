/* ══════════════════════════════════════════════════
   DCG QUIZ v2 — script.js
   ──────────────────────────────────────────────────
   MODULES :
     1. APP_STATE   – état centralisé
     2. DATA        – chargement JSON
     3. NAVIGATION  – transitions entre écrans
     4. UI_HOME     – rendu écran Thèmes
     5. UI_CHAPTERS – rendu écran Chapitres
     6. UI_CONFIG   – rendu écran Config
     7. QUIZ_ENGINE – logique métier quiz
     8. UI_QUIZ     – rendu écran Quiz
     9. TIMER       – minuteur SVG 30 s
    10. UI_RESULTS  – rendu écran Résultats
    11. STORAGE     – sauvegarde localStorage
    12. UTILS       – helpers
   ══════════════════════════════════════════════════ */

'use strict';

/* ══ 1. APP_STATE ══════════════════════════════════ */
const S = {
  data:         null,   // JSON complet (themes[])
  theme:        null,   // thème actif
  chapitre:     null,   // chapitre actif
  questions:    [],     // tirage actif (mélangé, tronqué)
  qCount:       40,     // nb questions choisi
  timerOn:      true,   // timer activé ?
  cur:          0,      // index question en cours
  score:        0,      // score
  selected:     [],     // indexes cochés
  answered:     false,  // question validée ?
  timerHandle:  null,   // setInterval
  timeLeft:     30,     // secondes restantes
};

const TIMER_SECS   = 30;
const CIRCUM_TIMER = 163.36;  // 2π × 26 (rayon arc timer float)
const CIRCUM_RING  = 351.86;  // 2π × 56 (rayon anneau résultats)
const STORE_KEY    = 'dcgquiz_v2';

/* ══ 2. DATA ══════════════════════════════════════ */
fetch('data/questions.json')
  .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
  .then(json => { S.data = json; HOME.render(); })
  .catch(err => {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;
                  min-height:100svh;font-family:sans-serif;text-align:center;padding:2rem;">
        <div>
          <p style="font-size:2.5rem;margin-bottom:1rem">⚠️</p>
          <strong style="color:#991B1B">Erreur de chargement</strong><br>
          <small style="color:#888">${err.message}</small><br><br>
          <code style="color:#aaa;font-size:.8rem">data/questions.json</code>
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
  Object.entries(SCREENS).forEach(([k, el]) =>
    el.classList.toggle('active', k === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══ 4. UI_HOME ════════════════════════════════════ */
const HOME = {
  render() {
    const { data } = S;
    setText('site-matiere', data.matiere);
    document.title = `Quiz — ${data.matiere}`;

    const totalQ  = sumQuestions(data);
    const totalCh = data.themes.reduce((s, t) => s + t.chapitres.length, 0);
    setText('home-kpi', `${totalQ} questions · ${totalCh} chapitres · ${data.themes.length} thèmes`);

    const scores = STORAGE.get();
    const doneCh = Object.keys(scores).length;
    setText('footer-info',
      `${totalQ} questions disponibles · ${doneCh} chapitre${doneCh > 1 ? 's' : ''} complété${doneCh > 1 ? 's' : ''}`);

    const wrap = document.getElementById('themes-wrap');
    wrap.innerHTML = '';

    data.themes.forEach((t, i) => {
      const chapCount = t.chapitres.length;
      const qCount    = t.chapitres.reduce((s, ch) => s + ch.questions.length, 0);
      const doneCount = t.chapitres.filter(ch => scores[ch.id]).length;
      const pct       = chapCount > 0 ? Math.round((doneCount / chapCount) * 100) : 0;

      // Raccourcis chapitres pour chips
      const chapNums = t.chapitres.map(ch => `Ch.${ch.id}`).join(' · ');

      const card = el('div', 'theme-card');
      card.style.setProperty('--tc', t.couleur);
      card.style.animationDelay = `${i * 55}ms`;
      card.innerHTML = `
        <div class="tc-row">
          <span class="tc-icon">${t.icon}</span>
          <div>
            <div class="tc-name">${t.theme}</div>
          </div>
        </div>
        <div class="tc-meta">${chapCount} chapitre${chapCount > 1 ? 's' : ''} · ${qCount} questions</div>
        <div class="tc-chips"><span class="tc-chip">${chapNums}</span></div>
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
      const types  = [...new Set(ch.questions.map(q => q.type))];
      const saved  = scores[ch.id];
      const pillsHTML = types.map(t => {
        const cls = t === 'QCU' ? 'qcu' : t === 'QCM' ? 'qcm' : 'vf';
        return `<span class="pill ${cls}">${t === 'VF' ? 'V/F' : t}</span>`;
      }).join('');
      const scoreHTML = saved
        ? `<span class="ch-score">✓ ${saved.score}/${saved.total}</span>`
        : '';

      const item = el('li', 'ch-item');
      item.style.setProperty('--ch-c', theme.couleur);
      item.style.animationDelay = `${i * 45}ms`;
      item.innerHTML = `
        <span class="ch-num">Ch. ${ch.id}</span>
        <div class="ch-info">
          <div class="ch-name">${stripNum(ch.titre)}</div>
          <div class="ch-pills">${pillsHTML}</div>
        </div>
        ${scoreHTML}
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
    setText('cfg-sub',   `${total} questions disponibles · ${theme.theme}`);

    // Activer/désactiver les options de count + classe CSS
    document.querySelectorAll('.count-opt').forEach(label => {
      const radio = label.querySelector('input');
      const n = parseInt(radio.value);
      const disabled = n > total;
      radio.disabled = disabled;
      label.classList.toggle('disabled', disabled);
    });

    // Sélectionner le plus grand count disponible
    document.querySelectorAll('[name="qcount"]').forEach(r => { r.checked = false; });
    const enabled = [...document.querySelectorAll('[name="qcount"]:not(:disabled)')];
    if (enabled.length) enabled[enabled.length - 1].checked = true;

    this.updateWarn(total);

    // Écouter les changements via delegation (une seule fois)
    document.getElementById('count-row').onchange = () => this.updateWarn(total);

    showScreen('config');
  },

  updateWarn(total) {
    const chosen = parseInt(
      (document.querySelector('[name="qcount"]:checked') || { value: 40 }).value);
    const warn = document.getElementById('count-warn');
    if (chosen > total) {
      warn.textContent = `⚠ Seulement ${total} questions disponibles — le quiz sera limité à ${total} questions.`;
      warn.classList.remove('hidden');
    } else {
      warn.classList.add('hidden');
    }
  },

  getCount() {
    return parseInt(
      (document.querySelector('[name="qcount"]:checked') || { value: 40 }).value);
  },

  getTimerOn() {
    return document.getElementById('timer-toggle').checked;
  }
};

/* ══ 7. QUIZ_ENGINE ════════════════════════════════ */
const QUIZ = {
  start() {
    const count   = Math.min(CONFIG.getCount(), S.chapitre.questions.length);
    S.questions   = shuffle([...S.chapitre.questions]).slice(0, count);
    S.qCount      = count;
    S.timerOn     = CONFIG.getTimerOn();
    S.cur         = 0;
    S.score       = 0;
    showScreen('quiz');
    UI_QUIZ.render();
  },

  /** Valide la réponse courante. forceWrong=true si timer écoulé */
  validate(forceWrong = false) {
    if (S.answered) return;
    S.answered = true;
    TIMER.stop();

    const q      = S.questions[S.cur];
    const correct = getCorrect(q);
    const sel     = [...S.selected].sort((a, b) => a - b);
    const cor     = [...correct].sort((a, b) => a - b);
    const ok      = !forceWrong && arrEq(sel, cor);

    if (ok) S.score++;

    UI_QUIZ.revealAnswer(q, correct, ok);
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

    // Topbar
    const pct = S.cur / total * 100;
    document.getElementById('prog-fill').style.width  = `${pct}%`;
    setText('prog-text',  `${S.cur + 1} / ${total}`);
    setText('score-chip', `${S.score} pt${S.score > 1 ? 's' : ''}`);

    // Type badge
    const typeMap = { QCU: 'QCU', QCM: 'QCM', VF: 'V/F' };
    const clsMap  = { QCU: 'qcu', QCM: 'qcm', VF: 'vf'  };
    const badge   = document.getElementById('type-badge');
    badge.textContent = typeMap[q.type] || q.type;
    badge.className   = `type-badge ${clsMap[q.type] || ''}`;

    setText('q-index',     `Q ${S.cur + 1}`);
    setText('q-statement', q.enonce);
    setText('q-hint',      q.type === 'QCM' ? '⚠ Plusieurs réponses possibles' : '');

    // Couleur thème sur la flashcard
    document.getElementById('card-body').style.setProperty('--qcolor', S.theme.couleur);

    // Reset UI
    const card = document.getElementById('card-body');
    card.className = 'card-body';
    const fb = document.getElementById('feedback-box');
    fb.className  = 'feedback-box';
    fb.textContent = '';
    document.getElementById('btn-confirm').disabled = true;
    document.getElementById('btn-forward').classList.add('hidden');

    // Animation carte
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = 'card-in .28s var(--ease) both';

    // Options
    const list = document.getElementById('opts-list');
    list.innerHTML = '';
    const opts = q.type === 'VF' ? ['Vrai', 'Faux'] : (q.options || []);
    opts.forEach((txt, i) => list.appendChild(this.makeOpt(i, txt, q.type)));

    // Timer
    document.getElementById('timer-float').classList.toggle('on', S.timerOn);
    if (S.timerOn) TIMER.start();
  },

  makeOpt(idx, txt, type) {
    const btn = el('button', 'opt-btn');
    btn.dataset.idx = idx;
    const ltr = type === 'VF'
      ? (idx === 0 ? 'V' : 'F')
      : ['A', 'B', 'C', 'D'][idx] || String(idx + 1);
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
      if (pos === -1) { S.selected.push(idx); btn.classList.add('sel'); }
      else            { S.selected.splice(pos, 1); btn.classList.remove('sel'); }
    }
    document.getElementById('btn-confirm').disabled = S.selected.length === 0;
  },

  revealAnswer(q, correct, ok) {
    // Coloriser les options
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

    // Flash carte
    const card = document.getElementById('card-body');
    card.classList.add(ok ? 'flash-ok' : 'flash-err');
    setTimeout(() => card.classList.remove('flash-ok', 'flash-err'), 600);

    // Feedback
    const fb = document.getElementById('feedback-box');
    fb.className   = `feedback-box ${ok ? 'ok' : 'err'}`;
    fb.textContent = (ok ? '✓ Bonne réponse. ' : '✗ Mauvaise réponse. ') + (q.explication || '');

    // Score
    setText('score-chip', `${S.score} pt${S.score > 1 ? 's' : ''}`);

    // Progress
    const total = S.questions.length;
    document.getElementById('prog-fill').style.width = `${(S.cur + 1) / total * 100}%`;

    // Bouton suivant
    document.getElementById('btn-confirm').disabled = true;
    const fwd = document.getElementById('btn-forward');
    fwd.textContent = S.cur < total - 1 ? 'Suivant →' : 'Voir les résultats →';
    fwd.classList.remove('hidden');
  }
};

/* ══ 9. TIMER ══════════════════════════════════════ */
const TIMER = {
  start() {
    S.timeLeft = TIMER_SECS;
    this.draw(TIMER_SECS);
    clearInterval(S.timerHandle);
    S.timerHandle = setInterval(() => {
      S.timeLeft--;
      this.draw(S.timeLeft);
      if (S.timeLeft <= 0) {
        clearInterval(S.timerHandle);
        QUIZ.validate(true); // temps écoulé → mauvaise réponse
      }
    }, 1000);
  },

  stop() {
    clearInterval(S.timerHandle);
    S.timerHandle = null;
  },

  draw(t) {
    setText('timer-val', t);
    const offset = CIRCUM_TIMER * (1 - t / TIMER_SECS);
    const arc    = document.getElementById('arc-fg');
    arc.style.strokeDashoffset = offset;
    arc.classList.remove('warn', 'danger');
    if      (t <= 5)  arc.classList.add('danger');
    else if (t <= 10) arc.classList.add('warn');
  }
};

/* ══ 10. UI_RESULTS ════════════════════════════════ */
const RESULTS = {
  show() {
    TIMER.stop();
    const { score, questions, chapitre } = S;
    const total  = questions.length;
    const pct    = Math.round(score / total * 100);
    const note20 = (score / total * 20).toFixed(2);

    setText('res-label',   chapitre.titre);
    setText('ring-score',  score);
    setText('ring-total',  `/${total}`);
    setText('res-pct',     `${pct} %`);
    setText('res-mention', pct >= 80 ? 'Excellent !'
                         : pct >= 60 ? 'Bon travail.'
                         : pct >= 40 ? 'Des lacunes à combler.'
                         :             'À retravailler sérieusement.');
    setText('note-value',  note20);

    // Couleur note selon score
    const noteEl = document.getElementById('note-value');
    noteEl.style.color = pct >= 60 ? 'var(--ok)' : pct >= 40 ? 'var(--warn)' : 'var(--err)';

    // Anneau SVG animé
    const bar = document.getElementById('ring-bar');
    bar.style.stroke = pct >= 60 ? 'var(--ok)' : pct >= 40 ? 'var(--warn)' : 'var(--err)';
    bar.style.strokeDashoffset = CIRCUM_RING;
    requestAnimationFrame(() => {
      setTimeout(() => {
        bar.style.strokeDashoffset = CIRCUM_RING * (1 - score / total);
      }, 80);
    });

    // Détail par type
    const typeCount = {};
    questions.forEach(q => { typeCount[q.type] = (typeCount[q.type] || 0) + 1; });
    const typeLabels = { QCU: 'QCU', QCM: 'QCM', VF: 'V/F' };
    const bd = document.getElementById('res-breakdown');
    bd.innerHTML = Object.entries(typeCount).map(([t, n]) => `
      <div class="res-stat">
        <div class="res-stat-v">${n}</div>
        <div class="res-stat-l">${typeLabels[t] || t}</div>
      </div>`).join('') + `
      <div class="res-stat">
        <div class="res-stat-v">${score}</div>
        <div class="res-stat-l">Correct${score > 1 ? 's' : ''}</div>
      </div>`;

    showScreen('results');
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
function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
function setText(id, val) {
  const e = document.getElementById(id);
  if (e) e.textContent = val;
}
function stripNum(titre) {
  return titre.replace(/^Chapitre\s+\d+\s*[—–-]\s*/i, '');
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function arrEq(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
function sumQuestions(data) {
  return data.themes.reduce((s, t) =>
    s + t.chapitres.reduce((ss, ch) => ss + ch.questions.length, 0), 0);
}
/** Extrait les index corrects — supporte bool (ancien format) et liste (nouveau) */
function getCorrect(q) {
  if (q.type === 'VF') {
    if (typeof q.correct === 'boolean') return [q.correct ? 0 : 1];
    if (Array.isArray(q.correct)) return q.correct;
    return [0];
  }
  return Array.isArray(q.correct) ? q.correct : [q.correct];
}

/* ══ ÉVÉNEMENTS ════════════════════════════════════ */
// Retours navigation
document.getElementById('back-home').addEventListener('click',    () => { TIMER.stop(); HOME.render(); });
document.getElementById('back-chapters').addEventListener('click',() => { TIMER.stop(); CHAPTERS.open(S.theme); });
document.getElementById('btn-quit').addEventListener('click',     () => { TIMER.stop(); CONFIG.open(S.chapitre, S.theme); });

// Lancer le quiz
document.getElementById('btn-launch').addEventListener('click', () => QUIZ.start());

// Quiz
document.getElementById('btn-confirm').addEventListener('click', () => QUIZ.validate());
document.getElementById('btn-forward').addEventListener('click', () => QUIZ.next());

// Résultats
document.getElementById('btn-replay').addEventListener('click', () => {
  CONFIG.open(S.chapitre, S.theme);
});
document.getElementById('btn-pick').addEventListener('click', () => {
  TIMER.stop();
  CHAPTERS.open(S.theme);
});
