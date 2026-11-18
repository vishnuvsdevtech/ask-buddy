/* Ask Buddy — browser-only RAG with a creature for a face.
 *
 * Retrieval: BM25 over hand-written facts. No network, no API key, no model
 * weights. The knowledge base answers are pre-written, so the assistant can
 * quote a measured number but can never invent one — when nothing scores well
 * enough it says so, which is the only trustworthy failure mode for a portfolio.
 */
(() => {
  const KB = window.KB;
  const $ = (s) => document.querySelector(s);
  const companion = $('#companion');
  const bubble = $('#bubble');
  const thread = $('#thread');
  const suggests = $('#suggests');
  const form = $('#askForm');
  const input = $('#askInput');
  const creature = $('#creature');

  /* ---------------- text processing ---------------- */
  const STOP = new Set(('a an the is are was were do does did what which who how why when where ' +
    'his he him you your me my of to in on for with about and or it its that this be been has ' +
    'have tell show give can could would should i we they them their as at by from').split(' '));

  const SYN = {
    cv: ['computer', 'vision'], vision: ['cv'], anpr: ['plate', 'number', 'recognition'],
    yolo: ['detection', 'detector'], rag: ['retrieval', 'embeddings', 'llm'],
    llm: ['language', 'model', 'ai'], genai: ['ai', 'llm'], ai: ['genai', 'llm'],
    hardware: ['esp32', 'sensor', 'device'], sensor: ['hardware'], esp32: ['hardware', 'firmware'],
    papers: ['e-paper', 'eink'], eink: ['e-paper'], epaper: ['e-paper'],
    storage: ['compression', 'nvr'], nvr: ['camera', 'storage'], camera: ['vision', 'nvr'],
    motion: ['animation', 'spring'], animation: ['motion'], physics: ['spring', 'motion'],
    security: ['injection', 'guardrail'], injection: ['guardrail'], guardrail: ['injection'],
    speed: ['performance', 'fps'], fps: ['performance'], accuracy: ['precision', 'metric'],
    metric: ['precision', 'ap'], ap: ['precision', 'metric'],
    mistake: ['failure', 'bug'], bug: ['failure'], failure: ['mistake'],
    hire: ['contact'], work: ['role', 'projects'], projects: ['project'],
  };

  const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
  const tokenize = (s) => s.toLowerCase().replace(/[^a-z0-9\- ]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);

  /* ---------------- BM25 index ---------------- */
  const docs = KB.map((e) => {
    // tags carry more weight than prose: they are the author's own labels
    const text = [e.title, e.a, (e.tags || []).join(' ').repeat(3), (e.q || []).join(' ').repeat(2)].join(' ');
    const toks = tokenize(text);
    const tf = Object.create(null);
    toks.forEach((t) => { tf[t] = (tf[t] || 0) + 1; });
    return { e, tf, len: toks.length };
  });
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / docs.length;
  const df = Object.create(null);
  docs.forEach((d) => Object.keys(d.tf).forEach((t) => { df[t] = (df[t] || 0) + 1; }));
  const N = docs.length;
  const byId = new Map(docs.map((d) => [d.e.id, d]));
  const idf = (t) => {
    const n = df[t] || 0;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  };

  function bm25(queryToks) {
    const k1 = 1.45, b = 0.72;
    const scored = docs.map((d) => {
      let s = 0;
      const seen = new Set();
      for (let t of queryToks) {
        if (seen.has(t)) continue;
        seen.add(t);
        const f = d.tf[t] || 0;
        if (!f) continue;
        s += idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.len / avgLen))));
      }
      return { e: d.e, score: s };
    });
    return scored.sort((a, b2) => b2.score - a.score);
  }

  function expand(toks) {
    const out = [...toks];
    toks.forEach((t) => { if (SYN[t]) out.push(...SYN[t].map(stem)); });
    return out;
  }

  /* Score alone is not enough. "who won the 2018 world cup" scored well against
     ASCII World, because "world" is a strong term there — one matched word out
     of four. Coverage is the guard: most of the question has to be about the
     entry, not one word of it. */
  function coverage(questionToks, id) {
    const d = byId.get(id);
    if (!d) return 0;
    const uniq = [...new Set(questionToks)];
    if (!uniq.length) return 0;
    const hit = uniq.filter((t) => d.tf[t]).length;
    return hit / uniq.length;
  }

  function retrieve(rawQuestion) {
    // Pronouns are stopwords, so "who is he" tokenises to nothing at all. Add
    // the subject's name ONLY when the question has no content left — injecting
    // it into a normal question makes "which hardware has he used" look like a
    // question about him rather than about hardware.
    const typed = tokenize(rawQuestion);          // what the user actually typed
    let toks = expand(typed);
    if (!toks.length) toks = expand(tokenize('vishnu'));
    const ranked = bm25(toks);
    const top = ranked[0];
    return {
      ranked,
      top,
      second: ranked[1],
      // coverage is measured on the typed words, not the expanded ones: otherwise
      // adding five synonyms to a two-word question drops it below the floor
      cov: top ? coverage(typed.length ? typed : toks, top.e.id) : 0,
    };
  }

  const THRESHOLD = 2.8;

  /* ---------------- buddy behaviour ---------------- */
  let stateTimer = null;
  function setState(s, ms) {
    companion.dataset.state = s;
    clearTimeout(stateTimer);
    if (ms) stateTimer = setTimeout(() => { companion.dataset.state = 'idle'; }, ms);
  }

  // eyes follow the pointer
  const pupils = [...document.querySelectorAll('.b-pupil')];
  const glints = [...document.querySelectorAll('.b-glint')];
  addEventListener('pointermove', (e) => {
    const r = creature.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.55;
    const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / 260));
    const dy = Math.max(-1, Math.min(1, (e.clientY - cy) / 260));
    pupils.forEach((p) => { p.style.transform = `translate(${dx * 6}px,${dy * 5}px)`; });
    glints.forEach((g) => { g.style.transform = `translate(${dx * 6}px,${dy * 5}px)`; });
  }, { passive: true });

  // blinking
  const lids = [...document.querySelectorAll('.b-lid')];
  (function blinkLoop() {
    const wait = 2200 + Math.random() * 3600;
    setTimeout(() => {
      lids.forEach((l) => { l.style.transform = 'scaleY(1)'; });
      setTimeout(() => lids.forEach((l) => { l.style.transform = 'scaleY(0)'; }), 95);
      blinkLoop();
    }, wait);
  })();

  /* ---------------- chat ---------------- */
  let greeted = false;

  function addMsg(text, who = 'bot') {
    const d = document.createElement('div');
    d.className = 'msg ' + who;
    d.textContent = text;
    thread.appendChild(d);
    thread.scrollTop = thread.scrollHeight;
    return d;
  }

  function thinking() {
    const d = document.createElement('div');
    d.className = 'msg bot think';
    d.innerHTML = '<i></i><i></i><i></i>';
    thread.appendChild(d);
    thread.scrollTop = thread.scrollHeight;
    return d;
  }

  function typeOut(el, text, link, done) {
    let i = 0;
    setState('talking');
    const step = Math.max(8, Math.min(26, 900 / text.length));
    const tick = () => {
      el.textContent = text.slice(0, i);
      i += 3;
      if (i < text.length) {
        setTimeout(tick, step);
      } else {
        el.textContent = text;
        if (link) {
          const a = document.createElement('a');
          a.className = 'src';
          a.href = link; a.target = '_blank'; a.rel = 'noopener';
          a.textContent = 'open project ↗';
          el.appendChild(document.createElement('br'));
          el.appendChild(a);
        }
        thread.scrollTop = thread.scrollHeight;
        setState('happy', 900);
        done && done();
      }
    };
    tick();
  }

  function offerSuggestions(list) {
    suggests.innerHTML = '';
    (list || []).slice(0, 3).forEach((item) => {
      const b = document.createElement('button');
      b.textContent = item;
      b.addEventListener('click', () => ask(item));
      suggests.appendChild(b);
    });
  }

  const SUGGESTIONS = [
    'What has he built with computer vision?',
    'Tell me about the acoustic camera',
    'How does he approach a hard problem?',
    'What is the surprise camera?',
    'Which hardware has he worked with?',
    'What mistakes has he made?',
  ];

  function greeting() {
    if (greeted) return;
    greeted = true;
    addMsg("Hi — I'm Buddy. I know what Vishnu has built, how he works, and the numbers behind each project. Ask me anything, or tap one of these.");
    offerSuggestions(SUGGESTIONS.slice(0, 3));
  }

  function ask(question) {
    if (!question.trim()) return;
    companion.classList.add('open');
    greeting();
    addMsg(question, 'me');
    input.value = '';
    setState('thinking');
    const think = thinking();
    offerSuggestions([]);

    const { top, cov } = retrieve(question);
    const confident = top && top.score >= THRESHOLD && cov >= 0.5;

    setTimeout(() => {
      think.remove();
      if (!confident) {
        // honest failure: say so, and point at the nearest thing it does know
        setState('shrug', 1400);
        const clue = top && top.score > 1.2 && cov >= 0.34 ? ` Closest thing I have: ${top.e.title}.` : '';
        const msg = addMsg(`I don't know that one.${clue} I only answer from what's on this site — try asking about a project, the stack, or how he works.`);
        msg.textContent = `I don't know that one.${clue} I only answer from what's on this site — try asking about a project, the stack, or how he works.`;
        offerSuggestions(SUGGESTIONS.sort(() => Math.random() - 0.5).slice(0, 3));
        return;
      }
      const el = addMsg('');
      typeOut(el, top.e.a, top.e.link);
      // related follow-ups from the same entry's tags
      const related = KB
        .filter((k) => k.id !== top.e.id && k.tags.some((t) => top.e.tags.includes(t)))
        .slice(0, 2)
        .map((k) => k.q[0]);
      offerSuggestions(related.length ? related : SUGGESTIONS.slice(0, 2));
    }, 720 + Math.random() * 520);
  }

  /* ---------------- wiring ---------------- */
  creature.addEventListener('click', () => {
    companion.classList.toggle('open');
    if (companion.classList.contains('open')) {
      greeting();
      input.focus();
      setState('happy', 800);
    }
  });
  $('#collapse').addEventListener('click', (e) => {
    e.stopPropagation();
    companion.classList.remove('open');
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });
  $('#who').addEventListener('click', () => { thread.innerHTML = ''; greeted = false; greeting(); });

  // page-level example chips feed the same pipeline
  const tryChips = $('#tryChips');
  SUGGESTIONS.slice(0, 4).forEach((q) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = q;
    b.addEventListener('click', () => ask(q));
    tryChips.appendChild(b);
  });

  // expose for testing/tuning
  window.__ask = (q) => {
    const r = retrieve(q);
    const ok = r.top && r.top.score >= THRESHOLD && r.cov >= 0.5;
    return { top: r.top && r.top.e.id, score: r.top && +r.top.score.toFixed(2), cov: +r.cov.toFixed(2), answers: !!ok };
  };

  document.documentElement.dataset.ready = '1';
})();
