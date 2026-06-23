export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

// Colours
const FOREST_GREEN = [45, 80, 22];
const MID_GREEN = [58, 102, 32];
const BADGE_ON = [45, 125, 70];
const BADGE_NEEDS = [212, 130, 10];
const BADGE_BELOW = [192, 57, 43];
const DIVIDER = [200, 221, 184];
const DARK_TEXT = [26, 46, 13];
const ROW_ALT = [242, 247, 238];
const SUBHEAD_BG = [232, 242, 224];
const FLAG_RED = [192, 57, 43];

function getBadge(pct) {
  if (pct >= 0.8) return [BADGE_ON, "ON TRACK"];
  if (pct >= 0.5) return [BADGE_NEEDS, "NEEDS IMPROVEMENT"];
  return [BADGE_BELOW, "BELOW TARGET"];
}

// We generate PDF server-side using a minimal PDF builder
// (raw PDF syntax — no external lib needed, keeps bundle small)

function rgb(r, g, b) { return `${(r/255).toFixed(3)} ${(g/255).toFixed(3)} ${(b/255).toFixed(3)}`; }

class PDFDoc {
  constructor() {
    this.pages = [];
    this.currentPage = null;
    this.W = 612; // letter width pts
    this.H = 792; // letter height pts
    this.objects = [];
    this.objCount = 0;
    this.fontRef = null;
    this.fontBoldRef = null;
  }

  addObj(content) {
    this.objCount++;
    this.objects.push({ id: this.objCount, content });
    return this.objCount;
  }

  newPage() {
    const streams = [];
    const page = { streams, num: this.pages.length + 1 };
    this.pages.push(page);
    this.currentPage = page;
  }

  op(s) { this.currentPage.streams.push(s); }

  setFill(r, g, b) { this.op(`${rgb(r,g,b)} rg`); }
  setStroke(r, g, b) { this.op(`${rgb(r,g,b)} RG`); }
  setLineWidth(w) { this.op(`${w} w`); }

  rect(x, y, w, h, fill=true, stroke=false) {
    this.op(`${x} ${y} ${w} ${h} re`);
    if (fill && stroke) this.op("B");
    else if (fill) this.op("f");
    else this.op("S");
  }

  line(x1, y1, x2, y2) {
    this.op(`${x1} ${y1} m ${x2} ${y2} l S`);
  }

  setFont(bold, size) {
    const f = bold ? "F2" : "F1";
    this.op(`/${f} ${size} Tf`);
  }

  text(x, y, str) {
    const escaped = String(str)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/[^\x20-\x7E]/g, "?"); // strip non-ASCII (checkmarks etc)
    this.op(`BT ${x} ${y} Td (${escaped}) Tj ET`);
  }

  textCentered(cx, y, str, approxCharWidth) {
    const s = String(str).replace(/[^\x20-\x7E]/g, "?");
    const w = s.length * approxCharWidth;
    this.text(cx - w/2, y, s);
  }

  textRight(rx, y, str, approxCharWidth) {
    const s = String(str).replace(/[^\x20-\x7E]/g, "?");
    const w = s.length * approxCharWidth;
    this.text(rx - w, y, s);
  }

  build() {
    // Font objects
    const f1 = this.addObj(
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`
    );
    const f2 = this.addObj(
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`
    );
    const resources = this.addObj(
      `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >>`
    );

    const pageObjs = [];
    for (const page of this.pages) {
      const stream = page.streams.join("\n");
      const streamObj = this.addObj(
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
      );
      const pageObj = this.addObj(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Contents ${streamObj} 0 R /Resources ${resources} 0 R >>`
      );
      pageObjs.push(pageObj);
    }

    const pageTree = `<< /Type /Pages /Kids [${pageObjs.map(n=>`${n} 0 R`).join(" ")}] /Count ${pageObjs.length} >>`;
    // Insert page tree as obj 2
    this.objects.splice(1, 0, { id: 2, content: pageTree });
    // Re-number
    this.objects = this.objects.map((o,i) => ({ ...o, id: i+1 }));

    const catalog = `<< /Type /Catalog /Pages 2 0 R >>`;

    let out = "%PDF-1.4\n";
    const offsets = [];
    // obj 1 = catalog
    offsets.push(out.length);
    out += `1 0 obj\n${catalog}\nendobj\n`;

    for (let i = 1; i < this.objects.length; i++) {
      const o = this.objects[i];
      offsets.push(out.length);
      out += `${o.id} 0 obj\n${o.content}\nendobj\n`;
    }

    const xrefOffset = out.length;
    const total = this.objects.length + 1;
    out += `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      out += String(off).padStart(10, "0") + " 00000 n \n";
    }
    out += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return out;
  }
}

function drawHeader(doc, pageNum, weekLabel) {
  const W = doc.W, H = doc.H;
  const M = 39.6; // 0.55in

  doc.setFill(...FOREST_GREEN);
  doc.rect(0, H - 61, W, 61);

  doc.setFill(255, 255, 255);
  doc.setFont(true, 22);
  doc.text(M, H - 35, "LYONS");
  doc.setFont(false, 8);
  doc.text(M, H - 47, "LANDSCAPING");

  doc.setFont(true, 14);
  doc.textCentered(W/2, H - 30, "FOREMAN PERFORMANCE SCORECARD", 8);
  doc.setFont(false, 8.5);
  doc.textCentered(W/2, H - 42, `Week of ${weekLabel}`, 5);

  doc.setFont(false, 8);
  doc.textRight(W - M, H - 36, `Page ${pageNum} of 2`, 4.5);
}

function drawFooter(doc) {
  const W = doc.W;
  doc.setFill(...FOREST_GREEN);
  doc.rect(0, 0, W, 22);
  doc.setFill(255, 255, 255);
  doc.setFont(false, 7);
  doc.textCentered(W/2, 7, "Lyons Landscaping  |  Foreman Performance Scorecard  |  Confidential", 4);
}

function drawSectionHeader(doc, x, y, w, text) {
  doc.setFill(...SUBHEAD_BG);
  doc.rect(x, y - 1, w, 20);
  doc.setFill(...FOREST_GREEN);
  doc.rect(x, y - 1, 3, 20);
  doc.setFill(...DARK_TEXT);
  doc.setFont(true, 9);
  doc.text(x + 8, y + 5, text);
}

function drawPctBar(doc, x, y, pct, w=79, h=9) {
  doc.setFill(217, 232, 206);
  doc.rect(x, y, w, h);
  if (pct > 0) {
    const [col] = getBadge(pct);
    doc.setFill(...col);
    doc.rect(x, y, w * pct, h);
  }
}

function drawBadge(doc, x, y, pct) {
  const [col, txt] = getBadge(pct);
  const bw = 104, bh = 16;
  doc.setFill(...col);
  doc.rect(x, y, bw, bh);
  doc.setFill(255, 255, 255);
  doc.setFont(true, 7);
  doc.textCentered(x + bw/2, y + 5, txt, 5);
}

function drawComplianceRow(doc, x, y, label, submitted, total, isAlt) {
  const W = doc.W;
  const M = 39.6;
  const rw = W - 2*M;
  const rh = 27;

  doc.setFill(...(isAlt ? ROW_ALT : [255,255,255]));
  doc.rect(x, y, rw, rh);

  const pct = total > 0 ? submitted / total : 0;

  doc.setFill(...DARK_TEXT);
  doc.setFont(false, 9);
  doc.text(x + 8, y + 10, label);

  const cx = x + rw * 0.50;
  doc.setFont(true, 9);
  doc.text(cx, y + 10, `${submitted}/${total}`);

  doc.setFill(85, 85, 85);
  doc.setFont(false, 8.5);
  doc.text(cx + 27, y + 10, `${Math.round(pct*100)}%`);

  drawPctBar(doc, cx + 52, y + 6, pct);

  const bw = 104;
  drawBadge(doc, x + rw - bw - 4, y + 5, pct);

  doc.setStroke(...DIVIDER);
  doc.setLineWidth(0.5);
  doc.line(x, y, x + rw, y);
}

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const {
      foreman, scheduleLabel, weekLabel, workingDays,
      forms, dailyBreakdown, flags, dayLabels
    } = req.body;

    const doc = new PDFDoc();
    const W = doc.W, H = doc.H;
    const M = 39.6;

    // ── PAGE 1 ──
    doc.newPage();
    drawHeader(doc, 1, weekLabel);
    drawFooter(doc);

    let y = H - 76;

    // Foreman info block
    doc.setFill(247, 250, 244);
    doc.rect(M, y - 76, W - 2*M, 76);
    doc.setStroke(...DIVIDER);
    doc.setLineWidth(1);
    doc.rect(M, y - 76, W - 2*M, 76, false, true);

    doc.setFill(...DARK_TEXT);
    doc.setFont(true, 13);
    doc.text(M + 14, y - 20, foreman);
    doc.setFont(false, 9);
    doc.setFill(85, 85, 85);
    doc.text(M + 14, y - 34, `Foreman  |  ${scheduleLabel}`);

    doc.setFont(false, 8);
    doc.setFill(136, 136, 136);
    doc.text(M + 14, y - 50, "CURRENT JOB:");
    doc.setStroke(170, 170, 170);
    doc.setLineWidth(0.6);
    doc.line(M + 73, y - 49, W - M - 230, y - 49);

    // Chips
    const chipData = [
      ["Schedule", dayLabels[0].split(" ")[0] + "-" + dayLabels[dayLabels.length-1].split(" ")[0]],
      ["Working Days", String(workingDays)],
      ["Week", weekLabel],
    ];
    let chipX = W - M - 259;
    for (const [label, val] of chipData) {
      doc.setFont(false, 7.5);
      doc.setFill(136, 136, 136);
      doc.text(chipX, y - 22, label.toUpperCase());
      doc.setFont(true, 9);
      doc.setFill(...DARK_TEXT);
      doc.text(chipX, y - 34, val);
      chipX += 71;
    }

    y -= 86;

    // Compliance rows
    drawSectionHeader(doc, M, y, W - 2*M, "FORM COMPLIANCE");
    y -= 24;

    let totalSub = 0, totalPos = 0;
    for (let i = 0; i < forms.length; i++) {
      const { label, submitted, possible } = forms[i];
      drawComplianceRow(doc, M, y, label, submitted, possible, i % 2 === 0);
      totalSub += submitted;
      totalPos += possible;
      y -= 29;
    }

    y -= 14;

    // Overall score block
    const overallPct = totalPos > 0 ? totalSub / totalPos : 0;
    doc.setFill(...FOREST_GREEN);
    doc.rect(M, y - 72, W - 2*M, 72);
    doc.setFill(255, 255, 255);
    doc.setFont(true, 11);
    doc.text(M + 14, y - 20, "OVERALL COMPLIANCE SCORE");
    doc.setFont(false, 9);
    doc.text(M + 14, y - 34, `${totalSub} of ${totalPos} submissions completed`);
    doc.setFont(true, 26);
    doc.textRight(W - M - 14, y - 36, `${Math.round(overallPct*100)}%`, 15);

    const [badgeCol, badgeTxt] = getBadge(overallPct);
    const bw = 104;
    doc.setFill(...badgeCol);
    doc.rect(W - M - 14 - bw, y - 62, bw, 16);
    doc.setFill(255, 255, 255);
    doc.setFont(true, 7);
    doc.textCentered(W - M - 14 - bw/2, y - 57, badgeTxt, 5);

    // ── PAGE 2 ──
    doc.newPage();
    drawHeader(doc, 2, weekLabel);
    drawFooter(doc);

    y = H - 76;

    // Daily breakdown
    drawSectionHeader(doc, M, y, W - 2*M, "DAILY BREAKDOWN - FORM SUBMISSIONS");
    y -= 23;

    const numDays = dayLabels.length;
    const labelColW = 165;
    const dayColW = (W - 2*M - labelColW) / numDays;

    // Header row
    doc.setFill(...MID_GREEN);
    doc.rect(M, y, W - 2*M, 19);
    doc.setFill(255, 255, 255);
    doc.setFont(true, 8);
    doc.text(M + 7, y + 6, "Form");
    for (let d = 0; d < dayLabels.length; d++) {
      doc.text(M + labelColW + d * dayColW + 4, y + 6, dayLabels[d]);
    }
    y -= 22;

    const rh = 22;
    for (let i = 0; i < dailyBreakdown.length; i++) {
      const { label, days } = dailyBreakdown[i];
      const isAlt = i % 2 === 0;
      doc.setFill(...(isAlt ? ROW_ALT : [255,255,255]));
      doc.rect(M, y, W - 2*M, rh);

      doc.setFill(...DARK_TEXT);
      doc.setFont(false, 8.5);
      doc.text(M + 7, y + 7, label);

      for (let d = 0; d < days.length; d++) {
        const val = days[d];
        const cx = M + labelColW + d * dayColW;
        doc.setFill(...(val ? [212, 238, 216] : [250, 217, 213]));
        doc.rect(cx, y + 1, dayColW - 2, rh - 2);
        doc.setFill(...(val ? [26, 107, 42] : [178, 34, 34]));
        doc.setFont(true, 10);
        doc.textCentered(cx + (dayColW-2)/2, y + 6, val ? "Y" : "N", 6);
      }

      doc.setStroke(...DIVIDER);
      doc.setLineWidth(0.4);
      doc.line(M, y, M + W - 2*M, y);
      y -= rh;
    }

    y -= 14;

    // Flags
    drawSectionHeader(doc, M, y, W - 2*M, "FLAGS & NOTES");
    y -= 24;

    if (flags.length === 0) {
      doc.setFill(...ROW_ALT);
      doc.rect(M, y, W - 2*M, 22);
      doc.setFill(...DARK_TEXT);
      doc.setFont(false, 9);
      doc.text(M + 12, y + 7, "No flags this week.");
      y -= 22;
    } else {
      for (let i = 0; i < flags.length; i++) {
        const { form, note } = flags[i];
        doc.setFill(...(i % 2 === 0 ? ROW_ALT : [255,255,255]));
        doc.rect(M, y, W - 2*M, 22);
        doc.setFill(...FLAG_RED);
        doc.rect(M, y, 3, 22);
        doc.setFill(...DARK_TEXT);
        doc.setFont(true, 8);
        doc.text(M + 9, y + 13, form + ":");
        doc.setFont(false, 8);
        doc.setFill(68, 68, 68);
        doc.text(M + 9, y + 4, note);
        doc.setStroke(...DIVIDER);
        doc.setLineWidth(0.4);
        doc.line(M, y, M + W - 2*M, y);
        y -= 22;
      }
    }

    y -= 14;

    // Meeting notes
    drawSectionHeader(doc, M, y, W - 2*M, "ONE-ON-ONE NOTES  (Nicole / CM)");
    y -= 23;
    const boxH = y - 30;
    doc.setFill(250, 253, 248);
    doc.rect(M, 30, W - 2*M, boxH);
    doc.setStroke(...DIVIDER);
    doc.setLineWidth(0.8);
    doc.rect(M, 30, W - 2*M, boxH, false, true);

    let lineY = y - 16;
    doc.setStroke(221, 221, 221);
    doc.setLineWidth(0.5);
    while (lineY > 44) {
      doc.line(M + 11, lineY, W - M - 11, lineY);
      lineY -= 20;
    }

    const pdfStr = doc.build();
    const buf = Buffer.from(pdfStr, "latin1");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${foreman.replace(/ /g,"_")}_Scorecard.pdf"`);
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
