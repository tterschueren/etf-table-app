// Zeichnet die ETF-Tabelle auf ein Canvas.
// Design: schwarz, SF Mono bold 10px ueberall gleich gross, positive Zahlen
// weiss, negative rot, alles rechtsbuendig, eine durchgehende Tabelle mit
// 1px-Trennstrichen zwischen den Sektionen, zwei Bloecke a 7 Spalten.

const C_BG = "#000000", C_TXT = "#ffffff", C_NEG = "#FF453A";
const C_LINE = "#2c2c2e"; // Trennstriche zwischen den Tabellen
const FONT = 'bold 10px "SF Mono", ui-monospace, Menlo, monospace';

export const PERIODS = ["W1", "W2", "W3", "W4", "M2", "M3", "M4", "Y1", "Y2", "Y3"];
// Gruppengrenzen fuer horizontale Trennstriche (Indizes in PERIODS):
// nach W4 (Index 3) und nach M4 (Index 6)
const GROUP_BREAKS = [3, 6];
// Zeiträume der Indikatoren- und Wahrungstabelle
const IND_PERIODS = ["W1", "3W", "3M", "Y1", "Y2", "Y3"];
const FX_PERIODS = ["4W", "3M", "Y1", "Y2", "Y3"];

const PAD_X = 0, LABEL_W = 20;
export const CURR_H = 84;  // Kopf (Waehrungsname + ECB-Vorkommastelle) + 6 Zeilen: .X (ECB-Nachkommastelle), 4W/3M/Y1/Y2/Y3
export const IND_H = 84;   // Kopf (VX + Spaltentitel) + 6 Zeilen W1/3W/3M/Y1/Y2/Y3
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
  const txt = v.replace(/^-/, ""); // Minus nicht anzeigen, Farbe zeigt das Vorzeichen
  if (txt === "") return; // "-" (z.B. kein Leitzins verfuegbar) = Zelle bleibt leer
  ctx.fillStyle = color(v);
  ctx.fillText(txt, cx, y);
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

  // horizontale Trennstriche zwischen den Zeitraum-Gruppen (W4|M2 und M4|Y1)
  ctx.fillStyle = C_LINE;
  for (const b of GROUP_BREAKS) {
    const y = top + 33 + b * 12 + 4; // knapp unter der Baseline der Zeile b
    ctx.fillRect(PAD_X, y, W, 1);
  }
}

// Wahrungstabelle: Kurszeile weiss, Veraenderungen rot bei schwaecherem Euro
// (rot = Fremdwaehrung gegenueber dem Euro gestiegen, Werte direkt ohne flip)
// Zeilen: 4W (rolling 30 Tage), 3M (Scheibe Tage 30-121), Y1, Y2, Y3.
// Leitzinsen sind entfallen.

function drawCurrencies(ctx, W, curr, ecb) {
  const n = curr.length;
  const LW = LABEL_W; // gleiches Raster wie die ETF-Bloecke
  const colW = (W - 2 * PAD_X - LW) / n;
  ctx.textAlign = "right";
  ctx.font = FONT;

  // Zeile 1 = Leitzinsen, Zeile 2 = Waehrungsbezeichnungen.
  // Eckspalte = ECB-Leitzins, aufgeteilt in zwei Felder, damit sie nur
  // 2 Zeichen breit bleibt: Zeile 1 = Vorkommastellen, Zeile 2 = ".X"
  // (X = 1. Nachkommastelle). "1e" ist entfallen.
  const ecbVal = parseFloat(ecb);
  ctx.fillStyle = C_TXT;
  if (!isNaN(ecbVal)) {
    ctx.fillText(String(Math.trunc(ecbVal)), LW, 9);
    ctx.fillText("." + Math.round((ecbVal - Math.trunc(ecbVal)) * 10), LW, 21);
  }

  for (let i = 0; i < n; i++) {
    const cx = LW + (i + 1) * colW;
    ctx.fillStyle = C_TXT;
    drawVal(ctx, curr[i].r, cx, 9); // Leitzins-Zeile (ueber den Namen)
    ctx.fillText(curr[i].n, cx, 21);
    const f = [curr[i].m, curr[i].s3m, curr[i].y, curr[i].y2, curr[i].y3];
    for (let r = 0; r < FX_PERIODS.length; r++) drawVal(ctx, f[r], cx, 33 + r * 12);
  }
  ctx.fillStyle = C_TXT;
  for (let r = 0; r < FX_PERIODS.length; r++) ctx.fillText(FX_PERIODS[r], LW, 33 + r * 12);

  // Trennstrich zwischen 3M und Y1 (wie bei den ETF-Bloecken, volle Breite)
  ctx.fillStyle = C_LINE;
  ctx.fillRect(0, 49, W, 1);
}

// Indikatoren-Tabelle: Werte von links nach rechts, Zeiträume von oben nach
// unten (gleiches Zeilenraster wie die Wahrungstabelle).
// Erste Spalte = Zeiträume, Kopffeld darueber = "VX".
// Zweite Spalte = VIX, im Kopffeld steht der aktuelle VIX-Stand statt eines
// Titels. Danach 10Y, SOX, CU, GLD, OIL, GAS als Spalten mit Namen im Kopf.
// Feste Reihenfolge, nicht sortiert.

export function drawIndicators(ctx, W, ind, top) {
  const LW = LABEL_W; // gleiches Raster wie die ETF-Bloecke
  const cols = ind.length;
  const colW = (W - 2 * PAD_X - LW) / cols;
  ctx.textAlign = "right";
  ctx.font = FONT;

  // Kopfzeile: "VX" ueber der Zeitraeume-Spalte, VIX-Stand ueber der
  // VIX-Spalte, danach die Indikatornamen
  ctx.fillStyle = C_TXT;
  ctx.fillText("VX", LW, top + 9);
  for (let i = 0; i < cols; i++) {
    const cx = LW + (i + 1) * colW;
    ctx.fillText(ind[i].n === "VIX" ? (ind[i].lvl || ind[i].n) : ind[i].n, cx, top + 9);
  }

  // Zeilen: Zeiträume links, darunter die Werte je Indikator-Spalte
  for (let r = 0; r < IND_PERIODS.length; r++) {
    const y = top + 21 + r * 12;
    ctx.fillStyle = C_TXT;
    ctx.fillText(IND_PERIODS[r], LW, y);
    for (let i = 0; i < cols; i++) {
      const f = [ind[i].w, ind[i].s3w, ind[i].s3m, ind[i].y, ind[i].y2, ind[i].y3];
      drawVal(ctx, f[r], LW + (i + 1) * colW, y);
    }
  }

  // Trennstrich zwischen 3M und Y1 (wie bei den ETF-Bloecken, volle Breite)
  ctx.fillStyle = C_LINE;
  ctx.fillRect(0, top + 49, W, 1);
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
