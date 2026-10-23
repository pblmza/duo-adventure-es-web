// Interfaz principal: lector del librojuego, grupo, pruebas, guardado.
'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SAVE_KEY = 'duo-adventure-es-v1';
let party = null;
let view = 'book';

const CHECK_ES = { Cartography: 'Cartografía', Insight: 'Perspicacia', Notice: 'Advertir', Search: 'Búsqueda', 'Danger Sense': 'Sentir el Peligro',
  'Spot Trap': 'Detectar Trampas', Track: 'Rastrear', Hide: 'Esconderse', 'Disable Device': 'Desactivar Mecanismos', Literature: 'Literatura',
  Herbology: 'Herbología', Investigation: 'Investigación', Riding: 'Montar', Ride: 'Montar', Tumble: 'Acrobacia', Strength: 'Fuerza',
  'Priest Spellcasting': 'Conjuros de Sacerdote', Spellcasting: 'Conjuros', 'Monster Knowledge': 'Conocimiento de Monstruos', Initiative: 'Iniciativa',
  Fortitude: 'Fortaleza', Willpower: 'Voluntad', Accuracy: 'Precisión', Evasion: 'Evasión', Knowledge: 'Conocimiento' };

function newParty(mode, solo, challenge) {
  const p = { mode, solo, challenge, pcs: {}, support: { S: 10, C: 10 }, counters: { Retrasos: 0, Relojes: 0, 'Aldeanos muertos': 0 },
    items: {}, notes: '', history: [], current: 'START', fxDone: {}, checks: {}, flags: {}, journal: [], started: Date.now() };
  for (const k of ['S', 'C']) {
    const P = PC_DATA[k];
    p.pcs[k] = { hp: P.hp, mp: P.mp, mako: [...P.items0.mako], sun: [...P.items0.sun], moon: [...P.items0.moon], awake: P.items0.awake, status: {}, dead: false };
  }
  return p;
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(party)); } catch (e) { console.warn(e); } renderSide(); }
function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }
function journal(txt) { party.journal.push({ t: txt, at: party.current }); if (party.journal.length > 400) party.journal.shift(); }

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
function ask(title, html, buttons) {
  return new Promise((res) => {
    const m = $('#modal');
    m.innerHTML = `<div class="mbox"><h3>${esc(title)}</h3><div>${fmt(html)}</div><div class="row">${buttons.map((b, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-i="${i}">${fmt(b.label)}</button>`).join('')}</div></div>`;
    m.classList.add('open');
    m.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { m.classList.remove('open'); res(buttons[+b.dataset.i].value); }));
  });
}

// Formato de texto del libro
function fmt(s) {
  let h = esc(s);
  h = h.replace(/&lt;([^&]{1,60}?)&gt;/g, '<span class="item">‹$1›</span>');
  h = h.replace(/\[([^\]]{1,40})\]/g, '<span class="tag">[$1]</span>');
  h = h.replace(/☀/g, '<span class="sun">☀</span>').replace(/☾/g, '<span class="moon">☾</span>');
  h = h.replace(/(“[^”]{1,1200}”)/g, '<span class="q">$1</span>');
  return h;
}

// ------- identificación de nodos -------
function parseId(id) {
  if (id.startsWith('E:')) return { block: 'E', code: id.slice(2) };
  const [b, code] = id.split(':'); return { block: b, scen: +code.split('-')[0], code };
}
function labelOf(id) {
  if (!id) return '?';
  const p = parseId(id);
  if (p.block === 'E') return 'Final ' + p.code;
  const cur = party && parseId(party.current);
  if (cur && cur.block === p.block) return p.code;
  return `Bloque ${p.block.slice(1)} · ${p.code}`;
}
function headerOf(id) {
  const p = parseId(id);
  if (p.block === 'E') return { top: 'Finales', sub: 'Final ' + p.code.split('-')[0] };
  const T = SCEN_TITLES[p.block];
  return { top: `Bloque ${p.block.slice(1)}: ${T[0]}`, sub: `Escenario ${p.scen}: ${T[p.scen]}` };
}

// ------- navegación -------
function goTo(id) {
  if (!BOOK.nodes[id] && id !== 'START') { toast('Destino no encontrado: ' + id); return; }
  party.current = id; party.history.push(id);
  party.visits = party.visits || {}; party.visits[id] = (party.visits[id] || 0) + 1;
  // regla: al inicio de cada bloque se restauran PV y PM
  save(); view = 'book'; render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function goBack() {
  if (party.history.length < 2) return;
  party.history.pop(); party.current = party.history[party.history.length - 1]; save(); render();
}

// ------- render principal -------
function render() {
  document.body.dataset.view = view;
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  const main = $('#main');
  if (!party) { renderStart(); return; }
  if (view === 'book') renderNode(main);
  else if (view === 'intro') renderManual(main, BOOK.front, 'Cómo jugar e introducción');
  else if (view === 'rules') renderManual(main, BOOK.rules, 'Reglamento simplificado');
  else if (view === 'bestiary') renderBestiary(main);
  else if (view === 'sheets') renderSheets(main);
  else if (view === 'journal') renderJournal(main);
  renderSide();
}

function renderStart() {
  document.body.dataset.view = 'start';
  const old = load();
  $('#main').innerHTML = `<div class="start">
    <img class="cover" src="img/cover.jpg" alt="">
    <h1>Sword World 2.5<br><small>Duo Adventure</small></h1>
    <p class="subtitle">La Princesa del Sol Radiante y el Príncipe de la Luna Brillante</p>
    ${old ? `<button class="btn primary big" id="cont">Continuar partida (${labelOf(old.current === 'START' ? 'B1:1-1' : old.current)})</button>` : ''}
    <div class="newgame card">
      <h3>Nueva partida</h3>
      <label class="tg"><input type="radio" name="mode" value="duo" checked> Dos jugadores (cada uno lleva a un gemelo, en el mismo dispositivo)</label>
      <label class="tg"><input type="radio" name="mode" value="soloS"> Solitario como ☀ Shyraes</label>
      <label class="tg"><input type="radio" name="mode" value="soloC"> Solitario como ☾ Clumen</label>
      <label class="tg"><input type="checkbox" id="chal"> Modo Desafío (más enemigos; en solitario no se reducen sus PV)</label>
      <button class="btn primary big" id="newg">Comenzar la aventura</button>
    </div>
    <p class="muted small">Versión web no oficial en español para uso privado. Basada en la traducción al inglés de fans del libro de Group SNE (Miyuki Kiyomatsu, Kei Kitazawa, Jun Kawabata).</p>
  </div>`;
  if (old) $('#cont').onclick = () => { party = old; view = 'book'; render(); };
  $('#newg').onclick = async () => {
    if (old && !(await ask('¿Empezar de nuevo?', 'Se borrará la partida guardada en este navegador.', [{ label: 'Sí, empezar', value: 1 }, { label: 'Cancelar', value: 0 }]))) return;
    const m = document.querySelector('input[name=mode]:checked').value;
    party = newParty(m === 'duo' ? 'duo' : 'solo', m === 'soloS' ? 'S' : m === 'soloC' ? 'C' : null, $('#chal').checked);
    party.current = 'START'; save(); view = 'intro'; render();
    toast('Lee «Cómo jugar» y luego pulsa «Libro» para empezar.');
  };
}

function renderNode(main) {
  if (party.current === 'START') {
    main.innerHTML = `<article class="node"><div class="hdr"><div class="top">Parte 3</div><div class="sub">Aventura principal</div></div>
      <p>Los gemelos parten de la capital real. Si aún no lo han hecho, lean la introducción de la historia en <a href="#" id="toIntro">Cómo jugar e introducción</a>.</p>
      <div class="choices"><button class="choice" id="b1">► Bloque 1: ${SCEN_TITLES.B1[0]}</button></div></article>`;
    $('#toIntro').onclick = (e) => { e.preventDefault(); view = 'intro'; render(); };
    $('#b1').onclick = () => goTo('B1:1-1');
    return;
  }
  const id = party.current, n = BOOK.nodes[id], H = headerOf(id), p = parseId(id);
  const visitKey = id + '#' + (party.visits ? party.visits[id] || 1 : 1);
  let h = `<article class="node"><div class="hdr"><div class="top">${H.top}</div><div class="sub">${H.sub}</div></div>
    <div class="pcode">${p.code}</div>`;
  // reglas de inicio de bloque
  if (/^B\d:1-1$/.test(id)) {
    h += `<div class="fx blockstart">${chip('restore', 'Restaurar PV y PM de todos', visitKey)}${p.block !== 'B1' ? chip('refill', 'Reponer consumibles (Piedras Mako, amuletos, pociones)', visitKey) : ''}</div>`;
  }
  const choices = [];
  n.body.forEach((b, i) => {
    if (b.img) h += `<figure><img src="${b.img}" loading="lazy" alt=""></figure>`;
    else if (b.t !== undefined) h += `<p>${fmt(b.t)}</p>`;
    else if (b.c !== undefined) choices.push(b);
    (n.checks || []).filter((c) => c.i === i).forEach((c, j) => (h += checkWidget(id, c, i + '_' + j)));
    (n.fx || []).filter((f) => f.i === i).forEach((f, j) => (h += fxChip(f, visitKey + '_' + i + '_' + j)));
  });
  if (COMBATS[id]) {
    const res = party.flags['combat_' + id];
    h += `<div class="combat-cta"><button class="btn primary big" id="startCombat">⚔ ${res ? 'Repetir' : 'Iniciar'} combate: ${COMBATS[COMBATS[id].ref || id].title}</button>
      ${res ? `<span class="muted">Último resultado: ${res.res === 'win' ? 'victoria' : 'derrota'} en ${res.round} asalto(s)${res.luxDead ? ' · Lux murió' : ''}.</span>` : ''}</div>`;
  }
  h += `<div class="choices">` + choices.map((c, k) => {
    const needS = c.c.includes('☀'), needC = c.c.includes('☾');
    let dis = false, note = '';
    if (party.mode === 'solo') { if ((needS && party.solo !== 'S') || (needC && party.solo !== 'C')) { dis = true; note = 'Solo puede elegirla el otro gemelo'; } }
    else if (needS || needC) note = `Requiere el acuerdo de ${needS ? '☀ Shyraes' : ''}${needS && needC ? ' y ' : ''}${needC ? '☾ Clumen' : ''}`;
    return `<button class="choice ${dis ? 'dis' : ''}" data-to="${c.to}" ${dis ? 'disabled' : ''}>► ${fmt(c.c)}${note ? `<small>${note}</small>` : ''}</button>`;
  }).join('') + `</div>`;
  if (!choices.length) h += `<div class="the-end">— FIN —<br><button class="btn" id="toStart">Volver al inicio</button></div>`;
  h += `<div class="navrow"><button class="btn ghost sm" id="back" ${party.history.length < 2 ? 'disabled' : ''}>← Volver al párrafo anterior</button></div></article>`;
  main.innerHTML = h;
  main.querySelectorAll('.choice[data-to]').forEach((b) => (b.onclick = () => goTo(b.dataset.to)));
  if ($('#startCombat')) $('#startCombat').onclick = () => startCombatFor(id);
  if ($('#toStart')) $('#toStart').onclick = () => { renderStart(); };
  $('#back').onclick = goBack;
  bindChecks(main, id); bindFx(main);
}

// ------- efectos narrativos -------
function chip(kind, label, key, data = {}) {
  const done = party.fxDone[key + kind];
  return `<button class="fxchip ${done ? 'done' : ''}" data-fx="${kind}" data-key="${key + kind}" data-d='${JSON.stringify(data)}'>${done ? '✔ ' : ''}${esc(label)}</button>`;
}
function fxChip(f, key) {
  if (f.restore) return `<div class="fx">${chip('restore', 'Restaurar PV y PM de todos', key)}</div>`;
  if (f.counter) {
    const name = f.counter === 'Delay' ? 'Retrasos' : 'Relojes';
    return `<div class="fx">${chip('counter', `Anotar ${f.amt} [${name === 'Retrasos' ? 'Retraso' : 'Reloj'}]`, key, { name, amt: f.amt })}</div>`;
  }
  if (f.who) {
    return `<div class="fx">${f.who.map((w) => chip('support', `${PC_DATA[w].icon} ${PC_DATA[w].name}: Apoyo ${f.amt}`, key + w, { who: w, amt: f.amt })).join('')}<span class="muted sm">Aplica solo si se cumple la condición del texto.</span></div>`;
  }
  return '';
}
function rollAmt(a) { // '+1d-3', '-2', '+1d'
  const m = a.match(/^([+-])(?:(\d)d)?([+-]?\d+)?$/);
  if (!m) return { v: 0, txt: a };
  let v = 0, txt = '';
  if (m[2]) { let s = 0; const rolls = []; for (let i = 0; i < +m[2]; i++) { const r = d6(); rolls.push(r); s += r; } v = s + (m[3] ? +m[3] : 0); txt = `1d=${rolls.join('+')}${m[3] ? m[3] : ''}`; if (/^\+1d-3$/.test(a) || /^\+1d-2$/.test(a)) v = v; }
  else v = +(m[3] || 0);
  if (m[1] === '-') v = -Math.abs(v);
  return { v, txt };
}
function bindFx(root) {
  root.querySelectorAll('[data-fx]').forEach((b) => (b.onclick = () => {
    const key = b.dataset.key, d = JSON.parse(b.dataset.d || '{}'), kind = b.dataset.fx;
    if (party.fxDone[key]) { toast('Ya aplicado (puedes ajustar a mano en el panel del grupo).'); return; }
    if (kind === 'restore') { for (const k of ['S', 'C']) { const st = party.pcs[k]; if (!st.dead) { st.hp = PC_DATA[k].hp; st.mp = PC_DATA[k].mp; } } journal('PV y PM restaurados'); toast('PV y PM restaurados.'); }
    if (kind === 'refill') { for (const k of ['S', 'C']) { const st = party.pcs[k], I = PC_DATA[k].items0; st.mako = [...I.mako]; st.sun = [...I.sun]; st.moon = [...I.moon]; st.awake = I.awake; } journal('Consumibles repuestos'); toast('Consumibles repuestos.'); }
    if (kind === 'support') {
      const r = rollAmt(d.amt); party.support[d.who] += r.v;
      journal(`${PC_DATA[d.who].name}: Apoyo ${r.v >= 0 ? '+' : ''}${r.v}${r.txt ? ' (' + r.txt + ')' : ''}`);
      toast(`${PC_DATA[d.who].icon} Apoyo ${r.v >= 0 ? '+' : ''}${r.v}${r.txt ? ' (' + r.txt + ')' : ''} → ${party.support[d.who]}`);
    }
    if (kind === 'counter') {
      let r = rollAmt(d.amt); if (r.v < 0) r.v = 0;
      party.counters[d.name] = (party.counters[d.name] || 0) + r.v; journal(`${d.name} +${r.v}`);
      toast(`${d.name}: +${r.v}${r.txt ? ' (' + r.txt + ')' : ''} → ${party.counters[d.name]}`);
    }
    party.fxDone[key] = true; save(); render();
  }));
}

// ------- pruebas -------
function checkActors(c) {
  const out = [];
  const twins = party.mode === 'solo' ? [party.solo] : ['S', 'C'];
  for (const k of ['S', 'C']) if (c.sv[k] !== undefined && twins.includes(k) && !party.pcs[k].dead) out.push(k);
  if (c.sv.G !== undefined) out.push('G');
  return out;
}
function checkWidget(id, c, key) {
  const name = CHECK_ES[c.name] || c.name;
  const ck = id + '~' + key;
  const st = party.checks[ck] || {};
  const rows = checkActors(c).map((k) => {
    const P = k === 'G' ? GAMBLE : PC_DATA[k];
    const r = st[k];
    let res = '';
    if (r) {
      const ok = c.tn == null ? null : r.ok;
      res = `<span class="dice">${DIE[r.a]}${DIE[r.b]}</span> ${sgn(c.sv[k])}${r.mod ? ' ' + sgn(r.mod) : ''}${r.charm ? ' +' + r.charm + ' (amuleto)' : ''} = <b>${r.fumble ? 'pifia' : r.total}</b> ${ok === null ? '' : ok ? '<span class="ok">✔ éxito</span>' : '<span class="ko">✘ fallo</span>'}${r.crit ? ' (6-6)' : ''}`;
      if (ok === false && !r.fumble && k !== 'G' && /Fortaleza|Voluntad/.test(name)) {
        const pool = party.pcs[k][name === 'Fortaleza' ? 'sun' : 'moon'];
        const need = c.tn - r.total;
        const opts = [...new Set(pool.filter((v) => v >= need))];
        if (opts.length) res += opts.map((v) => ` <button class="btn sm" data-charm="${ck}|${k}|${v}|${name}">Romper amuleto +${v}</button>`).join('');
      }
    }
    return `<div class="crow"><span class="who">${P.icon} ${P.name}</span>
      ${r ? res : `<input type="number" class="mod" value="0" title="bonificador/penalizador" data-mod="${ck}|${k}"><button class="btn sm primary" data-roll="${ck}|${k}|${c.sv[k]}|${c.tn == null ? '' : c.tn}">🎲 Tirar 2d${sgn(c.sv[k])}</button>`}</div>`;
  }).join('');
  const results = checkActors(c).map((k) => st[k]).filter(Boolean);
  let sum = '';
  if (c.tn != null && results.length) {
    const any = results.some((r) => r.ok), all = results.length === checkActors(c).length && results.every((r) => r.ok);
    sum = `<div class="csum">${any ? 'Al menos uno tuvo éxito' : 'Nadie ha tenido éxito'}${all ? ' · todos tuvieron éxito' : ''}</div>`;
  }
  return `<div class="check"><div class="ch">🎲 Prueba de ${name}${c.tn != null ? ` · NO ${c.tn}` : ''}<button class="btn ghost sm" data-reset="${ck}">reiniciar</button></div>${rows}${sum}</div>`;
}
function bindChecks(root, id) {
  root.querySelectorAll('[data-roll]').forEach((b) => (b.onclick = () => {
    const [ck, k, sv, tn] = b.dataset.roll.split('|');
    const modEl = root.querySelector(`[data-mod="${ck}|${k}"]`);
    const mod = modEl ? +modEl.value || 0 : 0;
    const r = r2d();
    const total = Math.max(0, r.s + +sv + mod);
    const isInit = /Iniciativa/.test(b.closest('.check').textContent);
    const ok = tn === '' ? null : r.fumble ? false : r.crit && !isInit ? true : total >= +tn;
    party.checks[ck] = party.checks[ck] || {};
    party.checks[ck][k] = { a: r.a, b: r.b, total: r.fumble ? 0 : total, ok, mod, crit: r.crit, fumble: r.fumble };
    save(); render();
  }));
  root.querySelectorAll('[data-reset]').forEach((b) => (b.onclick = () => { delete party.checks[b.dataset.reset]; save(); render(); }));
  root.querySelectorAll('[data-charm]').forEach((b) => (b.onclick = () => {
    const [ck, k, v, name] = b.dataset.charm.split('|');
    const pool = party.pcs[k][name === 'Fortaleza' ? 'sun' : 'moon'];
    pool.splice(pool.indexOf(+v), 1);
    const r = party.checks[ck][k]; r.total += +v; r.charm = +v; r.ok = true;
    journal(`${PC_DATA[k].name} rompe un amuleto +${v}`); save(); render();
  }));
}

// ------- panel lateral del grupo -------
function bar(v, m, cls) { return `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, (v / m) * 100))}%"></i><span>${cls === 'hp' ? 'PV' : 'PM'} ${v}/${m}</span></div>`; }
function renderSide() {
  const s = $('#side'); if (!party || !s) { if (s) s.innerHTML = ''; return; }
  const twins = ['S', 'C'];
  let h = `<div class="party">`;
  for (const k of twins) {
    const P = PC_DATA[k], st = party.pcs[k];
    const passive = party.mode === 'solo' && party.solo !== k;
    h += `<div class="pc ${st.dead ? 'dead' : ''} ${passive ? 'passive' : ''}"><div class="pn"><img src="${P.portrait}" alt=""><div><b>${P.icon} ${P.name}</b>${st.dead ? ' ☠' : ''}<br><small>${P.title}${passive ? ' · acompañante pasivo' : ''}</small></div></div>
      <div class="adj">${bar(st.hp, P.hp, 'hp')}<button class="mini" data-adj="${k}|hp|-1">−</button><button class="mini" data-adj="${k}|hp|1">+</button></div>
      <div class="adj">${bar(st.mp, P.mp, 'mp')}<button class="mini" data-adj="${k}|mp|-1">−</button><button class="mini" data-adj="${k}|mp|1">+</button></div>
      <div class="sup">Apoyo <b>${party.support[k]}</b> <button class="mini" data-sup="${k}|-1">−</button><button class="mini" data-sup="${k}|1">+</button></div>
      <div class="inv">Piedras Mako: ${st.mako.length ? st.mako.map((x) => `<span class="pill">${x}</span>`).join('') : '—'}
        · Amuleto Solar ${st.sun.map((x) => '+' + x).join(' ') || '—'} · Lunar ${st.moon.map((x) => '+' + x).join(' ') || '—'} · Poción de Despertar ×${st.awake}</div>
      <div class="sts">${statusToggle(k, 'envenenado', 'Envenenado')}${statusToggle(k, 'gas', 'Gas (−1 Eva)')}${k === 'S' ? statusToggle(k, 'kingsblade', 'Espada del Rey') : ''}${statusToggle(k, 'magicWeapon', 'Arma mágica')}${statusToggle(k, 'dead', 'Muerto', true)}</div>
      ${k === 'C' && !st.dead ? `<div class="row"><button class="btn sm" id="sideCure">✨ Curar Heridas (3 PM)</button></div>` : ''}
    </div>`;
  }
  h += `</div><div class="counters"><h4>Contadores</h4>${Object.keys(party.counters).map((c) => `<div class="cnt">${c} <b>${party.counters[c]}</b><button class="mini" data-cnt="${c}|-1">−</button><button class="mini" data-cnt="${c}|1">+</button></div>`).join('')}</div>
    <div class="dicebox"><h4>Dados</h4><button class="btn sm" data-dice="1">1d</button><button class="btn sm" data-dice="2">2d</button><span id="diceOut"></span></div>
    <div class="keyitems"><h4>Objetos y notas</h4>${KEY_ITEMS.map((it) => `<label class="tg sub"><input type="checkbox" data-item="${esc(it)}" ${party.items[it] ? 'checked' : ''}> ${fmt(it)}</label>`).join('')}
    <textarea id="notes" placeholder="Notas: decisiones importantes, quién está envenenado, etc.">${esc(party.notes || '')}</textarea></div>`;
  s.innerHTML = h;
  s.querySelectorAll('[data-adj]').forEach((b) => (b.onclick = () => { const [k, f, d] = b.dataset.adj.split('|'); const st = party.pcs[k]; st[f] = Math.max(f === 'mp' ? 0 : -99, Math.min(PC_DATA[k][f], st[f] + +d)); save(); }));
  s.querySelectorAll('[data-sup]').forEach((b) => (b.onclick = () => { const [k, d] = b.dataset.sup.split('|'); party.support[k] += +d; journal(`${PC_DATA[k].name}: Apoyo ${d > 0 ? '+1' : '−1'} (manual)`); save(); }));
  s.querySelectorAll('[data-cnt]').forEach((b) => (b.onclick = () => { const [c, d] = b.dataset.cnt.split('|'); party.counters[c] = Math.max(0, party.counters[c] + +d); save(); }));
  s.querySelectorAll('[data-st]').forEach((b) => (b.onchange = () => { const [k, f] = b.dataset.st.split('|'); if (f === 'dead') party.pcs[k].dead = b.checked; else party.pcs[k].status[f] = b.checked; save(); }));
  s.querySelectorAll('[data-item]').forEach((b) => (b.onchange = () => { party.items[b.dataset.item] = b.checked; save(); }));
  s.querySelectorAll('[data-dice]').forEach((b) => (b.onclick = () => { const n = +b.dataset.dice; const r = Array.from({ length: n }, d6); $('#diceOut').innerHTML = ` <span class="dice">${r.map((x) => DIE[x]).join('')}</span> = <b>${r.reduce((a, c) => a + c, 0)}</b>`; }));
  $('#notes').onchange = (e) => { party.notes = e.target.value; save(); };
  if ($('#sideCure')) $('#sideCure').onclick = sideCure;
}
function statusToggle(k, f, label, top) {
  const v = top ? party.pcs[k][f] : party.pcs[k].status[f];
  return `<label class="stt ${v ? 'on' : ''}"><input type="checkbox" data-st="${k}|${f}" ${v ? 'checked' : ''}>${label}</label>`;
}
async function sideCure() {
  const st = party.pcs.C;
  const tgts = ['S', 'C'].filter((k) => !party.pcs[k].dead);
  const t = await ask('Curar Heridas (fuera de combate)', 'Elige a quién curar. Cuesta 3 PM (o de una Piedra Mako).',
    [...tgts.map((k) => ({ label: `${PC_DATA[k].icon} ${PC_DATA[k].name} (${party.pcs[k].hp}/${PC_DATA[k].hp})`, value: k })), ...(st.mako.length ? tgts.map((k) => ({ label: `${PC_DATA[k].name} usando Piedra Mako`, value: k + '*' })) : []), { label: 'Cancelar', value: null }]);
  if (!t) return;
  const k = t[0], mako = t.endsWith('*');
  let cost = 3;
  if (mako) { const i = st.mako.indexOf(Math.max(...st.mako)); const take = Math.min(st.mako[i], 3); st.mako[i] -= take; cost -= take; if (st.mako[i] <= 0) st.mako.splice(i, 1); }
  if (st.mp < cost) return toast('No hay PM suficientes.');
  st.mp -= cost;
  const r = r2d();
  const cast = r.fumble ? 'pifia' : r.s + 6;
  if (r.fumble) { save(); return toast('Pifia en el lanzamiento: el conjuro falla.'); }
  const pr = powerRoll(10, 10, false);
  const heal = pr.fumble ? 0 : pr.total + 6;
  const tt = party.pcs[k]; tt.hp = Math.min(PC_DATA[k].hp, tt.hp + heal);
  journal(`Curar Heridas a ${PC_DATA[k].name}: +${heal} PV`);
  save(); toast(`${PC_DATA[k].name} recupera ${heal} PV (lanzamiento ${cast}).`);
}

// ------- secciones de manual -------
function renderManual(main, items, title) {
  let h = `<article class="manual"><h1>${title}</h1>`;
  let toc = [];
  items.forEach((x, i) => {
    if (x.page !== undefined) return;
    if (x.img) { h += `<figure><img src="${x.img}" loading="lazy" alt=""></figure>`; return; }
    if (typeof x.h === 'string') { if (!x.h) return; const lvl = Math.min(4, (x.lvl || 2) + 1); const aid = 'm' + i; if (lvl <= 3) toc.push(`<a href="#${aid}" class="l${lvl}">${esc(x.h)}</a>`); h += `<h${lvl} id="${aid}">${fmt(x.h)}</h${lvl}>`; }
    else if (x.t !== undefined) h += `<p>${fmt(x.t)}</p>`;
    else if (x.table) h += `<table>${x.table.map((r, ri) => `<tr>${r.map((c) => (ri === 0 ? `<th>${fmt(String(c))}</th>` : `<td>${fmt(String(c))}</td>`)).join('')}</tr>`).join('')}</table>`;
    else if (x.img) h += `<figure><img src="${x.img}" loading="lazy" alt=""></figure>`;
  });
  h += `</article>`;
  main.innerHTML = `<nav class="toc">${toc.join('')}</nav>` + h;
  if (view === 'intro' && party.current === 'START') main.insertAdjacentHTML('beforeend', `<div class="navrow"><button class="btn primary big" id="goB1">Comenzar el Bloque 1 →</button></div>`);
  if ($('#goB1')) $('#goB1').onclick = () => goTo('B1:1-1');
}
function renderBestiary(main) {
  main.innerHTML = `<article class="manual"><h1>Bestiario</h1><p class="muted">Datos simplificados de los enemigos (valores fijos entre paréntesis en el libro). En modo solitario sus PV y PM máximos se reducen a la mitad.</p>
  ${Object.entries(MONSTERS).filter(([, m]) => !m.object).map(([k, m]) => `<div class="mon card"><h3><span class="lvl">${m.lvl}</span> ${m.name}</h3>
    <table><tr><th>Precisión</th><th>Daño</th><th>Evasión</th><th>Defensa</th><th>PV</th><th>PM</th><th>Iniciativa</th><th>Fortaleza</th><th>Voluntad</th></tr>
    <tr><td>${m.acc - 7}(${m.acc})</td><td>2d+${m.dmg}</td><td>${m.eva - 7}(${m.eva})</td><td>${m.def}</td><td>${m.hp}</td><td>${m.mp || '—'}</td><td>${m.init}</td><td>${m.fort - 7}(${m.fort})</td><td>${m.will - 7}(${m.will})</td></tr></table>
    <p><b>Reputación/Debilidad:</b> ${m.noWeak ? m.weak + '/—' : '?/' + m.weak} · <b>Punto débil:</b> ${m.wpText || 'Ninguno'}</p>
    ${m.skills.length ? `<ul>${m.skills.map((s) => `<li>${fmt(s)}</li>`).join('')}</ul>` : '<p class="muted">Sin habilidades únicas.</p>'}</div>`).join('')}</article>`;
}
function renderSheets(main) {
  main.innerHTML = `<article class="manual"><h1>Fichas de personaje</h1>${['S', 'C'].map((k) => {
    const P = PC_DATA[k];
    return `<div class="sheet card"><div class="sh-top"><img src="${P.portrait}" alt=""><div><h2>${P.icon} ${P.full}</h2><p class="subtitle">“${P.title}”</p>
      <p>${P.race}, ${P.age} años · Nivel de aventurero ${P.level}</p>
      <p>${P.classes.map(([c, l]) => `${c} ${l}`).join(' · ')}</p></div></div>
      <table><tr>${Object.keys(P.abil).map((a) => `<th>${a}</th>`).join('')}</tr><tr>${Object.values(P.abil).map(([v, m]) => `<td>${v} <small>(+${m})</small></td>`).join('')}</tr></table>
      <table><tr><th>PV</th><th>PM</th><th>Precisión</th><th>Evasión</th><th>Defensa</th><th>Fortaleza</th><th>Voluntad</th>${P.magic ? '<th>Poder Mágico</th>' : ''}${P.mk ? '<th>Con. Monstruos</th>' : ''}</tr>
      <tr><td>${P.hp}</td><td>${P.mp}</td><td>${P.acc}</td><td>${P.eva}</td><td>${P.def}</td><td>${P.fort}</td><td>${P.will}</td>${P.magic ? `<td>${P.magic}</td>` : ''}${P.mk ? `<td>${P.mk}</td>` : ''}</tr></table>
      <h4>Armas</h4><table><tr><th>Arma</th><th>Poder</th><th>2–12</th><th>Crítico</th><th>Daño extra</th></tr>${Object.values(P.weapons).map((w) => `<tr><td>${w.name}</td><td>${w.power}</td><td>${POWER[w.power].slice(2).map((x) => (x === null ? '*' : x)).join(' ')}</td><td>${w.crit}</td><td>+${w.dmg}</td></tr>`).join('')}</table>
      <p><b>Protección:</b> ${P.armor}</p>
      <p><b>Dotes de combate:</b> ${P.feats.map(fmt).join(', ')}</p>
      ${P.techniques.length ? `<p><b>Técnicas:</b> ${Object.values(TECHNIQUES).map((t) => `${fmt(t.name)} — ${t.desc}`).join('<br>')}</p>` : ''}
      ${P.stunts.length ? `<p><b>Proezas:</b> ${P.stunts.map(fmt).join('')}</p>` : ''}
      ${k === 'C' ? `<p><b>Magia Divina (Kilhia):</b><br>${Object.values(SPELLS).map((s) => `${fmt(s.name)} (${s.mp} PM) — ${s.desc}`).join('<br>')}<br>[Penetrar] (2 PM, en la preparación: +2 a Conocimiento de Monstruos) · [Cordura] · [Detectar Fe] · [Curar Ceguera]</p>` : ''}
      <p><b>Consumibles iniciales:</b> 4 Piedras Mako (${P.items0.mako[0]} PM c/u), Amuleto Solar +1 y +2, Amuleto Lunar +1 y +2, 1 Poción de Despertar.</p>
      <p class="muted">${P.gear}</p>
      <details><summary>Ver la ficha original</summary><img src="${P.sheet}" alt="" style="max-width:100%"></details></div>`;
  }).join('')}
  <div class="card"><h2>👤 Gamble</h2><p>Escudero y espía veterano. Explorador: Iniciativa 7; sus valores base para otras pruebas aparecen en el texto con el icono 👤. No combate.</p></div></article>`;
}
function renderJournal(main) {
  const hist = party.history.slice(-200).reverse();
  main.innerHTML = `<article class="manual"><h1>Diario y partida</h1>
    <div class="card"><h3>Partida</h3><p>Modo: ${party.mode === 'duo' ? 'dos jugadores' : 'solitario (' + PC_DATA[party.solo].name + ')'}${party.challenge ? ' · Modo Desafío' : ''}</p>
      <div class="row"><button class="btn" id="exp">Exportar partida (.json)</button><label class="btn">Importar<input type="file" id="imp" accept=".json" hidden></label><button class="btn ghost" id="newgame">Nueva partida</button></div></div>
    <div class="card"><h3>Recorrido (${party.history.length} párrafos)</h3><div class="hist">${hist.map((id) => `<span class="pill">${id === 'START' ? 'Inicio' : labelOf(id).replace('·', '')} <small>${id.split(':')[0]}</small></span>`).join(' ')}</div></div>
    <div class="card"><h3>Registro</h3>${party.journal.slice().reverse().map((j) => `<div class="jl"><small>${esc(j.at)}</small> ${fmt(j.t)}</div>`).join('') || '<p class="muted">Sin entradas.</p>'}</div></article>`;
  $('#exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(party, null, 1)], { type: 'application/json' })); a.download = 'duo-adventure-partida.json'; a.click(); };
  $('#imp').onchange = (e) => { const f = e.target.files[0]; if (!f) return; f.text().then((t) => { party = JSON.parse(t); save(); view = 'book'; render(); toast('Partida importada.'); }); };
  $('#newgame').onclick = () => { renderStart(); };
}

// ------- arranque -------
function appInit() {
  document.querySelectorAll('.nav button').forEach((b) => (b.onclick = () => { if (!party) return; view = b.dataset.view; render(); window.scrollTo(0, 0); }));
  $('#sideToggle').onclick = () => document.body.classList.toggle('side-open');
  party = null;
  renderStart();
}
window.addEventListener('DOMContentLoaded', () => { if (typeof BOOK !== 'undefined') appInit(); });
