export const DB_NAME = "agenda2026_db";
export const DB_VER = 1;

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = () => {
      const db = req.result;

      // Diário: key = YYYY-MM-DD
      if(!db.objectStoreNames.contains("diary")){
        const s = db.createObjectStore("diary", { keyPath:"id" });
        s.createIndex("date", "date", { unique:true });
        s.createIndex("updatedAt", "updatedAt");
      }

      // Caixa: key = uuid
      if(!db.objectStoreNames.contains("cash")){
        const s = db.createObjectStore("cash", { keyPath:"id" });
        s.createIndex("dateTime", "dateTime");
        s.createIndex("type", "type");
        s.createIndex("category", "category");
      }

      // Anexos: key = uuid
      if(!db.objectStoreNames.contains("attach")){
        const s = db.createObjectStore("attach", { keyPath:"id" });
        s.createIndex("txId", "txId");
        s.createIndex("createdAt", "createdAt");
      }

      // Config
      if(!db.objectStoreNames.contains("config")){
        db.createObjectStore("config", { keyPath:"key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}

// helpers
export const uuid = () =>
  (crypto?.randomUUID?.() ?? (Date.now()+"-"+Math.random().toString(16).slice(2)));

export async function setConfig(key, value){
  return tx("config","readwrite",(s)=>s.put({key, value}));
}
export async function getConfig(key){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const t = db.transaction("config","readonly");
    const s = t.objectStore("config");
    const r = s.get(key);
    r.onsuccess = ()=> resolve(r.result?.value ?? null);
    r.onerror = ()=> reject(r.error);
  });
}

// Diário
export async function getDiary(id){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const t=db.transaction("diary","readonly");
    const s=t.objectStore("diary");
    const r=s.get(id);
    r.onsuccess=()=>resolve(r.result||null);
    r.onerror=()=>reject(r.error);
  });
}
export async function putDiary(entry){
  entry.updatedAt = Date.now();
  return tx("diary","readwrite",(s)=>s.put(entry));
}
export async function searchDiary(text){
  // busca simples: varre (ok p/ 1 ano)
  const all = await listDiary();
  const q = (text||"").toLowerCase().trim();
  if(!q) return all;
  return all.filter(e =>
    (e.text||"").toLowerCase().includes(q) ||
    (e.tags||[]).join(" ").toLowerCase().includes(q)
  );
}
export async function listDiary(){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const t=db.transaction("diary","readonly");
    const s=t.objectStore("diary");
    const r=s.getAll();
    r.onsuccess=()=>resolve((r.result||[]).sort((a,b)=>a.date.localeCompare(b.date)));
    r.onerror=()=>reject(r.error);
  });
}

// Caixa
export async function addCash(txn){
  return tx("cash","readwrite",(s)=>s.put(txn));
}
export async function deleteCash(id){
  return tx("cash","readwrite",(s)=>s.delete(id));
}
export async function listCash(){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const t=db.transaction("cash","readonly");
    const s=t.objectStore("cash");
    const r=s.getAll();
    r.onsuccess=()=>resolve((r.result||[]).sort((a,b)=>b.dateTime - a.dateTime));
    r.onerror=()=>reject(r.error);
  });
}
export async function listCashByRange(startMs, endMs){
  const all = await listCash();
  return all.filter(x => x.dateTime >= startMs && x.dateTime <= endMs);
}

// Anexos
export async function addAttachment(att){
  return tx("attach","readwrite",(s)=>s.put(att));
}
export async function listAttachmentsByTx(txId){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const t=db.transaction("attach","readonly");
    const s=t.objectStore("attach").index("txId");
    const r=s.getAll(IDBKeyRange.only(txId));
    r.onsuccess=()=>resolve(r.result||[]);
    r.onerror=()=>reject(r.error);
  });
}
export async function deleteAttachment(id){
  return tx("attach","readwrite",(s)=>s.delete(id));
}

// Backup completo
export async function exportAll(){
  const diary = await listDiary();
  const cash  = await listCash();

  // anexos: exporta como base64 (atenção: pode ficar grande)
  const db = await openDB();
  const attach = await new Promise((resolve,reject)=>{
    const t=db.transaction("attach","readonly");
    const s=t.objectStore("attach");
    const r=s.getAll();
    r.onsuccess=()=>resolve(r.result||[]);
    r.onerror=()=>reject(r.error);
  });

  const attachPacked = [];
  for (const a of attach){
    const b64 = await blobToBase64(a.blob);
    const tb64 = a.thumbBlob ? await blobToBase64(a.thumbBlob) : null;
    attachPacked.push({ ...a, blob:b64, thumbBlob:tb64 });
  }

  return { version:1, exportedAt: new Date().toISOString(), diary, cash, attach: attachPacked };
}

export async function importAll(payload){
  // limpa e importa (simples e direto)
  const db = await openDB();
  await new Promise((resolve,reject)=>{
    const t=db.transaction(["diary","cash","attach"],"readwrite");
    t.objectStore("diary").clear();
    t.objectStore("cash").clear();
    t.objectStore("attach").clear();
    t.oncomplete=resolve; t.onerror=()=>reject(t.error);
  });

  for (const e of payload.diary || []) await putDiary(e);
  for (const c of payload.cash || []) await addCash(c);

  for (const a of payload.attach || []){
    const blob = base64ToBlob(a.blob, a.mime);
    const thumb = a.thumbBlob ? base64ToBlob(a.thumbBlob, a.mime) : null;
    await addAttachment({ ...a, blob, thumbBlob: thumb });
  }
}

async function blobToBase64(blob){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(r.result);
    r.onerror = ()=> reject(r.error);
    r.readAsDataURL(blob);
  });
}
function base64ToBlob(dataUrl, mime){
  // data:*/*;base64,.....
  const parts = dataUrl.split(",");
  const b64 = parts[1] || "";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new Blob([arr], { type: mime || "application/octet-stream" });
    }
