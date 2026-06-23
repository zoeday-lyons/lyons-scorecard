import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

const C = {
  forestGreen: rgb(45/255, 80/255, 22/255),
  midGreen:    rgb(58/255, 102/255, 32/255),
  badgeOn:     rgb(45/255, 125/255, 70/255),
  badgeNeeds:  rgb(212/255, 130/255, 10/255),
  badgeBelow:  rgb(192/255, 57/255, 43/255),
  divider:     rgb(200/255, 221/255, 184/255),
  darkText:    rgb(26/255, 46/255, 13/255),
  rowAlt:      rgb(242/255, 247/255, 238/255),
  subheadBg:   rgb(232/255, 242/255, 224/255),
  flagRed:     rgb(192/255, 57/255, 43/255),
  white:       rgb(1, 1, 1),
  grey:        rgb(0.53, 0.53, 0.53),
  lightGrey:   rgb(0.87, 0.87, 0.87),
  infoBg:      rgb(247/255, 250/255, 244/255),
  notesBg:     rgb(250/255, 253/255, 248/255),
};

function getBadge(pct) {
  if (pct >= 0.8)  return [C.badgeOn,    "ON TRACK"];
  if (pct >= 0.5)  return [C.badgeNeeds, "NEEDS IMPROVEMENT"];
  return                   [C.badgeBelow, "BELOW TARGET"];
}

// pdf-lib y=0 is bottom of page. Helper to flip from top-down coords.
function makeDrawer(page, font, fontBold, H) {
  const W = page.getWidth();

  function fillRect(x, y, w, h, color) {
    page.drawRectangle({ x, y: H - y - h, width: w, height: h, color, borderWidth: 0 });
  }
  function strokeRect(x, y, w, h, color, lw=0.8) {
    page.drawRectangle({ x, y: H - y - h, width: w, height: h, borderColor: color, borderWidth: lw, opacity: 1, borderOpacity: 1 });
  }
  function line(x1, y1, x2, y2, color, lw=0.5) {
    page.drawLine({ start: {x: x1, y: H - y1}, end: {x: x2, y: H - y2}, color, thickness: lw });
  }
  function text(x, y, str, size, f, color) {
    page.drawText(String(str), { x, y: H - y - size * 0.75, font: f, size, color });
  }
  function textCentered(cx, y, str, size, f, color) {
    const w = f.widthOfTextAtSize(String(str), size);
    text(cx - w/2, y, str, size, f, color);
  }
  function textRight(rx, y, str, size, f, color) {
    const w = f.widthOfTextAtSize(String(str), size);
    text(rx - w, y, str, size, f, color);
  }

  return { fillRect, strokeRect, line, text, textCentered, textRight, W };
}

function drawHeader(d, font, fontBold, weekLabel, pageNum) {
  const { fillRect, text, textCentered, textRight, W } = d;
  fillRect(0, 0, W, 61, C.forestGreen);
  text(39.6, 14, "LYONS", 22, fontBold, C.white);
  text(39.6, 40, "LANDSCAPING", 8, font, rgb(0.66, 0.79, 0.54));
  textCentered(W/2, 18, "FOREMAN PERFORMANCE SCORECARD", 14, fontBold, C.white);
  textCentered(W/2, 36, `Week of ${weekLabel}`, 8.5, font, C.white);
  textRight(W - 39.6, 36, `Page ${pageNum} of 2`, 8, font, C.white);
}

function drawFooter(d, font) {
  const { fillRect, textCentered, W } = d;
  fillRect(0, 774, W, 18, C.forestGreen);
  textCentered(W/2, 778, "Lyons Landscaping  |  Foreman Performance Scorecard  |  Confidential", 7, font, C.white);
}

function drawSectionHeader(d, font, fontBold, x, y, w, label) {
  const { fillRect, text } = d;
  fillRect(x, y, w, 20, C.subheadBg);
  fillRect(x, y, 3, 20, C.forestGreen);
  text(x + 9, y + 5, label, 9, fontBold, C.forestGreen);
}

function drawPctBar(d, x, y, pct, bw=79, bh=9) {
  const { fillRect } = d;
  fillRect(x, y, bw, bh, rgb(0.85, 0.91, 0.81));
  if (pct > 0) {
    const [col] = getBadge(pct);
    fillRect(x, y, bw * pct, bh, col);
  }
}

function drawBadge(d, font, x, y, pct) {
  const { fillRect, textCentered } = d;
  const [col, txt] = getBadge(pct);
  const bw = 110, bh = 16;
  fillRect(x, y, bw, bh, col);
  textCentered(x + bw/2, y + 4, txt, 7, font, C.white);
}

function drawComplianceRow(d, font, fontBold, x, y, label, submitted, total, isAlt) {
  const { fillRect, text, line, W } = d;
  const M = 39.6;
  const rw = W - 2*M;
  const rh = 27;

  fillRect(x, y, rw, rh, isAlt ? C.rowAlt : C.white);

  const pct = total > 0 ? submitted / total : 0;
  text(x + 8, y + 9, label, 9, font, C.darkText);

  const cx = x + rw * 0.50;
  text(cx, y + 9, `${submitted}/${total}`, 9, fontBold, C.darkText);
  text(cx + 28, y + 9, `${Math.round(pct*100)}%`, 8.5, font, C.grey);
  drawPctBar(d, cx + 54, y + 9, pct);
  drawBadge(d, font, x + rw - 114, y + 6, pct);

  line(x, y + rh, x + rw, y + rh, C.divider, 0.5);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const {
      foreman, scheduleLabel, weekLabel, workingDays,
      forms, dailyBreakdown, flags, dayLabels,
    } = req.body;

    const pdfDoc = await PDFDocument.create();
    const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const W = 612, H = 792;
    const M = 39.6;

    // ── PAGE 1 ──────────────────────────────────────────────────
    const p1 = pdfDoc.addPage([W, H]);
    const d1 = makeDrawer(p1, font, fontBold, H);
    drawHeader(d1, font, fontBold, weekLabel, 1);
    drawFooter(d1, font);

    let y = 70;

    // Foreman info block
    p1.drawRectangle({ x: M, y: H - y - 80, width: W - 2*M, height: 80, color:
C.infoBg, borderColor: C.divider, borderWidth: 0.8 });
    d1.text(M + 14, y + 16, foreman, 13, fontBold, C.darkText);
    d1.text(M + 14, y + 33, `Foreman  |  ${scheduleLabel}`, 9, font, C.grey);
    d1.text(M + 14, y + 52, "CURRENT JOB:", 8, font, C.lightGrey);
    d1.line(M + 80, y + 56, W - M - 230, y + 56, C.lightGrey, 0.6);

    const chipData = [
      ["SCHEDULE", dayLabels[0].split(" ")[0] + "-" + dayLabels[dayLabels.length-1].split(" ")[0]],
      ["WORKING DAYS", String(workingDays)],
      ["WEEK", weekLabel],
    ];
    let chipX = W - M - 260;
    for (const [label, val] of chipData) {
      d1.text(chipX, y + 22, label, 7.5, font, C.grey);
      d1.text(chipX, y + 36, val, 9, fontBold, C.darkText);
      chipX += 88;
    }

    y += 90;

    // Compliance section
    drawSectionHeader(d1, font, fontBold, M, y, W - 2*M, "FORM COMPLIANCE");
    y += 24;

    let totalSub = 0, totalPos = 0;
    for (let i = 0; i < forms.length; i++) {
      const { label, submitted, possible } = forms[i];
      drawComplianceRow(d1, font, fontBold, M, y, label, submitted, possible, i % 2 === 0);
      totalSub += submitted;
      totalPos += possible;
      y += 29;
    }

    y += 14;

    // Overall score
    const overallPct = totalPos > 0 ? totalSub / totalPos : 0;
    const scoreH = 72;
    d1.fillRect(M, y, W - 2*M, scoreH, C.forestGreen);
    d1.text(M + 14, y + 18, "OVERALL COMPLIANCE SCORE", 11, fontBold, C.white);
    d1.text(M + 14, y + 34, `${totalSub} of ${totalPos} submissions completed`, 9, font, C.white);
    d1.textRight(W - M - 14, y + 20, `${Math.round(overallPct*100)}%`, 26, fontBold, C.white);
    const [badgeCol, badgeTxt] = getBadge(overallPct);
    const bw = 110;
    d1.fillRect(W - M - 14 - bw, y + 46, bw, 16, badgeCol);
    d1.textCentered(W - M - 14 - bw/2, y + 50, badgeTxt, 7, font, C.white);

    // ── PAGE 2 ──────────────────────────────────────────────────
    const p2 = pdfDoc.addPage([W, H]);
    const d2 = makeDrawer(p2, font, fontBold, H);
    drawHeader(d2, font, fontBold, weekLabel, 2);
    drawFooter(d2, font);

    y = 70;

    // Daily breakdown
    drawSectionHeader(d2, font, fontBold, M, y, W - 2*M, "DAILY BREAKDOWN - FORM SUBMISSIONS");
    y += 23;

    const labelColW = 160;
    const dayColW = (W - 2*M - labelColW) / dayLabels.length;

    // Header row
    d2.fillRect(M, y, W - 2*M, 19, C.midGreen);
    d2.text(M + 7, y + 5, "Form", 8, fontBold, C.white);
    for (let i = 0; i < dayLabels.length; i++) {
      d2.text(M + labelColW + i * dayColW + 4, y + 5, dayLabels[i], 7.5, fontBold, C.white);
    }
    y += 22;

    const rh = 22;
    for (let i = 0; i < dailyBreakdown.length; i++) {
      const { label, days } = dailyBreakdown[i];
      d2.fillRect(M, y, W - 2*M, rh, i % 2 === 0 ? C.rowAlt : C.white);
      d2.text(M + 7, y + 7, label, 8, font, C.darkText);
      for (let di = 0; di < days.length; di++) {
        const val = days[di];
        const cx = M + labelColW + di * dayColW;
        d2.fillRect(cx, y + 1, dayColW - 2, rh - 2, val ? rgb(0.83,0.93,0.85) : rgb(0.98,0.85,0.84));
        d2.textCentered(cx + (dayColW-2)/2, y + 6, val ? "Y" : "N", 9, fontBold, val ? rgb(0.1,0.42,0.16) : rgb(0.7,0.13,0.13));
      }
      d2.line(M, y + rh, M + W - 2*M, y + rh, C.divider, 0.4);
      y += rh;
    }

    y += 14;

    // Flags
    drawSectionHeader(d2, font, fontBold, M, y, W - 2*M, "FLAGS & NOTES");
    y += 24;

    if (flags.length === 0) {
      d2.fillRect(M, y, W - 2*M, 22, C.rowAlt);
      d2.text(M + 12, y + 7, "No flags this week.", 9, font, C.darkText);
      y += 22;
    } else {
      for (let i = 0; i < flags.length; i++) {
        const { form, note } = flags[i];
        d2.fillRect(M, y, W - 2*M, 22, i % 2 === 0 ? C.rowAlt : C.white);
        d2.fillRect(M, y, 3, 22, C.flagRed);
        d2.text(M + 9, y + 5, `${form}:`, 8, fontBold, C.darkText);
        d2.text(M + 9, y + 14, note, 7.5, font, C.grey);
        d2.line(M, y + 22, M + W - 2*M, y + 22, C.divider, 0.4);
        y += 23;
      }
    }

    y += 14;

    // Meeting notes box
    drawSectionHeader(d2, font, fontBold, M, y, W - 2*M, "ONE-ON-ONE NOTES  (Nicole / CM)");
    y += 23;
    const boxH = 792 - 18 - y - 10;
    p2.drawRectangle({ x: M, y: H - y - boxH, width: W - 2*M, height: boxH, color: 
  C.notesBg, borderColor: C.divider, borderWidth: 0.8 });
    let lineY = y + 20;
    while (lineY < y + boxH - 10) {
      d2.line(M + 11, lineY, W - M - 11, lineY, C.lightGrey, 0.5);
      lineY += 20;
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${foreman.replace(/ /g,"_")}_Scorecard.pdf"`);
    res.status(200).send(Buffer.from(pdfBytes));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
