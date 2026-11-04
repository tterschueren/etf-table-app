// Zeichnet die ETF-Tabelle auf ein Canvas.
// Design: schwarz, SF Mono bold 10px ueberall gleich gross, positive Zahlen
// weiss, negative rot, alles rechtsbuendig, eine durchgehende Tabelle mit
// 1px-Trennstrichen zwischen den Sektionen, zwei Bloecke a 7 Spalten.

const C_BG = "#000000", C_TXT = "#ffffff", C_NEG = "#FF453A";
const C_LINE = "#2c2c2e"; // Trennstriche zwischen den Tabellen
const FONT = 'bold 10px "SF Mono", ui-monospace, Menlo, monospace';

export const PERIODS = ["1W", "2W", "3W", "4W", "2M", "3M", "4M", "1Y", "2Y", "3Y"];
// Gruppengrenzen fuer vertikale Trennstriche (Indizes in PERIODS):
// nach 4W (Index 3) und nach 4M (Index 6)
const GROUP_BREAKS = [3, 6];

const PAD_X = 0, LABEL_W = 20;
export const CURR_H = 84;  // Kopf (Leitzins + Name) + 5 Zeilen 1M/+3M/1Y/2Y/3Y
export const IND_H = 96;   // Kopf (VIX + Perioden) + 7 Zeilen VIX/10Y/SOX/CU/GLD/OIL/GAS
export const TABLE_H = 144; // Kopf (Tageswert + Name) + 10 Zeilen, Baselines 9..141
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

  // vertikale Trennstriche zwischen den Zeitraum-Gruppen (4W|2M und 4M|1Y)
  ctx.fillStyle = C_LINE;
  for (const b of GROUP_BREAKS) {
    const x = PAD_X + LABEL_W + (b + 1.5) * colW;
    ctx.fillRect(x, top + 23, 1, TABLE_H - 24);
  }
}

// Wahrungstabelle: Kurszeile weiss, Veraenderungen rot bei schwaecherem Euro
// (rot = Fremdwaehrung gegenueber dem Euro gestiegen, Werte direkt ohne flip)
// Zeilen: 1M, +3M (Scheibe Tage 30-121), 1Y, 2Y, 3Y

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
    drawVal(ctx, curr[i].m, cx, 33);
    drawVal(ctx, curr[i].s3m, cx, 45);
    drawVal(ctx, curr[i].y, cx, 57);
    drawVal(ctx, curr[i].y2, cx, 69);
    drawVal(ctx, curr[i].y3, cx, 81);
  }
  ctx.fillStyle = C_TXT;
  ctx.fillText(ecb, LW, 9);
  ctx.fillText("1\u20ac", LW, 21);
  ctx.fillText("1M", LW, 33);
  ctx.fillText("+3M", LW, 45);
  ctx.fillText("1Y", LW, 57);
  ctx.fillText("2Y", LW, 69);
  ctx.fillText("3Y", LW, 81);
}

// Indikatoren-Tabelle: Bezeichner in der ersten Spalte (feste Reihenfolge
// VIX, 10Y, SOX, CU, GLD, OIL, GAS), Spalten 1W/+3W/+3M/1Y/2Y/3Y.
// Das Kopffeld ueber der Label-Spalte zeigt "VIX", die VIX-Zeile zeigt
// in der Label-Spalte den aktuellen VIX-Stand statt des Namens.

export function drawIndicators(ctx, W, ind, top) {
  const LW = 26; // gleiches Raster wie die Wahrungstabelle darueber
  const cols = ["1W", "+3W", "+3M", "1Y", "2Y", "3Y"];
  const colW = (W - 2 * PAD_X - LW) / cols.length;
  ctx.textAlign = "right";
  ctx.font = FONT;

  // Kopffeld: "VIX" ueber der Label-Spalte, Perioden darueber rechtsbuendig
  ctx.fillStyle = C_TXT;
  ctx.fillText("VIX", LW, top + 9);
  for (let c = 0; c < cols.length; c++) {
    ctx.fillText(cols[c], LW + (c + 1) * colW, top + 9);
  }

  // Zeilen: VIX zeigt ihren aktuellen Stand als Label, alle aenderen den Namen
  for (let r = 0; r < ind.length; r++) {
    const y = top + 21 + r * 12;
    ctx.fillStyle = C_TXT;
    ctx.fillText(ind[r].n === "VIX" ? (ind[r].lvl || ind[r].n) : ind[r].n, LW, y);
    const f = [ind[r].w, ind[r].s3w, ind[r].s3m, ind[r].y, ind[r].y2, ind[r].y3];
    for (let c = 0; c < f.length; c++) {
      drawVal(ctx, f[c], LW + (c + 1) * colW, y);
    }
  }
}

export function render(ctx, W, blocks, curr, ind, ecb) {
  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, W, H);
  // eine durchgehende Tabelle: Sektionen direkt aneinander,
  // dazwischen nur ein 1px-Trennstrich (letzte/erste Zeile)
  drawCurrencies(ctx, W, curr, ecb);
  sep(ctx, W, CURR_H + 3);
  drawIndicators(ctx, W, ind, CURR_H + SEP);
  sep(ctx, W, CURR_H + SEP + IND_H + 3);
  drawBlock(ctx, W, blocks[0], CURR_H + SEP + IND_H + SEP);
  sep(ctx, W, CURR_H + SEP + IND_H + SEP + TABLE_H + 3);
  drawBlock(ctx, W, blocks[1], CURR_H + SEP + IND_H + SEP + TABLE_H + SEP);
}
