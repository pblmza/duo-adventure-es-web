// Datos de juego: Sword World 2.5 · Duo Adventure (versión web en español, uso privado)
'use strict';

// Tablas de poder: índice = resultado de 2d (2..12). null en 2 = pifia (sin daño).
const POWER = {
  10: [null, null, null, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7],
  13: [null, null, null, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7],
  17: [null, null, null, 1, 2, 3, 4, 5, 5, 6, 7, 7, 8],
  20: [null, null, null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  27: [null, null, null, 2, 3, 4, 6, 6, 8, 8, 9, 9, 10],
  30: [null, null, null, 2, 4, 4, 6, 7, 8, 9, 10, 10, 10],
};

const PC_DATA = {
  S: {
    key: 'S', icon: '☀', name: 'Shyraes', full: 'Shyraes Sunkneck', title: 'Princesa del Sol Radiante',
    portrait: 'img/avatar_S.jpg', art: 'img/i308.jpg', face: [80, 95, 180], sheet: 'img/i310.jpg',
    race: 'Humana', age: 15, gender: 'Femenino', level: 4,
    classes: [['Guerrero', 4], ['Potenciador', 3], ['Jinete', 3]],
    abil: { Destreza: [13, 2], Agilidad: [12, 2], Fuerza: [18, 3], Vitalidad: [19, 3], Inteligencia: [14, 2], Espíritu: [15, 2] },
    hp: 31, mp: 15, fort: 7, will: 6, death: 7, init: 0, mk: null,
    acc: 6, eva: 5, def: 9,
    weapons: {
      '1H': { name: 'Espada Bastarda (a una mano + escudo)', power: 17, crit: 10, dmg: 7, edged: true },
      '2H': { name: 'Espada Bastarda (a dos manos)', power: 27, crit: 10, dmg: 7, edged: true, defMod: -3 },
    },
    armor: 'Cota de Malla (Def 6, Eva −1) · Escudo de Caballero (Def 2) · [Maestría con Armadura A/Escudos] (Def +1)',
    feats: ['[Golpe Poderoso I]', '[Maestría con Armadura A/Escudos]'],
    techniques: ['[Ojos de Gato]', '[Músculo de Oso]', '[Piel de Escarabajo]'],
    stunts: ['[Orden de Búsqueda] (usa a su caballo Parlor para Rastrear, Advertir, Sentir el Peligro, Búsqueda y Detectar Trampas)'],
    items0: { mako: [3, 3, 3, 3], sun: [1, 2], moon: [1, 2], awake: 1 },
    gear: 'Equipo de Aventurero: mochila, odre, manta, antorchas (6), yesquero, cuerda (10 m), cuchillo pequeño',
  },
  C: {
    key: 'C', icon: '☾', name: 'Clumen', full: 'Clumen Sunkneck', title: 'Príncipe de la Luna Brillante',
    portrait: 'img/avatar_C.jpg', art: 'img/i312.jpg', face: [85, 215, 220], sheet: 'img/i315.jpg',
    race: 'Humano', age: 15, gender: 'Masculino', level: 4,
    classes: [['Esgrimista', 4], ['Sacerdote (Kilhia)', 3], ['Sabio', 3]],
    abil: { Destreza: [12, 2], Agilidad: [14, 2], Fuerza: [15, 2], Vitalidad: [15, 2], Inteligencia: [19, 3], Espíritu: [18, 3] },
    hp: 27, mp: 27, fort: 6, will: 7, death: 6, init: 0, mk: 6, magic: 6,
    acc: 6, eva: 6, def: 4,
    weapons: { '1H': { name: 'Flissa', power: 13, crit: 9, dmg: 7, edged: true } },
    armor: 'Cuero Blando (Def 3) · Escudo Redondo (Def 1) · Símbolo Sagrado (cuello)',
    feats: ['[Metamagia/Objetivos]', '[Maestría con Arma A/Espadas]'],
    techniques: [],
    stunts: [],
    items0: { mako: [5, 5, 5, 5], sun: [1, 2], moon: [1, 2], awake: 1 },
    gear: 'Equipo de Aventurero: mochila, odre, manta, antorchas (6), yesquero, cuerda (10 m), cuchillo pequeño',
  },
};
const GAMBLE = { name: 'Gamble', icon: '👤', init: 7 };

const TECHNIQUES = {
  cat: { name: '[Ojos de Gato]', mp: 3, rounds: 3, desc: '+1 a la Precisión durante 3 asaltos.' },
  bear: { name: '[Músculo de Oso]', mp: 3, rounds: 3, desc: '+2 al modificador de Fuerza (daño extra +2) durante 3 asaltos.' },
  beetle: { name: '[Piel de Escarabajo]', mp: 3, rounds: 3, prep: true, desc: '+2 a la Defensa durante 3 asaltos. Puede usarse en la preparación del combate.' },
};

const SPELLS = {
  force: { name: '[Fuerza Espiritual]', mp: 4, range: 1, kind: 'damage', power: 10, crit: 10, res: 'half', multi: true, shot: true,
    desc: 'Alcance 1, Disparo. Poder 10 + Poder Mágico de daño mágico (contundente). Resistencia: Mitad.' },
  cure: { name: '[Curar Heridas]', mp: 3, range: 1, kind: 'heal', power: 10, multi: true,
    desc: 'Alcance 1. Cura Poder 10 + Poder Mágico PV (sin crítico). Contra no-muertos hace ese daño.' },
  field: { name: '[Campo Protector]', mp: 2, range: 0, kind: 'field',
    desc: 'Tu zona: los aliados reciben −1 de daño (físico y mágico) durante 18 asaltos.' },
  banish: { name: '[Desterrar]', mp: 3, range: 2, kind: 'banish',
    desc: 'Una zona a alcance 2: cada Bárbaro o No-muerto que falle Voluntad tira en la tabla de Desterrar.' },
  awaken: { name: '[Despertar]', mp: 5, range: 1, kind: 'awaken',
    desc: 'Alcance 1. Un personaje inconsciente despierta (PV a 1 si estaban bajo 1). Queda derribado.' },
  curepoison: { name: '[Curar Veneno]', mp: 3, range: 0, kind: 'curepoison',
    desc: 'Toque. Elimina un efecto de veneno (prueba enfrentada).' },
  fieldres: { name: '[Campo de Resistencia]', mp: 5, range: 0, kind: 'fieldres',
    desc: 'Tu zona: −3 al daño de un tipo (Fuego, Viento, Agua/Hielo, Rayo o Energía) durante 18 asaltos.' },
};

// Monstruos. Valores fijos para precisión/evasión/resistencias.
const MONSTERS = {
  bolgSlasher: { name: 'Bolg Tajador', lvl: 4, cat: 'barbarous', acc: 13, dmg: 6, eva: 12, def: 3, hp: 29, mp: 14, init: 13, fort: 12, will: 12, weak: 13, wp: { phys: 2 }, wpText: 'Daño físico +2', ai: 'melee',
    skills: [], text: 'Bárbaro corpulento de piel azulada y pelaje blanco; blande armas enormes.' },
  bolgWarsword: { name: 'Bolg Espadón', lvl: 5, cat: 'barbarous', acc: 13, dmg: 6, eva: 13, def: 3, hp: 39, mp: 17, init: 14, fort: 13, will: 13, weak: 14, wp: { phys: 2 }, wpText: 'Daño físico +2', ai: 'melee', attacks: 2, sameTarget: true,
    skills: ['►Ataque doble: con su acción principal hace dos ataques contra un mismo objetivo.'] },
  bolgTrooper: { name: 'Bolg Soldado', lvl: 3, cat: 'barbarous', acc: 11, dmg: 5, eva: 11, def: 3, hp: 23, mp: 10, init: 11, fort: 11, will: 11, weak: 13, wp: { phys: 2 }, wpText: 'Daño físico +2', ai: 'melee', skills: [] },
  hugl: { name: 'Hugl Atacante', lvl: 5, cat: 'barbarous', acc: 14, dmg: 6, eva: 14, def: 6, hp: 38, mp: 15, init: 14, fort: 14, will: 14, weak: 15, wp: { wind: 3 }, wpText: 'Daño de viento +3', ai: 'melee', attacks: 3,
    skills: ['►3 ataques (al azar): garras y alas; el objetivo de cada ataque se elige al azar.'] },
  skeleton: { name: 'Esqueleto Guerrero', lvl: 4, cat: 'undead', acc: 13, dmg: 6, eva: 12, def: 5, hp: 28, mp: 0, init: 8, fort: 12, will: 13, weak: 13, wp: { heal: 3 }, wpText: 'Daño por curación +3', ai: 'melee', boneBody: true, immune: ['psychic', 'poison'],
    skills: ['◯Inmune a efectos psíquicos y venenos.', '◯Cuerpo de hueso: inmune a críticos de armas de filo.'] },
  genanthus: { name: 'Genanthus el Tuerto', lvl: 5, cat: 'beast', acc: 14, dmg: 8, eva: 13, def: 5, hp: 45, mp: 40, init: 14, fort: 14, will: 15, weak: 16, wp: { wind: 3 }, wpText: 'Daño de viento +3', ai: 'genanthus',
    force: { fixed: 14, power: 10, bonus: 7, mp: 4 }, weapon: 'Cola',
    skills: ['►[Fuerza Espiritual] 7(14)/Voluntad/Mitad: alcance 1, Poder 10+7, varios objetivos (4 PM c/u), sin disparo errado.', '◯Aguijón vampírico: una vez por combate recupera PV igual al daño de su cola.'] },
  alkaloid: { name: 'Flecha Alcaloide', lvl: 5, cat: 'barbarous', acc: 14, dmg: 7, eva: 12, def: 5, hp: 42, mp: 15, init: 13, fort: 14, will: 13, weak: 14, wp: { acc: 1 }, wpText: 'Precisión +1', ai: 'archer', surrender: 10,
    skills: ['►Arco: alcance 2, sin disparo errado.', '◯Fitotoxina 6(13)/Fortaleza/Anula: si el arco impacta, −2 a la Evasión durante 18 asaltos (veneno).'] },
  oddRock: { name: 'Roca extraña', lvl: 0, cat: 'object', acc: 0, dmg: 0, eva: -99, def: 5, hp: 20, mp: 0, init: 0, fort: -99, will: -99, weak: 99, wp: {}, ai: 'none', object: true,
    skills: ['Obstáculo: falla automáticamente la Evasión y las resistencias. No actúa.'] },
  cultist: { name: 'Sectario Sangriento', lvl: 6, cat: 'humanoid', acc: 11, dmg: 1, eva: 12, def: 6, hp: 38, mp: 42, init: 13, fort: 15, will: 16, weak: 9, noWeak: true, wp: {}, wpText: 'Ninguno', ai: 'caster', weapon: 'Bastón',
    force: { fixed: 15, power: 10, bonus: 8, mp: 4 },
    skills: ['►[Fuerza Espiritual] 8(15)/Voluntad/Mitad: alcance 1, Poder 10+8, varios objetivos (4 PM c/u).'] },
  golem: { name: 'Gólem Sangriento', lvl: 4, cat: 'construct', acc: 13, dmg: 5, eva: 12, def: 3, hp: 38, mp: 0, init: 13, fort: 14, will: 15, weak: 14, wp: { phys: 2 }, wpText: 'Daño físico +2', ai: 'melee', splatter: 10, immune: ['psychic', 'poison'], weapon: 'Brazo',
    skills: ['◯Inmune a veneno, enfermedad y efectos psíquicos.', '◯Estallido: al quedar con 10 PV o menos, explota e inflige daño físico igual a sus PV restantes a todos en su zona.'] },
  knight: { name: 'Caballero de Patrulla', lvl: 5, cat: 'humanoid', acc: 14, dmg: 8, eva: 12, def: 7, hp: 48, mp: 11, init: 9, fort: 15, will: 13, weak: 8, noWeak: true, wp: {}, wpText: 'Ninguno', ai: 'duel',
    skills: ['Duelo singular: solo ataca a Shyraes. Se rinde con 10 PV o menos.'] },
  ogre: { name: 'Ogro Menor Destripador', lvl: 5, cat: 'barbarous', acc: 13, dmg: 5, eva: 13, def: 3, hp: 55, mp: 27, init: 13, fort: 13, will: 15, weak: 15, wp: { acc: 1 }, wpText: 'Precisión +1', ai: 'ogre',
    reap: { fixed: 13, power: 20, bonus: 6, mp: 7 },
    skills: ['►Tajo Segador 6(13)/Voluntad/Mitad: alcance 1, un objetivo, Poder 20+6 de daño mágico cortante (7 PM).'] },
  ghast: { name: 'Caballero Ghast', lvl: 4, cat: 'magical', acc: 13, dmg: 8, eva: 12, def: 2, hp: 32, mp: 0, init: 11, fort: 14, will: 11, weak: 13, wp: { phys: 2 }, wpText: 'Daño físico +2', ai: 'melee', skills: [] },
  ledra: { name: 'Ledra', lvl: 6, cat: 'daemon', acc: 14, dmg: 5, eva: 14, def: 2, hp: 45, mp: 35, init: 11, fort: 14, will: 16, weak: 16, wp: { energy: 3 }, wpText: 'Daño de energía +3', ai: 'ledra', normalImmune: true, weapon: 'Garras',
    blast: { fixed: 14, power: 30, bonus: 7, mp: 5 },
    skills: ['◯Inmune a armas normales (solo la dañan la magia y las armas mágicas).', '►Estallido 7(14)/Voluntad/Mitad: toque, un objetivo, Poder 30+7 de daño mágico (5 PM).', '◯Acción múltiple: además de Estallido puede atacar con sus garras.'] },
  dawnPrime: { name: 'Dawn Prime', lvl: 5, cat: 'barbarous', acc: 14, dmg: 7, eva: 14, def: 4, hp: 38, mp: 28, init: 13, fort: 13, will: 13, weak: 16, wp: { acc: 1 }, wpText: 'Precisión +1', ai: 'dawn', weapon: 'Garras',
    force: { fixed: 14, power: 10, bonus: 7, mp: 4 },
    skills: ['►[Fuerza Espiritual] 7(14)/Voluntad/Mitad: alcance 1, Poder 10+7 (4 PM por objetivo).', '◯Acción múltiple: además de la magia puede atacar con sus garras.'] },
  heide: { name: 'Heide (Conjuradora Adoradora del Mal)', lvl: 6, cat: 'humanoid', acc: 14, dmg: 5, eva: 14, def: 5, hp: 45, mp: 50, init: 13, fort: 15, will: 16, weak: 9, noWeak: true, wp: {}, wpText: 'Ninguno', ai: 'heide', weapon: 'Bastón',
    force: { fixed: 16, power: 10, bonus: 9, mp: 4 },
    skills: ['►Arma de Fuego (4 PM): las armas de un aliado hacen daño físico de fuego +2 durante 18 asaltos.', '►Prohibir Magia 7(14)/Voluntad/Anula (5 PM): el objetivo no puede usar magia durante 3 asaltos.', '►[Fuerza Espiritual] 9(16)/Voluntad/Mitad: alcance 1, Poder 10+9 (4 PM por objetivo).'] },
  shadowSaber: { name: 'Sable Sombrío', lvl: 6, cat: 'magical', acc: 15, dmg: 9, eva: 13, def: 6, hp: 44, mp: 0, init: 14, fort: 15, will: 15, weak: 16, wp: { magic: 2 }, wpText: 'Daño mágico +2', ai: 'melee', attacks: 2, immune: ['psychic', 'poison'], weapon: 'Espada',
    skills: ['◯Inmune a veneno, enfermedad y efectos psíquicos.', '►Golpe gemelo: dos ataques con espada por asalto, cada uno a un objetivo al azar.'] },
  shield: { name: 'Escudo del espíritu', lvl: 0, cat: 'object', acc: 0, dmg: 0, eva: -99, def: 10, hp: 40, mp: 0, init: 0, fort: -99, will: -99, weak: 99, wp: {}, ai: 'none', object: true,
    skills: ['No esquiva ni resiste; el daño se aplica directamente (Defensa 10).'] },
};

const BANISH_TABLE = [
  { r: [2, 4], name: 'Frenesí', desc: '+2 Precisión, −2 Evasión durante 3 asaltos.', eff: { acc: 2, eva: -2 }, rounds: 3 },
  { r: [5, 9], name: 'Miedo', desc: '−1 a Precisión, Evasión y conjuros durante 18 asaltos.', eff: { acc: -1, eva: -1 }, rounds: 18 },
  { r: [10, 12], name: 'Pánico', desc: 'Pierde su próximo turno y falla automáticamente sus pruebas durante 1 asalto.', eff: { cower: true }, rounds: 1 },
];

// Configuración de combates. Se asocian al párrafo donde aparecen los destinos de victoria/derrota.
// outcomes: win (ambos gemelos vivos), twin (gana pero muere un gemelo), lose (derrota o mueren ambos)
const COMBATS = {
  'B1:1-19': { extra: [['bolgSlasher', 1]], title: 'Emboscada en el camino', basic: [['bolgSlasher', 2]], initFromHistory: { 'B1:1-16': 'pc', 'B1:1-17': 'enemy' }, mkAsk: true,
    outcomes: { win: 'B1:1-21', twin: 'B1:1-21', lose: 'B1:1-22' } },
  'B1:1-20': { ref: 'B1:1-19' },
  'B1:3-26': { extra: [['bolgSlasher', 1]], title: 'La guarida bárbara', basic: [['bolgWarsword', 1]], initLoseIfFrom: ['B1:3-12'],
    outcomes: { win: 'B1:3-27', twin: 'E:W-1', lose: 'E:X-1' } },
  'B2:1-4': { extra: [['bolgSlasher', 1]], title: 'Asalto a la aldea', basic: [['hugl', 1]], hpModIfFrom: { 'B2:1-7': -5 }, poisonOnHit: { tn: 12, flag: 'envenenado' },
    outcomes: { win: 'B2:1-5', twin: 'E:W-1', lose: 'E:X-1' } },
  'B2:2-21': { extra: [['bolgTrooper', 1]], title: 'La guarida de los bárbaros', basic: [['hugl', 1], ['bolgTrooper', 1]], special: 'b2lair',
    outcomes: { win: 'B2:2-22', twin: 'E:W-1', lose: 'E:X-1' } },
  'B2:3-14': { extra: [['skeleton', 1]], title: 'Soldados de hueso', basic: [['skeleton', 2]], outcomes: { win: 'B2:3-15', twin: 'E:W-1', lose: 'E:X-1' } },
  'B3:3-14': { extra: [['skeleton', 1]], title: 'Genanthus el Tuerto', basic: [['genanthus', 1], ['skeleton', 1]], place: { skeleton: 'F', genanthus: 'ER' }, initBonusIfFrom: { 'B3:3-13': 2 },
    outcomes: { win: 'B3:3-15', twin: 'E:W-1', lose: 'E:X-1' } },
  'B4:2-18': { extra: [['oddRock', 1]], title: 'La Flecha Alcaloide', basic: [['alkaloid', 1], ['oddRock', 1]], place: { oddRock: 'F', alkaloid: 'ER' },
    outcomes: { win: 'B4:2-19', twin: 'E:W-1', lose: 'E:X-1' } },
  'B4:3-7': { extra: [['golem', 1]], title: 'El jardín secreto', basic: [['cultist', 1], ['golem', 1]], outcomes: { win: 'B4:3-8', twin: 'E:W-1', lose: 'E:X-1' } },
  'B5:1-6': { title: 'Duelo con el caballero', basic: [['knight', 1]], special: 'duel', place: { knight: 'F' },
    outcomes: { win: 'B5:1-7', lose: 'B5:1-8', twin: 'B5:1-8' } },
  'B5:2-19': { extra: [['ghast', 1]], title: 'El ogro infiltrado', basic: [['ogre', 1], ['ghast', 1]], ambushIfFrom: ['B5:2-17'], special: 'dylan',
    outcomes: { win: 'B5:2-20', twin: 'E:W-1', lose: 'E:X-1' } },
  'B5:3-9': { extraMods: { ledra: { hp: 25, mp: 10 } }, title: 'El Daemon de Selena', basic: [['ledra', 1]], special: 'ledraClocks',
    outcomes: { win: 'B5:3-10', twin: 'E:W-1', lose: 'E:X-1' } },
  'B6:2-7': { extra: [['ghast', 1]], title: 'Asesinos en el pasillo', basic: [['dawnPrime', 1], ['ghast', 1]], ambushIfFrom: ['B6:2-6'],
    outcomes: { win: 'B6:2-8', twin: 'E:W-1', lose: 'E:X-1' } },
  'B6:2-13': { title: 'El escudo del espíritu', basic: [['shield', 1]], special: 'shield', place: { shield: 'F' }, noInit: 'pc',
    outcomes: { win: 'B6:2-14', twin: 'B6:2-14', lose: 'B6:2-14' } },
  'B6:3-14': { extraMods: { ledra: { hp: 20, mp: 10 } }, title: 'El Daemon que posee a Lux', basic: [['ledra', 1]], special: 'ledraLux',
    outcomes: { win: 'B6:3-15', twin: 'B6:3-15', lose: 'E:X-1' } },
  'B6:3-19': { extraMods: { shadowSaber: { hp: 25 }, heide: { mp: 10 } }, title: 'Heide y el Sable Sombrío', basic: [['heide', 1], ['shadowSaber', 1]], place: { shadowSaber: 'F', heide: 'ER' },
    outcomes: { win: 'B6:3-20', twin: 'E:V-1', lose: 'E:XX-1' } },
};

const SCEN_TITLES = {
  B1: ['Señales de peligro', 'Saqueadores', 'Aldea y templo', 'La inundación de la represa'],
  B2: ['Veneno', 'Aldea pequeña', 'Medicina', 'El aroma de las flores peligrosas'],
  B3: ['El valle de las bestias', 'Camino al peligro', 'Una audiencia', 'La cacería'],
  B4: ['Oscuridad en la capital real', 'Nobleza', 'Asesino', 'La Aguja del Crepúsculo'],
  B5: ['El conde Einherr', 'Rumbo a Haven', 'Engaño', 'Alianza'],
  B6: ['La boda roja', 'El mensajero', 'Infiltración', 'El fin del orgullo'],
};

// Objetos clave del relato (para la lista de notas)
const KEY_ITEMS = ['<Espada del Rey>', '<Pluma Dorada>', '<Grimorio del Sabio>', '<Crónica de la Familia Murcio>', '<Carta del Director Carlyle>', '<Daga y Carta del Caballero Intrépido>', '<Piedra Guardiana>'];
