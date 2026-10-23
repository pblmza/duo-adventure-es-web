// Motor de combate simplificado de Sword World 2.5 (Duo Adventure)
'use strict';

const AREA_NAME = { AR: 'Retaguardia aliada', F: 'Vanguardia', ER: 'Retaguardia enemiga' };
const AREA_IDX = { AR: 0, F: 1, ER: 2 };
const IDX_AREA = ['AR', 'F', 'ER'];
let CB = null; // estado del combate en curso

// ---------- utilidades ----------
const d6 = () => 1 + Math.floor(Math.random() * 6);
const r2d = () => { const a = d6(), b = d6(); return { a, b, s: a + b, crit: a === 6 && b === 6, fumble: a === 1 && b === 1 }; };
const diceTxt = (r) => `<span class="dice">${DIE[r.a]}${DIE[r.b]}</span>`;
const DIE = [null, '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sgn = (n) => (n >= 0 ? '+' + n : '' + n);

function log(html, cls = '') {
  if (!CB) return;
  CB.log.push(`<div class="lg ${cls}">${html}</div>`);
  renderLog();
}

// ---------- unidades ----------
function mkPC(k) {
  const P = PC_DATA[k], st = party.pcs[k];
  return {
    uid: 'pc' + k, side: 'pc', key: k, name: P.name, icon: P.icon, data: P,
    hp: st.hp, mhp: P.hp, mp: st.mp, mmp: P.mp, area: 'AR', effects: [], status: 'ok',
    stance: '1H', acted: false, prone: false,
  };
}
function mkEnemy(key, n, mods = {}) {
  const M = MONSTERS[key];
  let mhp = M.hp + (mods.hp || 0), mmp = M.mp + (mods.mp || 0);
  if (party.mode === 'solo' && !M.object && !CB.cfg.noHalve) { mhp = Math.ceil(mhp / 2); mmp = Math.ceil(mmp / 2); }
  const u = {
    uid: 'en' + key + n, side: 'en', key, name: M.name + (n > 1 || CB.countOf[key] > 1 ? ' ' + 'ABCDE'[n - 1] : ''), data: M,
    hp: mhp, mhp, mp: mmp, mmp, area: 'ER', effects: [], status: 'ok', acted: false, dmgBonus: mods.dmg || 0,
  };
  return u;
}
const alive = (u) => u.status === 'ok';
const pcs = () => CB.units.filter((u) => u.side === 'pc');
const ens = () => CB.units.filter((u) => u.side === 'en');
const inArea = (area, side) => CB.units.filter((u) => u.area === area && alive(u) && (!side || u.side === side));
const skirmish = (area) => inArea(area, 'pc').length > 0 && inArea(area, 'en').filter((u) => !u.data.object || true).length > 0;
const dist = (a, b) => Math.abs(AREA_IDX[a] - AREA_IDX[b]);

function effSum(u, field) {
  let s = 0;
  for (const e of u.effects) if (e.mods && e.mods[field]) s += e.mods[field];
  return s;
}
function hasEff(u, id) { return u.effects.some((e) => e.id === id); }
function addEff(u, e) { u.effects = u.effects.filter((x) => x.id !== e.id); u.effects.push(e); }
function rmEff(u, id) { u.effects = u.effects.filter((x) => x.id !== id); }

// ---- valores derivados de los PJ ----
function kingsbladeOn() { return party.pcs.S.status.kingsblade && CB.units.some((u) => u.key === 'S' && alive(u)); }
function pcWeapon(u) {
  const W = { ...u.data.weapons[u.stance] };
  if (u.key === 'S' && party.pcs.S.status.kingsblade) { W.name = '<Espada del Rey> ' + (u.stance === '2H' ? '(dos manos)' : '(una mano)'); W.dmg += 1; W.magic = true; }
  if (party.pcs[u.key].status.magicWeapon) W.magic = true;
  return W;
}
function pcAcc(u) {
  let a = u.data.acc + effSum(u, 'acc') + effSum(u, 'all');
  if (u.key === 'S' && party.pcs.S.status.kingsblade) a += 1;
  if (kingsbladeOn()) a += 1;
  return a;
}
function pcEva(u) {
  let e = u.data.eva + effSum(u, 'eva') + effSum(u, 'all');
  if (party.pcs[u.key].status.gas) e -= 1;
  return e;
}
function pcDef(u) {
  let d = u.data.def + effSum(u, 'def');
  if (u.stance === '2H') d += u.data.weapons['2H'].defMod;
  return d;
}
function dmgReduction(u, type) {
  let r = 0;
  for (const e of u.effects) {
    if (e.mods && e.mods.taken) r += e.mods.taken;
    if (e.fieldRes && e.fieldRes === type) r += 3;
  }
  return r;
}
// ---- monstruos ----
const enAcc = (u) => u.data.acc + effSum(u, 'acc');
const enEva = (u) => u.data.eva + effSum(u, 'eva');

// ---------- pruebas con dados ----------
// Prueba de resistencia de un PJ con opción de romper amuleto.
async function pcResist(u, kind, tn) { // kind: 'fort' | 'will'
  const sv = u.data[kind];
  const r = r2d();
  let total = r.s + sv;
  let ok = r.crit ? true : r.fumble ? false : total >= tn;
  const label = kind === 'fort' ? 'Fortaleza' : 'Voluntad';
  log(`${u.icon} ${u.name}: ${label} ${diceTxt(r)} ${sgn(sv)} = <b>${r.fumble ? 'pifia' : total}</b> vs ${tn} → ${ok ? '<span class="ok">resiste</span>' : '<span class="ko">falla</span>'}`);
  if (!ok && !r.fumble) {
    const pool = party.pcs[u.key][kind === 'fort' ? 'sun' : 'moon'];
    const need = tn - total;
    const opts = pool.filter((v) => v >= need);
    if (opts.length) {
      const nm = kind === 'fort' ? 'Amuleto Solar' : 'Amuleto Lunar';
      const v = await ask(`${u.icon} ${u.name} falló por ${need}`, `Puede romper un <${nm}> para sumar su bono a la ${label}.`,
        [...[...new Set(opts)].map((x) => ({ label: `Romper <${nm} +${x}>`, value: x })), { label: 'No usarlo', value: 0 }]);
      if (v) {
        pool.splice(pool.indexOf(v), 1);
        total += v; ok = total >= tn;
        log(`${u.icon} rompe <${nm} +${v}> → ${total} ${ok ? '<span class="ok">resiste</span>' : '<span class="ko">sigue fallando</span>'}`);
      }
    }
  }
  return ok;
}

function powerRoll(power, crit, allowCrit, noCritAtAll) {
  const T = POWER[power];
  let r = r2d(); let parts = [diceTxt(r)];
  if (r.fumble) return { total: 0, txt: parts.join(' ') + ' (pifia: sin daño)', fumble: true };
  let sum = T[r.s]; let crits = 0;
  while (allowCrit && !noCritAtAll && r.s >= crit) {
    crits++; r = r2d(); parts.push(diceTxt(r));
    if (r.fumble) break;
    sum += T[r.s];
  }
  return { total: sum, txt: parts.join(' ') + (crits ? ` <span class="crit">¡crítico ×${crits}!</span>` : ''), crits };
}

// ---------- aplicar daño ----------
async function damagePC(u, n, src) {
  if (n <= 0) { log(`${u.icon} ${u.name} no sufre daño.`); return; }
  const before = u.hp;
  u.hp -= n;
  log(`${u.icon} <b>${u.name}</b> recibe <b class="ko">${n}</b> de daño (${src}) → PV ${u.hp}/${u.mhp}`);
  if (u.hp <= 0) await deathCheck(u, before > 0);
  renderCombat();
}
async function deathCheck(u, first) {
  if (u.status === 'dead') return;
  const r = r2d();
  const total = r.s + u.data.death + u.hp;
  if (r.crit) {
    u.hp = 1; u.status = 'ok'; u.prone = false;
    log(`${u.icon} Prueba de muerte ${diceTxt(r)}: <span class="ok">¡éxito automático! ${u.name} vuelve en sí con 1 PV.</span>`, 'big');
    return;
  }
  if (r.fumble || total < 0) {
    u.status = 'dead';
    log(`${u.icon} Prueba de muerte ${diceTxt(r)} ${sgn(u.data.death)} ${sgn(u.hp)} = ${r.fumble ? 'pifia' : total} → <span class="ko">☠ ${u.name} ha muerto.</span>`, 'big');
  } else {
    u.status = 'unc'; u.prone = true;
    log(`${u.icon} Prueba de muerte ${diceTxt(r)} ${sgn(u.data.death)} ${sgn(u.hp)} = ${total} → ${u.name} queda <b>inconsciente</b>.`);
  }
}
async function damageEnemy(u, n, src, by) {
  if (n <= 0) { log(`${u.name} no sufre daño.`); return; }
  u.hp -= n;
  log(`<b>${u.name}</b> recibe <b class="okd">${n}</b> de daño (${src}) → PV ${u.hp}/${u.mhp}`);
  if (CB.cfg.special === 'ledraLux' && u.key === 'ledra' && u.hp <= -15 && !CB.flags.luxDead) {
    CB.flags.luxDead = by ? by.name : '?';
    log(`☠ El golpe fue demasiado: <b>Lux muere</b> junto con el Daemon (golpe final de ${CB.flags.luxDead}).`, 'big ko');
  }
  if (u.data.splatter && u.hp > 0 && u.hp <= u.data.splatter && u.status === 'ok') {
    const dmg = u.hp; u.hp = 0; u.status = 'dead';
    log(`💥 ¡${u.name} estalla! Inflige ${dmg} de daño físico a todos en ${AREA_NAME[u.area]}.`, 'big');
    for (const t of inArea(u.area)) {
      if (t === u) continue;
      if (t.side === 'pc') await damagePC(t, Math.max(0, dmg - pcDef(t) - dmgReduction(t, 'phys')), 'estallido');
      else await damageEnemy(t, Math.max(0, dmg - t.data.def), 'estallido');
    }
  }
  if (u.data.surrender && u.hp > 0 && u.hp < u.data.surrender && u.status === 'ok') {
    u.status = 'fled'; log(`🏳 ${u.name} se rinde.`, 'big');
  }
  if (CB.cfg.special === 'duel' && u.key === 'knight' && u.hp <= 10 && u.status === 'ok') {
    u.status = 'fled'; log(`🏳 El caballero baja la espada: el duelo ha terminado.`, 'big');
  }
  if (u.hp <= 0 && u.status === 'ok') { u.status = 'dead'; log(`✖ ${u.name} cae derrotado.`, 'big'); }
  renderCombat();
}

// ---------- ataques de monstruos ----------
async function enemyMelee(u, t, opts = {}) {
  if (!alive(t) && t.status !== 'unc') return;
  const acc = enAcc(u);
  const r = r2d();
  const sv = pcEva(t);
  const total = r.s + sv;
  let evaded;
  if (r.fumble) evaded = false; else if (r.crit) evaded = true; else evaded = total >= acc;
  if (hasEff(u, 'cower')) evaded = true;
  const wname = opts.weapon || u.data.weapon || 'arma';
  log(`⚔ ${u.name} ataca a ${t.icon} ${t.name} (${wname}, Precisión ${acc}). Evasión ${diceTxt(r)} ${sgn(sv)} = ${r.fumble ? 'pifia' : total} → ${evaded ? '<span class="ok">esquiva</span>' : '<span class="ko">impacto</span>'}`);
  if (evaded) return false;
  const dr = r2d();
  let fire = hasEff(u, 'fireweapon');
  let raw = dr.s + u.data.dmg + (u.dmgBonus || 0) + (fire ? 2 : 0);
  const def = pcDef(t), red = dmgReduction(t, fire ? 'Fuego' : 'phys');
  const n = Math.max(0, raw - def - red);
  log(`&nbsp;&nbsp;Daño ${diceTxt(dr)} +${u.data.dmg + (u.dmgBonus || 0) + (fire ? 2 : 0)} = ${raw} − Defensa ${def}${red ? ' − ' + red : ''} = <b>${n}</b>${fire ? ' (fuego)' : ''}`);
  await damagePC(t, n, wname);
  if (u.key === 'genanthus' && !u.usedVamp && u.hp < u.mhp / 2 && n > 0) {
    u.usedVamp = true; u.hp = Math.min(u.mhp, u.hp + n);
    log(`🩸 Aguijón vampírico: Genanthus recupera ${n} PV (${u.hp}/${u.mhp}).`);
  }
  if (CB.cfg.poisonOnHit && n >= 1 && alive(t) && !party.pcs[t.key].status.envenenado) {
    const ok = await pcResist(t, 'fort', CB.cfg.poisonOnHit.tn);
    if (!ok) { party.pcs[t.key].status.envenenado = true; log(`☣ ${t.name} queda <b>envenenado</b> (sin efecto en este combate; queda anotado).`); }
  }
  return true;
}
async function enemyBow(u, t) {
  const hit = await enemyMelee(u, t, { weapon: 'arco' });
  if (hit && alive(t) && !hasEff(t, 'phyto')) {
    const ok = await pcResist(t, 'fort', 13);
    if (!ok) { addEff(t, { id: 'phyto', name: 'Fitotoxina', owner: t.uid, rounds: 18, mods: { eva: -2 }, poison: 13 }); log(`☣ ${t.name}: −2 a la Evasión (fitotoxina).`); }
  }
}
async function enemySpell(u, targets, sp, label, type) {
  for (const t of targets) {
    const ok = await pcResist(t, 'will', sp.fixed);
    const pr = powerRoll(sp.power, 10, !ok);
    let raw = pr.fumble ? 0 : pr.total + sp.bonus;
    let n = ok ? Math.ceil(raw / 2) : raw;
    const red = dmgReduction(t, type || 'magic');
    n = Math.max(0, n - red);
    log(`✨ ${u.name} lanza ${label} contra ${t.icon} ${t.name}: Poder ${sp.power} ${pr.txt} +${sp.bonus}${ok ? ' (mitad)' : ''}${red ? ' − ' + red : ''} = <b>${n}</b> de daño mágico`);
    await damagePC(t, n, label);
    if (checkEnd()) return;
  }
}

// ---------- IA de monstruos ----------
function forwardOf(area) { return area === 'ER' ? 'F' : area === 'F' ? 'AR' : null; }
function pcTargetsIn(area) { return inArea(area, 'pc'); }
function pcTargetsWithin(u, range) { return pcs().filter((t) => alive(t) && dist(u.area, t.area) <= range); }
async function moveForward(u) {
  if (skirmish(u.area)) return false;
  const nx = forwardOf(u.area);
  if (!nx) return false;
  // no se puede saltar a la retaguardia aliada si la vanguardia tiene PJ (ya sería refriega en F)
  u.area = nx; log(`↪ ${u.name} avanza a ${AREA_NAME[nx]}.`); renderCombat(); return true;
}
async function aiMelee(u, count) {
  let ts = pcTargetsIn(u.area);
  if (!ts.length) { await moveForward(u); ts = pcTargetsIn(u.area); }
  if (!ts.length) { log(`${u.name} no encuentra a quién atacar.`); return; }
  const n = count || u.data.attacks || 1;
  const fixed = u.data.sameTarget ? pick(ts) : null;
  for (let i = 0; i < n; i++) {
    ts = pcTargetsIn(u.area); if (!ts.length) break;
    await enemyMelee(u, fixed && alive(fixed) ? fixed : pick(ts));
    await sleep(350);
    if (checkEnd()) return;
  }
}
async function enemyTurn(u) {
  const M = u.data;
  if (M.ai === 'none') return;
  if (hasEff(u, 'cower')) { log(`${u.name} está paralizado de miedo y pierde el turno.`); return; }
  switch (M.ai) {
    case 'melee': return aiMelee(u);
    case 'duel': {
      const s = CB.units.find((x) => x.key === 'S');
      if (!s || !alive(s)) return;
      if (s.area !== u.area) await moveForward(u);
      if (s.area === u.area) await enemyMelee(u, s);
      return;
    }
    case 'archer': {
      const s = CB.units.find((x) => x.key === 'S' && alive(x));
      const t = s || pick(pcs().filter(alive));
      if (t) await enemyBow(u, t);
      return;
    }
    case 'caster': {
      const ts = pcTargetsWithin(u, 1);
      const sp = M.force;
      if (u.mp >= sp.mp && ts.length) {
        const k = Math.min(ts.length, Math.floor(u.mp / sp.mp));
        const chosen = ts.sort(() => Math.random() - 0.5).slice(0, k);
        u.mp -= sp.mp * k; return enemySpell(u, chosen, sp, '[Fuerza Espiritual]');
      }
      if (u.mp >= sp.mp && !ts.length) { await moveForward(u); return; }
      return aiMelee(u, 1);
    }
    case 'genanthus': {
      const here = pcTargetsIn(u.area);
      const sp = M.force;
      if (here.length) {
        const weak = here.filter((t) => party.pcs[t.key].status.gas || hasEff(t, 'phyto'));
        if (weak.length || u.mp < sp.mp) return enemyMelee(u, pick(weak.length ? weak : here), { weapon: 'Cola' });
      }
      const ts = pcTargetsWithin(u, 1);
      if (ts.length && u.mp >= sp.mp) {
        const k = Math.min(ts.length, Math.floor(u.mp / sp.mp));
        const chosen = ts.slice(0, k); u.mp -= sp.mp * k;
        return enemySpell(u, chosen, sp, '[Fuerza Espiritual]');
      }
      if (here.length) return enemyMelee(u, pick(here), { weapon: 'Cola' });
      log(`Genanthus aguarda en la retaguardia.`); return;
    }
    case 'ogre': {
      const sp = M.reap;
      const ts = pcTargetsWithin(u, 1);
      if (u.mp >= sp.mp && ts.length) {
        const c = ts.find((t) => t.key === 'C');
        u.mp -= sp.mp; return enemySpell(u, [c || pick(ts)], sp, 'Tajo Segador', 'slash');
      }
      let here = pcTargetsIn(u.area);
      if (!here.length) { await moveForward(u); here = pcTargetsIn(u.area); }
      if (here.length) { here.sort((a, b) => a.hp - b.hp); return enemyMelee(u, here[0]); }
      return;
    }
    case 'ledra':
    case 'dawn': {
      let here = pcTargetsIn(u.area);
      if (!here.length) {
        await moveForward(u); here = pcTargetsIn(u.area);
        if (here.length) await enemyMelee(u, pick(here));
        return;
      }
      const sp = M.ai === 'ledra' ? M.blast : M.force;
      const byDef = [...here].sort((a, b) => pcDef(b) - pcDef(a));
      const strong = byDef[0], weak = byDef[byDef.length - 1];
      if (u.mp >= sp.mp) {
        u.mp -= sp.mp;
        await enemySpell(u, [strong], sp, M.ai === 'ledra' ? 'Estallido' : '[Fuerza Espiritual]');
        if (checkEnd()) return;
        await sleep(300);
      }
      here = pcTargetsIn(u.area);
      if (here.length) await enemyMelee(u, here.includes(weak) ? weak : pick(here));
      return;
    }
    case 'heide': {
      const saber = CB.units.find((x) => x.key === 'shadowSaber' && alive(x));
      if (saber && !hasEff(saber, 'fireweapon') && u.mp >= 4 && !CB.flags.fireDone) {
        u.mp -= 4; CB.flags.fireDone = true;
        addEff(saber, { id: 'fireweapon', name: 'Arma de Fuego', owner: u.uid, rounds: 18, mods: {} });
        log(`🔥 Heide lanza Arma de Fuego sobre el Sable Sombrío: sus espadas arden (+2 de daño, fuego).`); return;
      }
      const c = CB.units.find((x) => x.key === 'C' && alive(x));
      if (c && !CB.flags.forbidDone && u.mp >= 5 && dist(u.area, c.area) <= 1) {
        u.mp -= 5; CB.flags.forbidDone = true;
        const ok = await pcResist(c, 'will', 14);
        if (!ok) { addEff(c, { id: 'forbid', name: 'Magia prohibida', owner: u.uid, rounds: 3, mods: {} }); log(`⛔ Clumen no puede usar magia durante 3 asaltos.`); }
        else log(`Clumen resiste Prohibir Magia.`);
        return;
      }
      const sp = M.force; const ts = pcTargetsWithin(u, 1);
      if (u.mp >= sp.mp && ts.length) {
        const k = Math.min(ts.length, Math.floor(u.mp / sp.mp));
        const chosen = ts.slice(0, k); u.mp -= sp.mp * k;
        return enemySpell(u, chosen, sp, '[Fuerza Espiritual]');
      }
      let here = pcTargetsIn(u.area);
      if (!here.length && !ts.length) { await moveForward(u); here = pcTargetsIn(u.area); }
      if (here.length) { here.sort((a, b) => a.hp - b.hp); return enemyMelee(u, here[0]); }
      return;
    }
  }
}

// ---------- acciones de los PJ ----------
function mpAvailable(u, useMako) {
  const st = party.pcs[u.key];
  useMako = useMako || st.mako.length > 0;
  return u.mp + (useMako && st.mako.length ? Math.max(...st.mako) : 0);
}
function payMP(u, cost, useMako) {
  const st = party.pcs[u.key];
  if (!useMako && u.mp < cost && st.mako.length) useMako = true; // faltan PM: se usa una piedra
  let fromStone = 0;
  if (useMako && st.mako.length) {
    let i = st.mako.indexOf(Math.max(...st.mako));
    fromStone = Math.min(st.mako[i], cost);
    st.mako[i] -= fromStone;
    if (st.mako[i] <= 0) st.mako.splice(i, 1);
  }
  const rest = cost - fromStone;
  if (rest > u.mp) return false;
  u.mp -= rest;
  log(`&nbsp;&nbsp;Coste: ${cost} PM${fromStone ? ` (${fromStone} de una <Piedra Mako>)` : ''}.`, 'dim');
  return true;
}
function useTechnique(u, tk, useMako, prep) {
  const T = TECHNIQUES[tk];
  if (mpAvailable(u, useMako) < T.mp) { toast('No hay PM suficientes.'); return false; }
  payMP(u, T.mp, useMako);
  const mods = tk === 'cat' ? { acc: 1 } : tk === 'bear' ? { dmg: 2 } : { def: 2 };
  addEff(u, { id: tk, name: T.name, owner: u.uid, rounds: 3, mods });
  log(`🜂 ${u.icon} ${u.name} usa ${T.name}${prep ? ' en la preparación' : ''}.`);
  renderCombat(); return true;
}

async function pcAttack(u, t, powerStrike) {
  const W = pcWeapon(u);
  const r = r2d();
  let acc = pcAcc(u) + (CB.weakFound[t.key] && t.data.wp.acc ? t.data.wp.acc : 0);
  const total = r.s + acc;
  const eva = enEva(t);
  let hit = r.crit ? true : r.fumble ? false : (t.data.object || hasEff(t, 'cower')) ? true : total > eva;
  if (powerStrike) addEff(u, { id: 'ps', name: 'Golpe Poderoso (−2 Eva)', untilOwn: true, mods: { eva: -2 } });
  log(`⚔ ${u.icon} ${u.name} ataca a ${t.name}${powerStrike ? ' con [Golpe Poderoso I]' : ''}: ${diceTxt(r)} ${sgn(acc)} = <b>${r.fumble ? 'pifia' : r.crit ? '¡6-6!' : total}</b> vs Evasión ${t.data.object ? '—' : eva} → ${hit ? '<span class="ok">impacto</span>' : '<span class="ko">falla</span>'}`);
  if (!hit) return;
  if (t.data.normalImmune && !W.magic) { log(`&nbsp;&nbsp;El arma atraviesa la niebla sin efecto: ${t.name} es inmune a las armas normales.`); return; }
  const noCrit = t.data.boneBody && W.edged;
  const pr = powerRoll(W.power, W.crit, true, noCrit);
  if (pr.fumble) { log(`&nbsp;&nbsp;Daño: ${pr.txt}`); return; }
  let extra = W.dmg + effSum(u, 'dmg') + (powerStrike ? 4 : 0) + (CB.weakFound[t.key] && t.data.wp.phys ? t.data.wp.phys : 0);
  const raw = pr.total + extra;
  const n = Math.max(0, raw - t.data.def);
  log(`&nbsp;&nbsp;Daño: Poder ${W.power} ${pr.txt}${noCrit ? ' (cuerpo de hueso: sin críticos)' : ''} = ${pr.total} +${extra} = ${raw} − Defensa ${t.data.def} = <b>${n}</b>`);
  await damageEnemy(t, n, 'arma', u);
}

async function pcCast(u, spellKey, targets, opts) {
  const S = SPELLS[spellKey];
  const nT = S.multi ? Math.max(1, targets.length) : 1;
  const cost = S.mp * nT;
  if (mpAvailable(u, opts.mako) < cost) { toast('No hay PM suficientes.'); return false; }
  payMP(u, cost, opts.mako);
  const r = r2d();
  const sv = u.data.magic + effSum(u, 'all');
  const succ = r.s + sv;
  log(`✨ ${u.icon} ${u.name} lanza ${S.name}${nT > 1 ? ` sobre ${nT} objetivos ([Metamagia/Objetivos])` : ''}: ${diceTxt(r)} ${sgn(sv)} = <b>${r.fumble ? 'pifia' : succ}</b>`);
  if (r.fumble) { log('&nbsp;&nbsp;El conjuro falla (pifia).', 'ko'); return true; }
  const autoS = r.crit;
  switch (spellKey) {
    case 'force':
      for (let t of targets) {
        // disparo errado
        if (skirmish(t.area) && u.area !== t.area) {
          const pool = inArea(t.area);
          const nt = pick(pool);
          if (nt !== t) log(`&nbsp;&nbsp;🎯 Disparo errado hacia una refriega: el proyectil alcanza a ${nt.name}.`);
          t = nt;
        }
        if (t.side === 'pc') {
          const ok = await pcResist(t, 'will', succ);
          const pr = powerRoll(10, 10, !ok);
          let n = pr.fumble ? 0 : pr.total + u.data.magic; if (ok) n = Math.ceil(n / 2);
          n = Math.max(0, n - dmgReduction(t, 'magic'));
          log(`&nbsp;&nbsp;Daño: ${pr.txt} = <b>${n}</b>`); await damagePC(t, n, S.name); continue;
        }
        const resisted = !autoS && t.data.will >= succ;
        const pr = powerRoll(10, 10, !resisted);
        let n = pr.fumble ? 0 : pr.total + u.data.magic;
        if (resisted) n = Math.ceil(n / 2);
        if (CB.weakFound[t.key] && t.data.wp.magic) n += t.data.wp.magic;
        log(`&nbsp;&nbsp;${t.name}: Voluntad ${t.data.will} → ${resisted ? 'resiste (mitad)' : 'no resiste'}. Daño: Poder 10 ${pr.txt} +${u.data.magic} = <b>${n}</b>`);
        await damageEnemy(t, n, S.name, u);
      }
      break;
    case 'cure':
      for (const t of targets) {
        const pr = powerRoll(10, 10, false);
        let n = pr.fumble ? 0 : pr.total + u.data.magic;
        if (t.side === 'en') {
          if (t.data.cat !== 'undead') { log(`&nbsp;&nbsp;No tiene efecto sobre ${t.name}.`); continue; }
          const resisted = !autoS && t.data.will >= succ;
          if (resisted) { log(`&nbsp;&nbsp;${t.name} resiste.`); continue; }
          if (CB.weakFound[t.key] && t.data.wp.heal) n += t.data.wp.heal;
          log(`&nbsp;&nbsp;La luz sagrada quema al no-muerto: ${pr.txt} +${u.data.magic} = <b>${n}</b>`);
          await damageEnemy(t, n, S.name, u); continue;
        }
        const old = t.hp; t.hp = Math.min(t.mhp, t.hp + n);
        log(`&nbsp;&nbsp;${t.icon} ${t.name} recupera ${t.hp - old} PV (${pr.txt} +${u.data.magic}) → ${t.hp}/${t.mhp}${t.status === 'unc' ? ' (sigue inconsciente)' : ''}`);
      }
      break;
    case 'field':
      for (const t of inArea(u.area, 'pc').concat(pcs().filter((x) => x.area === u.area && x.status === 'unc'))) {
        addEff(t, { id: 'field', name: 'Campo Protector', owner: u.uid, rounds: 18, mods: { taken: 1 } });
      }
      log(`&nbsp;&nbsp;Un círculo de protección cubre ${AREA_NAME[u.area]}: −1 al daño recibido.`); break;
    case 'fieldres': {
      const type = opts.type || 'Fuego';
      for (const t of pcs().filter((x) => x.area === u.area && x.status !== 'dead')) addEff(t, { id: 'fieldres', name: 'Campo de Resistencia (' + type + ')', owner: u.uid, rounds: 18, fieldRes: type });
      log(`&nbsp;&nbsp;Campo de Resistencia contra ${type}: −3 a ese daño.`); break;
    }
    case 'banish': {
      const area = opts.area;
      for (const t of inArea(area, 'en')) {
        if (!['barbarous', 'undead'].includes(t.data.cat)) { log(`&nbsp;&nbsp;${t.name} no es Bárbaro ni No-muerto: sin efecto.`); continue; }
        const resisted = !autoS && t.data.will >= succ;
        if (resisted) { log(`&nbsp;&nbsp;${t.name} resiste (Voluntad ${t.data.will}).`); continue; }
        const rr = r2d(); const row = BANISH_TABLE.find((x) => rr.s >= x.r[0] && rr.s <= x.r[1]);
        const mods = row.eff.cower ? {} : row.eff;
        addEff(t, { id: row.eff.cower ? 'cower' : 'banish', name: row.name, owner: u.uid, rounds: row.rounds, mods: row.eff.cower ? {} : mods });
        if (row.eff.cower) rmEff(t, 'banish');
        log(`&nbsp;&nbsp;${t.name}: tabla ${diceTxt(rr)} → <b>${row.name}</b>: ${row.desc}`);
      }
      break;
    }
    case 'awaken':
      for (const t of targets) {
        if (t.status !== 'unc') { log(`&nbsp;&nbsp;${t.name} no está inconsciente.`); continue; }
        if (t.hp < 1) t.hp = 1; t.status = 'ok'; t.prone = true;
        log(`&nbsp;&nbsp;${t.icon} ${t.name} despierta con ${t.hp} PV (derribado).`);
      }
      break;
    case 'curepoison':
      for (const t of targets) {
        let done = false;
        const ph = t.effects.find((e) => e.poison);
        if (ph && (autoS || succ > ph.poison)) { rmEff(t, ph.id); done = true; log(`&nbsp;&nbsp;Se elimina ${ph.name} de ${t.name}.`); }
        const st = party.pcs[t.key].status;
        if (st.gas && (autoS || succ > 12)) { st.gas = false; done = true; log(`&nbsp;&nbsp;${t.name} se libera del gas (−1 Evasión).`); }
        if (st.envenenado && (autoS || succ > 13)) { st.envenenado = false; done = true; log(`&nbsp;&nbsp;${t.name} ya no está envenenado.`); }
        if (!done) log(`&nbsp;&nbsp;No hay veneno que eliminar (o la prueba no supera su valor).`);
      }
      break;
  }
  renderCombat();
  return true;
}

// ---------- flujo del combate ----------
function startCombatFor(nodeId) {
  let cfg = COMBATS[nodeId];
  if (cfg.ref) cfg = COMBATS[cfg.ref];
  cfg = { ...cfg };
  CB = { nodeId, cfg, units: [], log: [], round: 0, weakFound: {}, flags: {}, phase: null, order: [], turn: null, countOf: {}, done: false, prep: {} };
  openCombatSetup();
}

function participatingPCs() {
  const ks = party.mode === 'solo' ? [party.solo] : ['S', 'C'];
  if (CB.cfg.special === 'duel' && party.mode === 'solo' && party.solo === 'C') ks.unshift('S');
  return ks.filter((k) => !party.pcs[k].dead);
}

function openCombatSetup() {
  const cfg = CB.cfg; const ov = $('#combat');
  ov.classList.add('open');
  const hist = party.history;
  const prev = hist[hist.length - 2];
  // composición
  let comp = cfg.basic.map(([k, n]) => [k, n]);
  const toggles = [];
  if (cfg.special === 'b2lair') {
    toggles.push({ id: 'huglDead', label: '¿Derrotaron al Hugl Atacante en el Escenario 1? (lo reemplaza un Bolg Soldado)', def: hist.includes('B2:1-5') });
    toggles.push({ id: 'villagers', label: '¿Pelean junto a los aldeanos? (se encargan de un Bolg Soldado; muere uno por asalto desde el 4.º)', def: false });
    toggles.push({ id: 'surprise', label: '¿Ataque de día con sorpresa? (ganan la iniciativa y los enemigos tienen −2 hasta su primer turno)', def: false });
  }
  if (cfg.special === 'dylan') toggles.push({ id: 'dylan', label: '¿El capitán Dylan los acompañó a la torre? (se encarga de un Caballero Ghast)', def: false });
  if (cfg.special === 'ledraClocks') toggles.push({ id: 'clocks5', label: `¿Tienen 5 o más [Relojes]? (Ledra +25 PV y +2 de daño) — llevan ${party.counters['Relojes'] || 0}`, def: (party.counters['Relojes'] || 0) >= 5 });
  if (cfg.mkAsk) toggles.push({ id: 'mkFromText', label: '¿Clumen ya detectó el punto débil en 1-11? (si no lo marcas, se tira ahora)', def: false });
  const ks = participatingPCs();
  const S = ks.includes('S'), C = ks.includes('C');
  const stS = party.pcs.S, stC = party.pcs.C;
  ov.innerHTML = `<div class="cb-setup">
    <h2>⚔ ${cfg.title}</h2>
    <p class="muted">Participan: ${ks.map((k) => PC_DATA[k].icon + ' ' + PC_DATA[k].name).join(' y ')}${party.mode === 'solo' ? ' · Modo solitario: los enemigos tienen la mitad de PV y PM.' : ''}</p>
    <h3>Composición básica</h3>
    <ul>${comp.map(([k, n]) => `<li>${MONSTERS[k].name} ×${n}</li>`).join('')}</ul>
    ${toggles.map((t) => `<label class="tg"><input type="checkbox" id="tg_${t.id}" ${t.def ? 'checked' : ''}> ${t.label}</label>`).join('')}
    <h3>Preparación del combate</h3>
    ${S ? `<label class="tg"><input type="checkbox" id="prep_beetle"> ☀ Shyraes usa [Piel de Escarabajo] (3 PM; tiene ${stS.mp})</label>
           <label class="tg sub"><input type="checkbox" id="prep_beetle_mako"> usar una <Piedra Mako> (${stS.mako.length} disp.)</label>` : ''}
    ${C ? `<label class="tg"><input type="checkbox" id="prep_pen"> ☾ Clumen lanza [Penetrar] (2 PM; +2 a Conocimiento de Monstruos; tiene ${stC.mp})</label>
           <label class="tg sub"><input type="checkbox" id="prep_pen_mako"> usar una <Piedra Mako> (${stC.mako.length} disp.)</label>` : '<p class="muted">Sin Clumen no hay prueba de Conocimiento de Monstruos (no se detectan puntos débiles).</p>'}
    <div class="row"><button class="btn primary" id="cbGo">Tirar Conocimiento e Iniciativa · ¡Al combate!</button>
    <button class="btn" id="cbManual">Resolver a mano (sin motor)</button>
    <button class="btn ghost" id="cbCancel">Cancelar</button></div></div>`;
  $('#cbCancel').onclick = closeCombat;
  $('#cbManual').onclick = () => { closeCombat(); toast('Resuelve el combate con las reglas y elige el destino.'); };
  $('#cbGo').onclick = () => {
    const tg = {}; toggles.forEach((t) => (tg[t.id] = $('#tg_' + t.id).checked));
    CB.prep = { tg, beetle: S && $('#prep_beetle').checked, beetleMako: S && $('#prep_beetle_mako').checked, pen: C && $('#prep_pen').checked, penMako: C && $('#prep_pen_mako').checked };
    beginCombat(comp, tg, prev);
  };
}

async function beginCombat(comp, tg, prev) {
  const cfg = CB.cfg;
  if (cfg.special === 'b2lair') {
    comp = [];
    comp.push([tg.huglDead ? 'bolgTrooper' : 'hugl', 1]);
    if (!tg.villagers) comp.push(['bolgTrooper', 1]);
    CB.flags.villagers = tg.villagers;
  }
  if (party.challenge && party.mode === 'duo' && cfg.extra) for (const e of cfg.extra) comp.push(e);
  if (party.challenge && party.mode === 'solo') CB.cfg.noHalve = true;
  if (party.challenge && party.mode === 'duo' && cfg.extraMods) CB.extraMods = cfg.extraMods;
  if (cfg.special === 'dylan' && tg.dylan) { const i = comp.findIndex(([k]) => k === 'ghast'); if (i >= 0) { if (comp[i][1] > 1) comp[i] = ['ghast', comp[i][1] - 1]; else comp.splice(i, 1); } }
  // contar por tipo
  for (const [k, n] of comp) CB.countOf[k] = (CB.countOf[k] || 0) + n;
  const seen = {};
  // PJ
  for (const k of participatingPCs()) CB.units.push(mkPC(k));
  // enemigos
  for (const [k, n] of comp) for (let i = 0; i < n; i++) {
    seen[k] = (seen[k] || 0) + 1;
    let mods = {};
    if (cfg.special === 'ledraClocks' && tg.clocks5) mods = { hp: 25, dmg: 2 };
    if (cfg.special === 'ledraLux') {
      const d = party.counters['Retrasos'] || 0;
      if (d <= 3) mods = { hp: -20 }; else if (d >= 6) mods = { dmg: 2 };
      CB.flags.delays = d;
    }
    if (CB.extraMods && CB.extraMods[k]) { mods = { ...mods }; for (const [f, v] of Object.entries(CB.extraMods[k])) mods[f] = (mods[f] || 0) + v; }
    const u = mkEnemy(k, seen[k], mods);
    if (cfg.hpModIfFrom && cfg.hpModIfFrom[prev]) u.hp += cfg.hpModIfFrom[prev];
    CB.units.push(u);
  }
  renderCombatShell();
  log(`<b>${cfg.title}</b> — ${CB.units.filter((u) => u.side === 'en').map((u) => `${u.name} (PV ${u.hp})`).join(', ')}`, 'big');
  if (cfg.special === 'ledraLux') log(`[Retrasos] acumulados: ${CB.flags.delays}. ${CB.flags.delays <= 3 ? 'El Ledra tiene −20 PV.' : CB.flags.delays >= 6 ? 'El Ledra hace +2 de daño.' : 'Sin cambios.'} Si sus PV llegan a −15 o menos, Lux muere.`);
  // preparación
  const pS = CB.units.find((u) => u.key === 'S'), pC = CB.units.find((u) => u.key === 'C');
  if (CB.prep.beetle && pS) useTechnique(pS, 'beetle', CB.prep.beetleMako, true);
  let penBonus = 0;
  if (CB.prep.pen && pC) {
    if (mpAvailable(pC, CB.prep.penMako) >= 2) { payMP(pC, 2, CB.prep.penMako); penBonus = 2; log(`☾ Clumen lanza [Penetrar]: +2 a Conocimiento de Monstruos.`); }
  }
  // conocimiento de monstruos
  if (pC) {
    const types = [...new Set(ens().map((u) => u.key))].filter((k) => !MONSTERS[k].object);
    if (cfg.mkAsk && tg.mkFromText) { types.forEach((k) => (CB.weakFound[k] = true)); log('Punto débil ya detectado en el texto.'); }
    else for (const k of types) {
      const M = MONSTERS[k];
      if (M.noWeak) { log(`${M.name}: no tiene punto débil.`); continue; }
      const r = r2d(); const tot = r.s + 6 + penBonus;
      const ok = r.crit || (!r.fumble && tot >= M.weak);
      CB.weakFound[k] = ok;
      log(`📖 Conocimiento de Monstruos (${M.name}): ${diceTxt(r)} +${6 + penBonus} = ${r.fumble ? 'pifia' : tot} vs ${M.weak} → ${ok ? `<span class="ok">¡punto débil detectado: ${M.wpText}!</span>` : 'no detectado'}`);
    }
  }
  // iniciativa
  let first;
  const maxInit = Math.max(...ens().map((u) => u.data.init));
  const hist = party.history;
  if (cfg.noInit) { first = cfg.noInit; }
  else if (cfg.initFromHistory) {
    first = null;
    for (let i = hist.length - 1; i >= 0 && !first; i--) if (cfg.initFromHistory[hist[i]]) first = cfg.initFromHistory[hist[i]];
    if (first) log(`Iniciativa según el párrafo leído: ${first === 'pc' ? 'actúan primero los PJ' : 'actúan primero los enemigos'}.`);
  }
  if (cfg.initLoseIfFrom && cfg.initLoseIfFrom.includes(prev)) { first = 'enemy'; log('Fallan automáticamente la iniciativa (ponen a salvo al guía).'); }
  if (cfg.ambushIfFrom && cfg.ambushIfFrom.includes(prev)) {
    first = 'enemy'; CB.flags.ambush = true;
    log('¡Emboscada! Sin prueba de iniciativa: los PJ empiezan en la retaguardia y tienen −2 a sus pruebas hasta su primer turno.', 'big');
    for (const u of pcs()) addEff(u, { id: 'ambush', name: 'Sorprendido (−2)', untilOwn: true, mods: { all: -2 } });
  }
  if (CB.prep.tg.surprise) {
    first = 'pc'; log('Ataque sorpresa de día: los PJ ganan la iniciativa y los enemigos tienen −2 hasta su primer turno.', 'big');
    for (const u of ens()) addEff(u, { id: 'ambush', name: 'Sorprendido (−2)', untilOwn: true, mods: { acc: -2, eva: -2 } });
  }
  if (!first) {
    const bonus = (cfg.initBonusIfFrom && cfg.initBonusIfFrom[prev]) || 0;
    const r = r2d(); const tot = r.s + GAMBLE.init + bonus;
    const ok = !r.fumble && tot >= maxInit;
    first = ok ? 'pc' : 'enemy';
    log(`👤 Gamble tira Iniciativa: ${diceTxt(r)} +${GAMBLE.init}${bonus ? ' +' + bonus : ''} = ${r.fumble ? 'pifia' : tot} vs ${maxInit} → ${ok ? '<span class="ok">¡los PJ actúan primero!</span>' : '<span class="ko">los enemigos actúan primero</span>'}`);
  }
  CB.first = first;
  // despliegue
  for (const u of CB.units) {
    if (u.side === 'pc') u.area = first === 'pc' ? 'AR' : 'F';
    else u.area = first === 'pc' ? 'F' : 'ER';
  }
  if (CB.flags.ambush) { for (const u of pcs()) u.area = 'AR'; for (const u of ens()) u.area = 'F'; }
  if (cfg.place) for (const u of ens()) if (cfg.place[u.key]) u.area = cfg.place[u.key];
  if (cfg.special === 'duel') {
    for (const u of pcs()) u.area = u.key === 'S' ? 'F' : 'AR';
    log('Duelo singular: solo Shyraes pelea en la vanguardia. El combate termina cuando ella o el caballero quedan con 10 PV o menos.');
  }
  if (cfg.special === 'shield') log('Destruyan el escudo (Defensa 10, 40 PV). Se cuentan los asaltos.');
  renderCombat();
  await sleep(300);
  nextRound();
}

function sidesOrder() { return CB.first === 'pc' ? ['pc', 'en'] : ['en', 'pc']; }

async function nextRound() {
  if (checkEnd()) return;
  CB.round++;
  for (const u of CB.units) u.acted = false;
  log(`<hr>— Asalto ${CB.round} —`, 'round');
  if (CB.flags.villagers && CB.round > 3) {
    const dead = Math.min(5, CB.round - 3);
    party.counters['Aldeanos muertos'] = dead;
    log(`💀 La refriega se prolonga: muere un aldeano (${dead}/5).`);
  }
  CB.sideIdx = 0;
  runPhase();
}

async function runPhase() {
  if (checkEnd()) return;
  const side = sidesOrder()[CB.sideIdx];
  CB.phase = side;
  if (side === 'en') {
    const me = CB;
    renderCombat();
    for (const u of ens()) {
      if (CB !== me) return;
      if (!alive(u)) continue;
      startTurn(u);
      CB.active = u.uid; renderCombat();
      await sleep(450);
      await enemyTurn(u);
      endTurn(u);
      u.acted = true;
      if (CB !== me || checkEnd()) return;
      await sleep(300);
    }
    if (CB !== me) return;
    CB.active = null;
    endPhase();
  } else {
    // si ningún PJ puede actuar, se salta
    if (!pcs().some((u) => alive(u))) return endPhase();
    renderCombat();
  }
}
function endPhase() {
  if (checkEnd()) return;
  CB.sideIdx++;
  if (CB.sideIdx >= 2) return nextRound();
  runPhase();
}
function startTurn(u) {
  for (const x of CB.units) for (const e of [...x.effects]) {
    if (e.owner === u.uid && e.rounds) { e.rounds--; if (e.rounds <= 0) { rmEff(x, e.id); log(`&nbsp;&nbsp;Termina ${e.name} (${x.name}).`, 'dim'); } }
  }
  for (const e of [...u.effects]) if (e.untilOwn) rmEff(u, e.id);
  if (u.side === 'pc' && u.prone && alive(u)) { u.prone = false; addEff(u, { id: 'standing', name: 'Levantándose (−2)', untilEnd: true, mods: { all: -2 } }); log(`${u.icon} ${u.name} se levanta (−2 a sus pruebas este turno).`); }
}
function endTurn(u) { for (const e of [...u.effects]) if (e.untilEnd) rmEff(u, e.id); }

function checkEnd() {
  if (!CB || CB.done) return true;
  const P = pcs();
  const E = ens().filter((u) => !u.data.object || ens().every((x) => x.data.object));
  let res = null;
  if (CB.cfg.special === 'duel') {
    const s = P.find((u) => u.key === 'S');
    if (!s || s.hp <= 10 || !alive(s)) res = 'lose';
    else if (E.every((u) => !alive(u))) res = 'win';
  } else {
    if (P.every((u) => !alive(u))) res = 'lose';
    else if (E.every((u) => !alive(u))) res = 'win';
  }
  if (res) { CB.done = true; CB.result = res; const me = CB; setTimeout(() => { if (CB === me && !me.finished) finishCombat(res); }, 400); return true; }
  return false;
}

function finishCombat(res) {
  if (!CB || CB.finished) return;
  CB.finished = true;
  try { finishCombatInner(res); } catch (e) { CB.finished = false; log('Error al cerrar el combate: ' + e.message, 'ko'); console.error(e); }
}
function finishCombatInner(res) {
  const cfg = CB.cfg;
  const P = pcs();
  const dead = P.filter((u) => u.status === 'dead').map((u) => u.key);
  // persistir estado
  for (const u of P) {
    const st = party.pcs[u.key];
    if (u.status === 'dead') { st.dead = true; st.hp = u.hp; }
    else { st.hp = u.status === 'unc' && res === 'win' ? 1 : Math.max(u.hp, res === 'win' ? 1 : u.hp); st.mp = u.mp; }
  }
  const twinsAlive = ['S', 'C'].filter((k) => !party.pcs[k].dead).length;
  let outcome = res === 'lose' || twinsAlive === 0 ? 'lose' : twinsAlive === 1 ? 'twin' : 'win';
  if (cfg.special === 'duel') outcome = res;
  const dest = cfg.outcomes[outcome];
  let summary = res === 'win' ? '🏆 ¡Victoria!' : '💀 Derrota';
  const notes = [];
  if (dead.length) notes.push('Murió: ' + dead.map((k) => PC_DATA[k].name).join(' y '));
  if (cfg.special === 'shield') { notes.push(`El escudo cayó en ${CB.round} asalto(s).` + (CB.round >= 6 ? ' Anoten 1 [Retraso].' : '')); party.flags.shieldRounds = CB.round; }
  if (cfg.special === 'ledraLux') notes.push(CB.flags.luxDead ? `Lux murió (golpe final: ${CB.flags.luxDead}).` : 'Lux sobrevivió.');
  if (CB.flags.villagers) notes.push(`Aldeanos muertos: ${party.counters['Aldeanos muertos'] || 0}`);
  party.flags['combat_' + CB.nodeId] = { res, round: CB.round, luxDead: CB.flags.luxDead || null };
  save();
  log(`<b>${summary}</b> ${notes.join(' · ')}`, 'big');
  const box = $('#cbActions');
  box.innerHTML = `<div class="cb-end"><h3>${summary}</h3><p>${notes.join('<br>') || (res === 'win' ? 'Los PJ inconscientes recuperan el sentido con 1 PV.' : 'Todos los PJ han caído.')}</p>
    <button class="btn primary" id="cbGoDest">Continuar → ${labelOf(dest)}</button>
    <button class="btn ghost" id="cbClose">Cerrar y elegir yo el destino</button></div>`;
  $('#cbGoDest').onclick = () => { closeCombat(); goTo(dest); };
  $('#cbClose').onclick = () => { closeCombat(); render(); };
}
function closeCombat() { $('#combat').classList.remove('open'); $('#combat').innerHTML = ''; CB = null; render(); }

// ---------- interfaz de combate ----------
function renderCombatShell() {
  $('#combat').innerHTML = `<div class="cb-wrap">
    <div class="cb-head"><h2>⚔ ${CB.cfg.title}</h2><span id="cbRound"></span><button class="btn ghost sm" id="cbAbort">Abandonar</button></div>
    <div class="cb-field" id="cbField"></div>
    <div class="cb-bottom"><div class="cb-actions" id="cbActions"></div><div class="cb-log" id="cbLog"></div></div></div>`;
  $('#cbAbort').onclick = async () => { if (await ask('¿Abandonar el combate?', 'Se conservarán PV y PM actuales.', [{ label: 'Sí, abandonar', value: 1 }, { label: 'No', value: 0 }])) { for (const u of pcs()) { party.pcs[u.key].hp = u.hp; party.pcs[u.key].mp = u.mp; } save(); closeCombat(); } };
}
function renderLog() {
  const el = $('#cbLog'); if (!el) return;
  el.innerHTML = CB.log.slice(-250).join('');
  el.scrollTop = el.scrollHeight;
}
function unitCard(u) {
  const pct = Math.max(0, Math.min(100, (u.hp / u.mhp) * 100));
  const mpp = u.mmp ? Math.max(0, (u.mp / u.mmp) * 100) : 0;
  const st = u.status === 'dead' ? '☠' : u.status === 'unc' ? '💤' : u.status === 'fled' ? '🏳' : '';
  const effs = u.effects.map((e) => `<span class="eff">${e.name}${e.rounds ? ' ' + e.rounds : ''}</span>`).join('');
  const extra = u.side === 'pc' ? [party.pcs[u.key].status.gas ? '<span class="eff bad">Gas −1 Eva</span>' : '', u.stance === '2H' ? '<span class="eff">A dos manos</span>' : ''].join('') : (CB.weakFound[u.key] ? `<span class="eff good">Punto débil: ${u.data.wpText}</span>` : '');
  const canAct = CB.phase === 'pc' && u.side === 'pc' && alive(u) && !u.acted && !CB.turn && !CB.done;
  return `<div class="unit ${u.side} ${u.status} ${CB.active === u.uid || (CB.turn && CB.turn.uid === u.uid) ? 'active' : ''} ${u.acted ? 'acted' : ''}" data-uid="${u.uid}">
    <div class="un">${u.icon ? `<span class="ico">${u.icon}</span>` : ''}${u.name} ${st}</div>
    <div class="bar hp"><i style="width:${pct}%"></i><span>PV ${u.hp}/${u.mhp}</span></div>
    ${u.mmp ? `<div class="bar mp"><i style="width:${mpp}%"></i><span>PM ${u.mp}/${u.mmp}</span></div>` : ''}
    <div class="effs">${effs}${extra}</div>
    ${canAct ? `<button class="btn sm primary act" data-act="${u.uid}">Actuar</button>` : ''}
  </div>`;
}
function renderCombat() {
  if (!CB || !$('#cbField')) return;
  $('#cbRound').textContent = CB.round ? `Asalto ${CB.round} · ${CB.phase === 'pc' ? 'turno de los PJ' : CB.phase === 'en' ? 'turno enemigo' : ''}` : '';
  $('#cbField').innerHTML = IDX_AREA.map((a) => `<div class="area ${skirmish(a) ? 'skirmish' : ''}"><div class="an">${AREA_NAME[a]}${skirmish(a) ? ' · refriega' : ''}</div>
    ${CB.units.filter((u) => u.area === a && u.status !== 'dead' && u.status !== 'fled').map(unitCard).join('')}
    ${CB.units.filter((u) => u.area === a && (u.status === 'dead' || u.status === 'fled')).map(unitCard).join('')}</div>`).join('');
  document.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => beginPCTurn(b.dataset.act)));
  renderActions();
}
function beginPCTurn(uid) {
  const u = CB.units.find((x) => x.uid === uid);
  startTurn(u);
  CB.turn = { uid, moved: null, major: false, usedTech: false };
  log(`${u.icon} Turno de <b>${u.name}</b>${party.mode === 'duo' ? ` (jugador de ${u.key === 'S' ? '☀' : '☾'})` : ''}.`);
  renderCombat();
}
function endPCTurn() {
  if (!CB || !CB.turn) return;
  const u = CB.units.find((x) => x.uid === CB.turn.uid);
  endTurn(u); u.acted = true; CB.turn = null;
  renderCombat();
  if (checkEnd()) return;
  if (pcs().filter((x) => alive(x) && !x.acted).length === 0) endPhase();
}
function moveOptions(u) {
  const opts = [];
  const sk = skirmish(u.area);
  const friends = inArea(u.area, 'pc').length, foes = inArea(u.area, 'en').length;
  const free = !sk || friends > 2 * foes;
  const withdraw = hasEff(u, 'withdrawReady');
  const i = AREA_IDX[u.area];
  for (const j of [i - 1, i + 1]) {
    if (j < 0 || j > 2) continue;
    const a = IDX_AREA[j];
    const backward = j < i;
    if (CB.cfg.special === 'duel' && u.key !== 'S') continue;
    if (CB.cfg.special === 'duel' && u.key === 'S' && a === 'AR') continue;
    // acorralado: el bando cuya retaguardia fue invadida no puede salir
    if (sk && u.area === 'AR') continue;
    if (sk && !backward) continue; // de una refriega solo se sale hacia atrás
    if (free || (withdraw && backward)) opts.push({ a, type: 'normal' });
  }
  if (u.area === 'AR' && !sk && inArea('F', 'en').length === 0 && CB.cfg.special !== 'duel') opts.push({ a: 'ER', type: 'full' });
  if (u.area === 'ER' && sk && withdraw) opts.push({ a: 'AR', type: 'full' });
  return opts;
}
function renderActions() {
  const box = $('#cbActions'); if (!box) return;
  if (CB.done) { if (!CB.finished && CB.result) setTimeout(() => finishCombat(CB.result), 50); return; }
  if (!CB.turn) {
    box.innerHTML = CB.phase === 'pc' ? `<p class="muted">Elige qué PJ actúa (botón «Actuar»).</p>` : `<p class="muted">Turno de los enemigos…</p>`;
    return;
  }
  const u = CB.units.find((x) => x.uid === CB.turn.uid);
  const T = CB.turn; const st = party.pcs[u.key];
  const foesHere = inArea(u.area, 'en');
  const mk = st.mako.length ? `<label class="tg sub"><input type="checkbox" id="useMako"> usar <Piedra Mako> (${st.mako.join(', ')} PM)</label>` : '';
  let h = `<div class="cb-turn"><div class="tt">${u.icon} <b>${u.name}</b> — ${AREA_NAME[u.area]} · PV ${u.hp}/${u.mhp} · PM ${u.mp}/${u.mmp} · Precisión ${pcAcc(u)} · Evasión ${pcEva(u)} · Defensa ${pcDef(u)}</div>`;
  // movimiento
  if (!T.moved && !T.major) {
    const mo = moveOptions(u);
    h += `<div class="grp"><span class="gl">Movimiento</span>${mo.map((o) => `<button class="btn sm" data-move="${o.a}" data-mt="${o.type}">${o.type === 'full' ? 'Mov. completo' : 'Mover'} → ${AREA_NAME[o.a]}</button>`).join('')}
      ${skirmish(u.area) && !hasEff(u, 'withdrawReady') ? '<span class="muted sm">En refriega: para salir prepara la retirada.</span>' : ''}</div>`;
  } else if (T.moved) h += `<div class="grp"><span class="gl">Movimiento</span><span class="muted">${T.moved === 'normal' ? 'normal (sin magia este turno)' : T.moved === 'full' ? 'completo (sin acción principal, −4 Evasión)' : 'limitado'}</span></div>`;
  // menores
  if (u.key === 'S' && T.moved !== 'full') {
    const hasStone = st.mako.length > 0, best = hasStone ? Math.max(...st.mako) : 0;
    h += `<div class="grp"><span class="gl">Acciones menores · técnicas (3 PM c/u)</span>${Object.keys(TECHNIQUES).map((k) => {
      const on = hasEff(u, k);
      return `<div class="techrow"><span title="${TECHNIQUES[k].desc}">${TECHNIQUES[k].name}</span>
        <button class="btn sm" data-tech="${k}" data-src="mp" ${on || u.mp < 3 ? 'disabled' : ''}>Usar PM (${u.mp})</button>
        <button class="btn sm stone" data-tech="${k}" data-src="mako" ${on || !hasStone || u.mp + best < 3 ? 'disabled' : ''}>⬡ Con Piedra Mako${hasStone ? ` (${best})` : ' (no quedan)'}</button>${on ? '<span class="muted sm">activa</span>' : ''}</div>`;
    }).join('')}
      ${u.stance === '1H' ? `<button class="btn sm" data-stance="1">Soltar el escudo y empuñar a dos manos</button>` : ''}
      <div class="muted sm">Piedras Mako: ${hasStone ? st.mako.join(', ') + ' PM' : 'ninguna'}</div></div>`;
  }
  // principal
  if (!T.major && T.moved !== 'full') {
    h += `<div class="grp"><span class="gl">Acción principal</span>`;
    if (foesHere.length) {
      h += foesHere.map((t) => `<button class="btn sm primary" data-atk="${t.uid}">⚔ Atacar a ${t.name}</button>`).join('');
      if (u.key === 'S') h += `<label class="tg sub"><input type="checkbox" id="ps"> [Golpe Poderoso I] (+4 daño, −2 Evasión)</label>`;
    } else if (!T.moved) {
      const fw = inArea(IDX_AREA[AREA_IDX[u.area] + 1] || 'x', 'en');
      if (fw.length && moveOptions(u).some((o) => o.a === IDX_AREA[AREA_IDX[u.area] + 1])) h += fw.map((t) => `<button class="btn sm primary" data-movatk="${t.uid}">Avanzar y atacar a ${t.name}</button>`).join('');
    }
    if (u.key === 'C' && T.moved !== 'normal') {
      if (hasEff(u, 'forbid')) h += `<span class="muted">Magia prohibida.</span>`;
      else h += `<button class="btn sm" data-spellmenu="1">✨ Lanzar conjuro…</button>`;
    }
    const uncHere = pcs().filter((x) => x.status === 'unc' && x.area === u.area);
    if (uncHere.length && st.awake > 0) h += uncHere.map((x) => `<button class="btn sm" data-potion="${x.uid}">Dar <Poción de Despertar> a ${x.name}</button>`).join('');
    if (skirmish(u.area) && !hasEff(u, 'withdrawReady')) h += `<button class="btn sm" data-withdraw="1">Preparar retirada</button>`;
    h += `</div>`;
  }
  h += `<div id="spellBox"></div><div class="row"><button class="btn" id="endTurn">Terminar turno</button></div></div>`;
  box.innerHTML = h;
  const useM = () => ($('#useMako') ? $('#useMako').checked : false);
  box.querySelectorAll('[data-move]').forEach((b) => (b.onclick = () => {
    u.area = b.dataset.move; T.moved = b.dataset.mt;
    if (T.moved === 'full') addEff(u, { id: 'fullmove', name: 'Mov. completo (−4 Eva)', untilOwn: true, mods: { eva: -4 } });
    rmEff(u, 'withdrawReady');
    log(`${u.icon} ${u.name} se mueve a ${AREA_NAME[u.area]}.`); renderCombat();
  }));
  box.querySelectorAll('[data-tech]').forEach((b) => (b.onclick = () => { useTechnique(u, b.dataset.tech, b.dataset.src === 'mako'); }));
  box.querySelectorAll('[data-stance]').forEach((b) => (b.onclick = () => { u.stance = '2H'; log(`☀ Shyraes arroja el escudo y empuña la espada a dos manos (Poder 27, Defensa −3).`); renderCombat(); }));
  box.querySelectorAll('[data-atk]').forEach((b) => (b.onclick = async () => {
    T.major = true; if (!T.moved) T.moved = 'limited';
    await pcAttack(u, CB.units.find((x) => x.uid === b.dataset.atk), $('#ps') && $('#ps').checked);
    renderCombat();
  }));
  box.querySelectorAll('[data-movatk]').forEach((b) => (b.onclick = async () => {
    const t = CB.units.find((x) => x.uid === b.dataset.movatk);
    u.area = t.area; T.moved = 'normal'; T.major = true; log(`${u.icon} ${u.name} avanza a ${AREA_NAME[u.area]}.`);
    await pcAttack(u, t, false); renderCombat();
  }));
  box.querySelectorAll('[data-potion]').forEach((b) => (b.onclick = () => {
    const t = CB.units.find((x) => x.uid === b.dataset.potion);
    st.awake--; T.major = true; if (t.hp < 1) t.hp = 1; t.status = 'ok'; t.prone = true;
    log(`${u.icon} ${u.name} da una <Poción de Despertar> a ${t.name}: despierta con ${t.hp} PV.`); renderCombat();
  }));
  box.querySelectorAll('[data-withdraw]').forEach((b) => (b.onclick = () => {
    T.major = true; addEff(u, { id: 'withdrawReady', name: 'Retirada preparada', mods: {} });
    addEff(u, { id: 'withdrawPen', name: 'Preparando retirada (−4 Eva)', untilOwn: true, mods: { eva: -4 } });
    log(`${u.icon} ${u.name} prepara la retirada.`); renderCombat();
  }));
  const sm = box.querySelector('[data-spellmenu]');
  if (sm) sm.onclick = () => spellMenu(u);
  $('#endTurn').onclick = endPCTurn;
}
function spellMenu(u) {
  const T = CB.turn; const st = party.pcs[u.key];
  const box = $('#spellBox');
  const allies = pcs().filter((x) => x.status !== 'dead');
  const foes = ens().filter(alive);
  const inRange = (t, r) => dist(u.area, t.area) <= r;
  const opts = [
    ['force', foes.filter((t) => inRange(t, 1))],
    ['cure', allies.filter((t) => inRange(t, 1)).concat(foes.filter((t) => t.data.cat === 'undead' && inRange(t, 1)))],
    ['field', []], ['fieldres', []], ['banish', []],
    ['awaken', allies.filter((t) => t.status === 'unc' && inRange(t, 1))],
    ['curepoison', allies.filter((t) => t.area === u.area)],
  ];
  box.innerHTML = `<div class="spells">${opts.map(([k, ts]) => {
    const S = SPELLS[k];
    let tsel = '';
    if (['force', 'cure', 'awaken', 'curepoison'].includes(k)) {
      if (!ts.length) return `<div class="sp dis"><b>${S.name}</b> <span class="muted">sin objetivos a alcance</span></div>`;
      tsel = ts.map((t) => `<label class="tg sub"><input type="checkbox" class="tgt_${k}" value="${t.uid}"> ${t.icon || ''} ${t.name} <span class="muted">(${AREA_NAME[t.area]}, PV ${t.hp})</span></label>`).join('');
    }
    if (k === 'banish') tsel = `<select id="banArea">${IDX_AREA.map((a) => `<option value="${a}">${AREA_NAME[a]}</option>`).join('')}</select>`;
    if (k === 'fieldres') tsel = `<select id="frType"><option>Fuego</option><option>Viento</option><option>Agua/Hielo</option><option>Rayo</option><option>Energía</option></select>`;
    return `<div class="sp"><b>${S.name}</b> <span class="muted">${S.mp} PM${S.multi ? ' por objetivo' : ''} — ${S.desc}</span><div>${tsel}</div><button class="btn sm primary" data-cast="${k}">Lanzar</button></div>`;
  }).join('')}
  ${st.mako.length ? `<label class="tg"><input type="checkbox" id="useMakoSp"> usar <Piedra Mako> (${st.mako.join(', ')} PM)</label>` : ''}</div>`;
  box.querySelectorAll('[data-cast]').forEach((b) => (b.onclick = async () => {
    const k = b.dataset.cast;
    const targets = [...box.querySelectorAll('.tgt_' + k + ':checked')].map((i) => CB.units.find((x) => x.uid === i.value));
    if (['force', 'cure', 'awaken', 'curepoison'].includes(k) && !targets.length) return toast('Elige al menos un objetivo.');
    if (!SPELLS[k].multi && targets.length > 1) return toast('Ese conjuro tiene un solo objetivo.');
    const ok = await pcCast(u, k, targets, { mako: $('#useMakoSp') && $('#useMakoSp').checked, area: $('#banArea') && $('#banArea').value, type: $('#frType') && $('#frType').value });
    if (ok) { T.major = true; if (!T.moved) T.moved = 'limited'; }
    renderCombat();
  }));
}
