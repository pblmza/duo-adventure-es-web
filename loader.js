// Cargador del paquete de contenido (texto + imágenes) para la versión web pública.
'use strict';
const PACK_DB = 'duo-adventure-pack', PACK_STORE = 'pack';
const IMG = {};
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(PACK_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(PACK_STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) { const db = await idb(); return new Promise((res) => { const t = db.transaction(PACK_STORE).objectStore(PACK_STORE).get(k); t.onsuccess = () => res(t.result); t.onerror = () => res(null); }); }
async function idbPut(k, v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(PACK_STORE, 'readwrite'); tx.objectStore(PACK_STORE).put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
function b64ToBlob(uri) {
  const [head, b64] = uri.split(','); const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: head.slice(5).split(';')[0] });
}
function fixImgs(root) {
  (root.querySelectorAll ? root.querySelectorAll('img[src^="img/"]') : []).forEach((im) => { const k = im.getAttribute('src'); if (IMG[k]) im.src = IMG[k]; });
}
function activate(pack) {
  window.BOOK = pack.book;
  for (const [k, uri] of Object.entries(pack.images)) IMG[k] = URL.createObjectURL(b64ToBlob(uri));
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && (n.matches && n.matches('img[src^="img/"]') ? fixImgs(n.parentNode) : fixImgs(n))))).observe(document.body, { childList: true, subtree: true });
  appInit(); fixImgs(document);
}
async function boot() {
  const pack = await idbGet('pack');
  if (pack && pack.book) return activate(pack);
  document.getElementById('main').innerHTML = `<div class="start"><h1>Sword World 2.5<br><small>Duo Adventure</small></h1>
    <div class="card newgame"><h3>Cargar el contenido del libro</h3>
    <p>Esta página solo contiene el motor del juego. Para jugar, importa una vez tu archivo <b>duo-adventure-contenido.json</b> (está en tu iCloud Drive). Queda guardado en este navegador.</p>
    <label class="btn primary big">Elegir archivo…<input type="file" id="packFile" accept=".json,application/json" hidden></label>
    <p id="packMsg" class="muted"></p></div></div>`;
  document.getElementById('packFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const msg = document.getElementById('packMsg'); msg.textContent = 'Leyendo…';
    try {
      const pack = JSON.parse(await f.text());
      if (!pack.book || !pack.images) throw new Error('El archivo no es un paquete de Duo Adventure.');
      await idbPut('pack', pack); msg.textContent = 'Listo.'; activate(pack);
    } catch (err) { msg.textContent = 'Error: ' + err.message; }
  };
}
window.addEventListener('DOMContentLoaded', () => { if (typeof BOOK === 'undefined') boot(); });
