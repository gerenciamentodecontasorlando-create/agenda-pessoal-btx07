export async function pdfDiary(entries, title="Diário 2026"){
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([595, 842]); // A4
  let y = 820;

  const drawLine = () => {
    page.drawLine({ start:{x:40,y:y}, end:{x:555,y:y}, thickness:1, color: rgb(0.2,0.6,0.62) });
    y -= 10;
  };

  page.drawText(title, { x:40, y:y, size:18, font:fontB, color: rgb(0.2,0.6,0.62) });
  y -= 22;
  page.drawText(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, { x:40, y:y, size:10, font, color: rgb(0.7,0.75,0.85) });
  y -= 18;
  drawLine();

  for (const e of entries){
    const head = `${e.date}  •  tags: ${(e.tags||[]).join(", ") || "-"}`;
    const body = (e.text||"").trim() || "(sem texto)";

    const blocks = wrapText(body, 92);

    if(y < 120){
      page = pdf.addPage([595, 842]);
      y = 820;
    }

    page.drawText(head, { x:40, y:y, size:11, font:fontB, color: rgb(0.9,0.92,0.98) });
    y -= 14;

    for (const line of blocks){
      if(y < 70){
        page = pdf.addPage([595, 842]);
        y = 820;
      }
      page.drawText(line, { x:40, y:y, size:10.5, font, color: rgb(0.88,0.9,0.96) });
      y -= 13;
    }
    y -= 6;
    page.drawLine({ start:{x:40,y:y}, end:{x:555,y:y}, thickness:0.5, color: rgb(0.2,0.25,0.35) });
    y -= 12;
  }

  return await pdf.save();
}

export async function pdfCash(txns, title="Livro Caixa 2026"){
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);

  const totalIn = sum(txns.filter(t=>t.type==="in").map(t=>t.amountCents));
  const totalOut = sum(txns.filter(t=>t.type==="out").map(t=>t.amountCents));
  const balance = totalIn - totalOut;

  let page = pdf.addPage([595, 842]);
  let y = 820;

  page.drawText(title, { x:40, y:y, size:18, font:fontB, color: rgb(0.2,0.6,0.62) });
  y -= 22;
  page.drawText(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, { x:40, y:y, size:10, font, color: rgb(0.7,0.75,0.85) });
  y -= 18;

  const money = (cents)=> (cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

  page.drawText(`Entradas: ${money(totalIn)}   •   Saídas: ${money(totalOut)}   •   Saldo: ${money(balance)}`, {
    x:40, y:y, size:11, font:fontB, color: rgb(0.92,0.95,0.99)
  });
  y -= 16;
  page.drawLine({ start:{x:40,y:y}, end:{x:555,y:y}, thickness:1, color: rgb(0.2,0.6,0.62) });
  y -= 12;

  // Cabeçalho tabela
  const cols = [
    {x:40,  w:90,  name:"Data"},
    {x:130, w:70,  name:"Tipo"},
    {x:200, w:90,  name:"Valor"},
    {x:290, w:120, name:"Categoria"},
    {x:410, w:145, name:"Descrição"},
  ];

  drawRow(page, y, cols.map(c=>c.name), fontB, 10.5);
  y -= 14;
  page.drawLine({ start:{x:40,y:y}, end:{x:555,y:y}, thickness:0.5, color: rgb(0.25,0.3,0.4) });
  y -= 10;

  for (const t of txns.sort((a,b)=>a.dateTime-b.dateTime)){
    if(y < 70){
      page = pdf.addPage([595, 842]);
      y = 820;
    }
    const d = new Date(t.dateTime).toLocaleString("pt-BR");
    const tipo = t.type==="in" ? "Entrada" : "Saída";
    const valor = money(t.amountCents);
    const cat = t.category || "-";
    const desc = (t.description||"").trim() || "-";

    const row = [d, tipo, valor, cat, desc];
    drawRow(page, y, row, font, 10);
    y -= 14;
  }

  return await pdf.save();

  function drawRow(p, y, arr, f, size){
    for(let i=0;i<arr.length;i++){
      const x = cols[i].x;
      const w = cols[i].w;
      const text = fitText(arr[i], w, 40); // bem simples
      p.drawText(text, { x, y, size, font:f, color: rgb(0.88,0.9,0.96) });
    }
  }
}

function sum(a){ return a.reduce((acc,v)=>acc+v,0); }

function wrapText(text, maxChars){
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words){
    const test = (line ? line + " " : "") + w;
    if(test.length > maxChars){
      if(line) lines.push(line);
      line = w;
    } else line = test;
  }
  if(line) lines.push(line);
  return lines;
}

function fitText(text, w, approxCharPx){
  // aproximação: limita caracteres pela largura
  const max = Math.max(10, Math.floor(w / (approxCharPx/4)));
  const s = (text || "").toString();
  return s.length > max ? s.slice(0, max-1) + "…" : s;
}
