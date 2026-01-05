import {
  uuid, getDiary, putDiary, searchDiary, listDiary,
  addCash, deleteCash, listCash, listCashByRange,
  addAttachment, listAttachmentsByTx, deleteAttachment,
  exportAll, importAll
} from "./db.js";

import { pdfDiary, pdfCash } from "./report.js";

const view = document.getElementById("view");
const statusEl = document.getElementById("status");
const tabs = Array.from(document.querySelectorAll(".tab"));

const state = {
  route: "home",
  diaryDate: todayISO(),
};

init();

async function init(){
  // SW
  if("serviceWorker" in navigator){
    try { await navigator.serviceWorker.register("./sw.js"); }
    catch(e){ console.warn("SW falhou", e); }
  }

  // tabs
  tabs.forEach(b=>{
    b.onclick = () => setRoute(b.dataset.route);
  });

  setRoute("home");
}

function setStatus(msg){
  statusEl.textContent = msg;
  setTimeout(()=>{ statusEl.textContent = "Pronto."; }, 3000);
}

function setRoute(route){
  state.route = route;
  tabs.forEach(t=>t.classList.toggle("active", t.dataset.route===route));
  render();
}

async function render(){
  if(state.route==="home") return renderHome();
  if(state.route==="diary") return renderDiary();
  if(state.route==="cash") return renderCash();
  if(state.route==="reports") return renderReports();
  if(state.route==="backup") return renderBackup();
}

/* ---------- HOME ---------- */
async function renderHome(){
  const d = await getDiary(todayISO()) || { id:todayISO(), date:todayISO(), text:"", tags:[] };
  const txns = await listCash();
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const todayTx = txns.filter(t=>t.dateTime>=todayStart.getTime() && t.dateTime<=todayEnd.getTime());

  const totalIn = sum(todayTx.filter(t=>t.type==="in").map(t=>t.amountCents));
  const totalOut= sum(todayTx.filter(t=>t.type==="out").map(t=>t.amountCents));

  view.innerHTML = `
    <section class="card">
      <div class="h1">Hoje • ${fmtDateBR(new Date())}</div>
      <div class="h2">Diário e caixa do dia, com memória longitudinal.</div>

      <div class="grid grid2">
        <div class="card">
          <div class="h1">Diário de hoje</div>
          <div class="h2">Escreve e salva automaticamente.</div>
          <textarea id="homeText" placeholder="Escreva aqui...">${escapeHTML(d.text||"")}</textarea>
          <div class="row" style="margin-top:10px">
            <input id="homeTags" placeholder="tags (separadas por vírgula)" value="${(d.tags||[]).join(", ")}" />
            <button class="btn" id="goDiary">Abrir Diário</button>
          </div>
          <div class="small" style="margin-top:10px">Autosave em tempo real (sem travar).</div>
        </div>

        <div class="card">
          <div class="h1">Livro Caixa do dia</div>
          <div class="h2">Resumo rápido.</div>
          <div class="row">
            <span class="badge">Entradas: <b>${money(totalIn)}</b></span>
            <span class="badge">Saídas: <b>${money(totalOut)}</b></span>
            <span class="badge">Saldo: <b>${money(totalIn-totalOut)}</b></span>
          </div>
          <div class="sep"></div>
          <button class="btn" id="goCash">Abrir Livro Caixa</button>
        </div>
      </div>
    </section>
  `;

  const homeText = document.getElementById("homeText");
  const homeTags = document.getElementById("homeTags");
  let timer = null;

  const autosave = async ()=>{
    clearTimeout(timer);
    timer = setTimeout(async ()=>{
      const tags = (homeTags.value||"")
        .split(",").map(s=>s.trim()).filter(Boolean);
      await putDiary({ id:d.id, date:d.date, text: homeText.value, tags });
      setStatus("Diário salvo.");
    }, 350);
  };

  homeText.addEventListener("input", autosave);
  homeTags.addEventListener("input", autosave);

  document.getElementById("goDiary").onclick = ()=> setRoute("diary");
  document.getElementById("goCash").onclick = ()=> setRoute("cash");
}

/* ---------- DIARY ---------- */
async function renderDiary(){
  const id = state.diaryDate;
  const entry = await getDiary(id) || { id, date:id, text:"", tags:[] };

  view.innerHTML = `
    <section class="card">
      <div class="row" style="justify-content:space-between">
        <div>
          <div class="h1">Diário 2026</div>
          <div class="h2">Escolhe o dia e escreve. Isso vira memória longitudinal real.</div>
        </div>
        <div class="row">
          <input id="datePick" type="date" value="${entry.date}" />
          <button class="btn secondary" id="todayBtn">Hoje</button>
        </div>
      </div>

      <div class="sep"></div>

      <div class="grid grid2">
        <div>
          <label class="small">Texto do dia</label>
          <textarea id="diaryText" placeholder="Escreva seu dia...">${escapeHTML(entry.text||"")}</textarea>

          <div class="row" style="margin-top:10px">
            <input id="diaryTags" placeholder="tags (vírgula)" value="${(entry.tags||[]).join(", ")}" />
            <button class="btn" id="pdfDay">PDF do dia</button>
          </div>
          <div class="small" style="margin-top:10px">Autosave em tempo real.</div>
        </div>

        <div>
          <div class="h1">Busca (memória)</div>
          <div class="h2">Procura por palavra ou tag em 2026.</div>
          <input id="q" placeholder="ex.: 'implant', 'família', 'pix'..." />
          <div class="sep"></div>
          <div id="results" class="list"></div>
        </div>
      </div>
    </section>
  `;

  const datePick = document.getElementById("datePick");
  const diaryText = document.getElementById("diaryText");
  const diaryTags = document.getElementById("diaryTags");
  const q = document.getElementById("q");
  const results = document.getElementById("results");

  let timer=null;
  const autosave = async ()=>{
    clearTimeout(timer);
    timer=setTimeout(async ()=>{
      const tags = (diaryTags.value||"").split(",").map(s=>s.trim()).filter(Boolean);
      await putDiary({ id: state.diaryDate, date: state.diaryDate, text: diaryText.value, tags });
      setStatus("Diário salvo.");
    }, 350);
  };

  datePick.onchange = async ()=>{
    state.diaryDate = datePick.value;
    renderDiary();
  };
  document.getElementById("todayBtn").onclick = ()=>{
    state.diaryDate = todayISO();
    renderDiary();
  };

  diaryText.addEventListener("input", autosave);
  diaryTags.addEventListener("input", autosave);

  q.addEventListener("input", async ()=>{
    const found = await searchDiary(q.value);
    results.innerHTML = found.slice(0,30).map(e=>`
      <div class="item" data-id="${e.id}">
        <div class="itemTitle">${e.date}</div>
        <div class="itemMeta">${escapeHTML((e.text||"").slice(0,120))}${(e.text||"").length>120?"…":""}</div>
      </div>
    `).join("") || `<div class="small muted">Nada ainda.</div>`;

    results.querySelectorAll(".item").forEach(it=>{
      it.onclick = ()=>{
        state.diaryDate = it.dataset.id;
        renderDiary();
      };
    });
  });

  document.getElementById("pdfDay").onclick = async ()=>{
    const current = await getDiary(state.diaryDate) || { id:state.diaryDate, date:state.diaryDate, text:"", tags:[] };
    const bytes = await pdfDiary([current], `Diário • ${current.date}`);
    downloadBytes(bytes, `diario_${current.date}.pdf`, "application/pdf");
  };
}

/* ---------- CASH ---------- */
async function renderCash(){
  const txns = await listCash();
  const cats = ["Pix","Bancos","Clínica","Casa","Mercado","Transporte","Educação","Saúde","Outros"];

  view.innerHTML = `
    <section class="card">
      <div class="h1">Livro Caixa</div>
      <div class="h2">Entradas/saídas com anexos (comprovantes) e memória por período.</div>

      <div class="grid grid2">
        <div class="card">
          <div class="h1">Novo lançamento</div>

          <div class="row">
            <select id="type">
              <option value="in">Entrada</option>
              <option value="out">Saída</option>
            </select>
            <input id="amount" inputmode="decimal" placeholder="Valor (ex.: 120,50)" />
          </div>

          <div class="row" style="margin-top:10px">
            <select id="cat">
              ${cats.map(c=>`<option>${c}</option>`).join("")}
            </select>
            <select id="method">
              <option>Pix</option>
              <option>Débito</option>
              <option>Crédito</option>
              <option>Dinheiro</option>
              <option>Transferência</option>
            </select>
          </div>

          <div style="margin-top:10px">
            <input id="desc" placeholder="Descrição (ex.: consulta, material, mercado...)" />
          </div>

          <div class="row" style="margin-top:10px">
            <input id="dt" type="datetime-local" />
            <button class="btn" id="saveTx">Salvar</button>
          </div>

          <div class="sep"></div>

          <div class="h1">Anexar comprovantes</div>
          <div class="h2">Você anexa depois de salvar (sem travar).</div>
          <div class="small muted">Dica: foto é comprimida antes de guardar.</div>
        </div>

        <div class="card">
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="h1">Lançamentos</div>
              <div class="h2">${txns.length} registros</div>
            </div>
            <button class="btn secondary" id="refresh">Atualizar</button>
          </div>

          <div class="sep"></div>

          <div id="txList" class="list"></div>
        </div>
      </div>
    </section>
  `;

  const dt = document.getElementById("dt");
  dt.value = toDTLocal(new Date());

  document.getElementById("refresh").onclick = ()=> renderCash();

  document.getElementById("saveTx").onclick = async ()=>{
    const type = document.getElementById("type").value;
    const amountRaw = document.getElementById("amount").value;
    const amountCents = parseMoneyToCents(amountRaw);
    if(!amountCents){ setStatus("Valor inválido."); return; }

    const txn = {
      id: uuid(),
      dateTime: new Date(dt.value || new Date()).getTime(),
      type,
      amountCents,
      category: document.getElementById("cat").value,
      method: document.getElementById("method").value,
      description: document.getElementById("desc").value || ""
    };

    await addCash(txn);
    setStatus("Lançamento salvo.");
    renderCash();
  };

  // lista
  const txList = document.getElementById("txList");
  txList.innerHTML = txns.map(t=>`
    <div class="item" data-id="${t.id}">
      <div class="row" style="justify-content:space-between">
        <div class="itemTitle">${t.type==="in"?"✅ Entrada":"🧾 Saída"} • ${money(t.amountCents)}</div>
        <button class="btn secondary" data-act="open">Abrir</button>
      </div>
      <div class="itemMeta">
        ${fmtDateTimeBR(new Date(t.dateTime))} • ${escapeHTML(t.category||"-")} • ${escapeHTML(t.method||"-")}<br/>
        ${escapeHTML(t.description||"")}
      </div>
    </div>
  `).join("") || `<div class="small muted">Ainda vazio. Bora registrar 2026 com poder.</div>`;

  txList.querySelectorAll(".item [data-act='open']").forEach(btn=>{
    btn.onclick = async (ev)=>{
      ev.stopPropagation();
      const id = btn.closest(".item").dataset.id;
      openTxModalLike(id); // “modal” sem travar: é só renderizar uma tela leve dentro do view
    };
  });

  async function openTxModalLike(txId){
    const txnsAll = await listCash();
    const t = txnsAll.find(x=>x.id===txId);
    const atts = await listAttachmentsByTx(txId);

    view.innerHTML = `
      <section class="card">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="h1">Lançamento</div>
            <div class="h2">${fmtDateTimeBR(new Date(t.dateTime))} • ${t.type==="in"?"Entrada":"Saída"}</div>
          </div>
          <div class="row">
            <button class="btn secondary" id="back">Voltar</button>
            <button class="btn danger" id="del">Excluir</button>
          </div>
        </div>

        <div class="sep"></div>

        <div class="row">
          <span class="badge">Valor: <b>${money(t.amountCents)}</b></span>
          <span class="badge">Categoria: <b>${escapeHTML(t.category||"-")}</b></span>
          <span class="badge">Método: <b>${escapeHTML(t.method||"-")}</b></span>
        </div>

        <div class="sep"></div>

        <div class="h1">Comprovantes (fotos)</div>
        <div class="h2">Anexe e mantenha tudo organizado por ano.</div>

        <div class="row">
          <input id="file" type="file" accept="image/*" multiple />
          <button class="btn" id="addAtt">Adicionar</button>
        </div>

        <div id="thumbs" class="thumbRow"></div>

        <div class="sep"></div>
        <button class="btn" id="pdfOne">PDF deste lançamento</button>
      </section>
    `;

    document.getElementById("back").onclick = ()=> renderCash();
    document.getElementById("del").onclick = async ()=>{
      // apaga anexos também
      for(const a of atts) await deleteAttachment(a.id);
      await deleteCash(txId);
      setStatus("Excluído.");
      renderCash();
    };

    renderThumbs();

    async function renderThumbs(){
      const fresh = await listAttachmentsByTx(txId);
      const thumbs = document.getElementById("thumbs");
      thumbs.innerHTML = fresh.map(a=>{
        const url = URL.createObjectURL(a.thumbBlob || a.blob);
        return `
          <div>
            <img class="thumb" src="${url}" alt="comprovante"/>
            <div class="row" style="margin-top:6px">
              <button class="btn secondary" data-del="${a.id}">Remover</button>
            </div>
          </div>
        `;
      }).join("") || `<div class="small muted">Nenhum comprovante anexado.</div>`;

      thumbs.querySelectorAll("[data-del]").forEach(b=>{
        b.onclick = async ()=>{
          await deleteAttachment(b.dataset.del);
          setStatus("Anexo removido.");
          renderThumbs();
        };
      });
    }

    document.getElementById("addAtt").onclick = async ()=>{
      const input = document.getElementById("file");
      const files = Array.from(input.files || []);
      if(!files.length){ setStatus("Selecione uma foto."); return; }

      for(const f of files){
        const { blob, thumbBlob } = await compressImageFile(f, 1280, 0.72);
        await addAttachment({
          id: uuid(),
          txId,
          mime: "image/jpeg",
          blob,
          thumbBlob,
          createdAt: Date.now()
        });
      }
      input.value = "";
      setStatus("Comprovante anexado.");
      renderThumbs();
    };

    document.getElementById("pdfOne").onclick = async ()=>{
      const list = await listCash();
      const one = list.filter(x=>x.id===txId);
      const bytes = await pdfCash(one, `Lançamento • ${fmtDateTimeBR(new Date(t.dateTime))}`);
      downloadBytes(bytes, `caixa_lancamento_${txId}.pdf`, "application/pdf");
    };
  }
}

/* ---------- REPORTS ---------- */
async function renderReports(){
  view.innerHTML = `
    <section class="card">
      <div class="h1">Relatórios em PDF</div>
      <div class="h2">Diário e Caixa por período. Perfeito pra arquivar 2026.</div>

      <div class="grid grid2">
        <div class="card">
          <div class="h1">Diário</div>
          <div class="h2">Escolha um período e gere o PDF.</div>
          <div class="row">
            <input id="d1" type="date" />
            <input id="d2" type="date" />
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn" id="pdfDiaryRange">Gerar PDF (Diário)</button>
            <button class="btn secondary" id="pdfDiaryAll">PDF do Ano (tudo)</button>
          </div>
        </div>

        <div class="card">
          <div class="h1">Livro Caixa</div>
          <div class="h2">Resumo e lista detalhada em PDF.</div>
          <div class="row">
            <input id="c1" type="date" />
            <input id="c2" type="date" />
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn" id="pdfCashRange">Gerar PDF (Caixa)</button>
            <button class="btn secondary" id="pdfCashAll">PDF do Ano (tudo)</button>
          </div>
        </div>
      </div>
    </section>
  `;

  // defaults: mês atual
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth()+1, 0);

  setDate("d1", first); setDate("d2", last);
  setDate("c1", first); setDate("c2", last);

  document.getElementById("pdfDiaryRange").onclick = async ()=>{
    const a = document.getElementById("d1").value;
    const b = document.getElementById("d2").value;
    const all = await listDiary();
    const chosen = all.filter(e => e.date >= a && e.date <= b);
    const bytes = await pdfDiary(chosen, `Diário • ${a} a ${b}`);
    downloadBytes(bytes, `diario_${a}_a_${b}.pdf`, "application/pdf");
  };

  document.getElementById("pdfDiaryAll").onclick = async ()=>{
    const all = await listDiary();
    const bytes = await pdfDiary(all, `Diário • Ano 2026`);
    downloadBytes(bytes, `diario_2026.pdf`, "application/pdf");
  };

  document.getElementById("pdfCashRange").onclick = async ()=>{
    const a = document.getElementById("c1").value;
    const b = document.getElementById("c2").value;
    const start = new Date(a); start.setHours(0,0,0,0);
    const end = new Date(b); end.setHours(23,59,59,999);
    const chosen = await listCashByRange(start.getTime(), end.getTime());
    const bytes = await pdfCash(chosen, `Livro Caixa • ${a} a ${b}`);
    downloadBytes(bytes, `caixa_${a}_a_${b}.pdf`, "application/pdf");
  };

  document.getElementById("pdfCashAll").onclick = async ()=>{
    const all = await listCash();
    const bytes = await pdfCash(all, `Livro Caixa • Ano 2026`);
    downloadBytes(bytes, `caixa_2026.pdf`, "application/pdf");
  };
}

/* ---------- BACKUP ---------- */
async function renderBackup(){
  view.innerHTML = `
    <section class="card">
      <div class="h1">Backup</div>
      <div class="h2">Exporta/importa tudo (diário + caixa + anexos). Isso dá mobilidade real.</div>

      <div class="grid grid2">
        <div class="card">
          <div class="h1">Exportar</div>
          <div class="h2">Baixa um arquivo .json com tudo.</div>
          <button class="btn" id="export">Exportar Backup</button>
          <div class="small muted" style="margin-top:10px">
            Obs: se tiver muita foto, o arquivo pode ficar grande (normal).
          </div>
        </div>

        <div class="card">
          <div class="h1">Importar</div>
          <div class="h2">Restaura um backup anterior.</div>
          <input id="file" type="file" accept="application/json" />
          <button class="btn danger" id="import">Importar (substitui tudo)</button>
        </div>
      </div>
    </section>
  `;

  document.getElementById("export").onclick = async ()=>{
    const payload = await exportAll();
    const blob = new Blob([JSON.stringify(payload)], {type:"application/json"});
    downloadBlob(blob, `backup_agenda2026_${new Date().toISOString().slice(0,10)}.json`);
  };

  document.getElementById("import").onclick = async ()=>{
    const f = document.getElementById("file").files?.[0];
    if(!f){ setStatus("Selecione o arquivo de backup."); return; }
    const text = await f.text();
    const payload = JSON.parse(text);
    await importAll(payload);
    setStatus("Backup restaurado.");
    setRoute("home");
  };
}

/* ---------- Helpers ---------- */

function todayISO(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function fmtDateBR(d){
  return d.toLocaleDateString("pt-BR");
}
function fmtDateTimeBR(d){
  return d.toLocaleString("pt-BR");
}
function money(cents){
  return (cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}
function sum(a){ return a.reduce((acc,v)=>acc+v,0); }

function parseMoneyToCents(s){
  if(!s) return 0;
  // aceita "120,50" "120.50" "120"
  const clean = s.replace(/[^\d.,]/g,"").replace(",",".");
  const v = Number(clean);
  if(!isFinite(v) || v<=0) return 0;
  return Math.round(v*100);
}

function toDTLocal(d){
  const pad = n=> String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setDate(id, d){
  const el = document.getElementById(id);
  const pad = n=> String(n).padStart(2,"0");
  el.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function downloadBytes(bytes, filename, mime){
  const blob = new Blob([bytes], {type: mime || "application/octet-stream"});
  downloadBlob(blob, filename);
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function escapeHTML(s){
  return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

// compressão de imagem (pra não travar)
async function compressImageFile(file, maxW=1280, quality=0.72){
  const img = await fileToImage(file);
  const ratio = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));

  // thumb
  const tW = 320;
  const tRatio = Math.min(1, tW / img.width);
  const tw = Math.round(img.width * tRatio);
  const th = Math.round(img.height * tRatio);

  const c2 = document.createElement("canvas");
  c2.width = tw; c2.height = th;
  const ctx2 = c2.getContext("2d");
  ctx2.drawImage(img, 0, 0, tw, th);
  const thumbBlob = await new Promise(resolve => c2.toBlob(resolve, "image/jpeg", 0.65));

  return { blob, thumbBlob };
}
function fileToImage(file){
  return new Promise((resolve,reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{ URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e)=>{ URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
