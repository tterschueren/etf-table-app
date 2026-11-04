// Zeichnet die ETF-Tabelle auf ein Canvas.
// Design: schwarz, SF Mono bold 9px ueberall gleich gross, positive Zahlen
// weiss, negative rot, alles rechtsbuendig, eine durchgehende Tabelle mit
// 1px-Trennstrichen zwischen den Sektionen, zwei Bloecke a 7 Spalten.

const C_BG = "#000000", C_TXT = "#ffffff", C_NEG = "#FF453A";
const C_LINE = "#2c2c2e"; // Trennstriche zwischen den Tabellen
const FONT = 'bold 10px "SF Mono", ui-monospace, Menlo, monospace';

export const PERIODS = ["1W", "2W", "3W", "4W", "2M", "3M", "1Y", "2Y", "3Y"];

const PAD_X = 0, LABEL_W = 20;
export const CURR_H = 96;  // Kopf (Leitzins + Name) + 6 Zeilen 1W/1M/4M/1Y/2Y/3Y
export const IND_H = 84;   // Kopf (VIX: XX) + 6 Zeilen 1W/1M/4M/1Y/2Y/3Y
export const TABLE_H = 132; // Kopf (Tageswert + Name) + 9 Zeilen, Baselines 9..129
export const SEP = 8;      // Abstand zwischen den Tabellen, in der Mitte ein 1px-Strich
export const H = CURR_H + SEP + IND_H + SEP + TABLE_H + SEP + TABLE_H + 3;

function color(s) {
  if (s == null) return C_TXT;
  return s.charAt(0) === "-" ? C_NEG : C_TXT;
}

// 1px-Trennstrich zwischen zwei Tabellen (letzte/erste Zeile)
function sep(ctx, W, y) {
  ctx.fillStyle = C_LINE;
  ctx.fillRect(0, y, W, 1);
}

function drawVal(ctx, v, cx, y) {
  if (v == null) return;
  ctx.fillStyle = color(v);
  ctx.fillText(v.replace(/^-/, ""), cx, y); // Minus nicht anzeigen, Farbe zeigt das Vorzeichen
}

function drawBlock(ctx, W, block, top) {
  const n = block.length;
  const colW = (W - 2 * PAD_X - LABEL_W) / n;

  ctx.textAlign = "right";
  ctx.font = FONT;
  for (let i = 0; i < n; i++) {
    const cx = PAD_X + LABEL_W + (i + 1) * colW;
    drawVal(ctx, block[i].v[0], cx, top + 9);
    ctx.fillStyle = C_TXT;
    ctx.fillText(block[i].name, cx, top + 21);
  }

  // Zeilen im gleichen 12er-Baseline-Raster wie die oberen Tabellen
  for (let r = 0; r < PERIODS.length; r++) {
    const y = top + 33 + r * 12;
    ctx.fillStyle = C_TXT;
    ctx.fillText(PERIODS[r], PAD_X + LABEL_W, y);
    for (let i = 0; i < n; i++) {
      drawVal(ctx, block[i].v[r + 1], PAD_X + LABEL_W + (i + 1) * colW, y);
    }
  }
}

// Wahrungstabelle: Kurszeile weiss, Veraenderungen rot bei schwaecherem Euro
// (rot = Fremdwaehrung gegenueber dem Euro gestiegen, Werte direkt ohne flip)

function drawCurrencies(ctx, W, curr, ecb) {
  const n = curr.length;
  const LW = 26; // breitere Bezeichnerspalte, damit "2.50%" passt
  const colW = (W - 2 * PAD_X - LW) / n;
  ctx.textAlign = "right";
  ctx.font = FONT; // ueberall dieselbe Schriftgroesse

  for (let i = 0; i < n; i++) {
    const cx = LW + (i + 1) * colW;
    ctx.fillStyle = C_TXT;
    ctx.fillText(curr[i].r, cx, 9);
    ctx.fillText(curr[i].n, cx, 21);
    drawVal(ctx, curr[i].w, cx, 33);
    drawVal(ctx, curr[i].m, cx, 45);
    drawVal(ctx, curr[i].m4, cx, 57);
    drawVal(ctx, curr[i].y, cx, 69);
    drawVal(ctx, curr[i].y2, cx, 81);
    drawVal(ctx, curr[i].y3, cx, 93);
  }
  ctx.fillStyle = C_TXT;
  ctx.fillText(ecb, LW, 9);
  ctx.fillText("1\u20ac", LW, 21);
  ctx.fillText("1W", LW, 33);
  ctx.fillText("1M", LW, 45);
  ctx.fillText("4M", LW, 57);
  ctx.fillText("1Y", LW, 69);
  ctx.fillText("2Y", LW, 81);
  ctx.fillText("3Y", LW, 93);
}

export function drawIndicators(ctx, W, ind, vix, vixc, top) {
  const n = ind.length;
  const LW = 26; // gleiches Raster wie die Wahrungstabelle darueber
  const colW = (W - 2 * PAD_X - LW) / 7;
  ctx.textAlign = "right";
  ctx.font = FONT;

  // Die beiden Kopffelder (Bezeichner- und VIX-Spalte) zusammengezogen:
  // "VIX: XX" sitzt mittig ueber beiden Feldern als ein Feld. VIX ist fest,
  // nicht sortiert, und drueckt keine Spalte breit.
  ctx.fillStyle = C_TXT;
  ctx.textAlign = "center";
  ctx.fillText("VIX: " + vix, (LW + colW) / 2, top + 9);
  ctx.textAlign = "right";
  // VIX-Spalte: unter der Bezeichnerspalte ("1€") der Tabelle darueber
  drawVal(ctx, vixc.w, LW, top + 21);
  drawVal(ctx, vixc.m, LW, top + 33);
  drawVal(ctx, vixc.m4, LW, top + 45);
  drawVal(ctx, vixc.y, LW, top + 57);
  drawVal(ctx, vixc.y2, LW, top + 69);
  drawVal(ctx, vixc.y3, LW, top + 81);
  // Zeitraum-Bezeichner: unter der AUD-Spalte
  const x2 = LW + colW;
  ctx.fillStyle = C_TXT;
  ctx.fillText("1W", x2, top + 21);
  ctx.fillText("1M", x2, top + 33);
  ctx.fillText("4M", x2, top + 45);
  ctx.fillText("1Y", x2, top + 57);
  ctx.fillText("2Y", x2, top + 69);
  ctx.fillText("3Y", x2, top + 81);
  // Indikatoren ab der dritten Spalte (CNY bis CHF), rutschen mit der Sortierung
  for (let i = 0; i < n; i++) {
    const cx = LW + (i + 2) * colW;
    ctx.fillStyle = C_TXT;
    ctx.fillText(ind[i].n, cx, top + 9);
    drawVal(ctx, ind[i].w, cx, top + 21);
    drawVal(ctx, ind[i].m, cx, top + 33);
    drawVal(ctx, ind[i].m4, cx, top + 45);
    drawVal(ctx, ind[i].y, cx, top + 57);
    drawVal(ctx, ind[i].y2, cx, top + 69);
    drawVal(ctx, ind[i].y3, cx, top + 81);
  }
}

export function render(ctx, W, blocks, curr, ind, ecb, vix, vixc) {
  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, W, H);
  // eine durchgehende Tabelle: Sektionen direkt aneinander,
  // dazwischen nur ein 1px-Trennstrich (letzte/erste Zeile)
  drawCurrencies(ctx, W, curr, ecb);
  sep(ctx, W, CURR_H + 3);
  drawIndicators(ctx, W, ind, vix, vixc, CURR_H + SEP);
  sep(ctx, W, CURR_H + SEP + IND_H + 3);
  drawBlock(ctx, W, blocks[0], CURR_H + SEP + IND_H + SEP);
  sep(ctx, W, CURR_H + SEP + IND_H + SEP + TABLE_H + 3);
  drawBlock(ctx, W, blocks[1], CURR_H + SEP + IND_H + SEP + TABLE_H + SEP);
}
