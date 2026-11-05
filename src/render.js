// Zeichnet die ETF-Tabelle auf ein Canvas.
// Design: schwarz, SF Mono bold 10px ueberall gleich gross, positive Zahlen
// weiss, negative rot, alles rechtsbuendig, eine durchgehende Tabelle mit
// 1px-Trennstrichen zwischen den Sektionen, zwei Bloecke a 7 Spalten.

const C_BG = "#000000", C_TXT = "#ffffff", C_NEG = "#FF453A";
const C_LINE = "#2c2c2e"; // Trennstriche zwischen den Tabellen
const FONT = 'bold 10px "SF Mono", ui-monospace, Menlo, monospace';

export const PERIODS = ["3T", "52", "L", "CC", "X", "RS", "RM", "Y1", "Y2", "Y3"];
// Gruppengrenzen fuer horizontale Trennstriche (Indizes in PERIODS):
// nach 52 (1, vor L/CC/X), nach X (4, vor RS/RM) und nach RM (6, vor den Jahren)
const GROUP_BREAKS = [1, 4, 6];
// Zeiträume der Indikatoren- und Wahrungstabelle (L = SMA-50T, CC = SMA-200T,
// X = Kreuz-Distanz SMA50 zu SMA200, roemische Zahlen als Label)
const IND_PERIODS = ["3T", "52", "L", "CC", "X", "Y1", "Y2", "Y3"];
const FX_PERIODS = ["L", "CC", "Y1", "Y2", "Y3"];

const PAD_X = 0, LABEL_W = 12; // Label-Spalte wieder 2 Zeichen breit (L, CC, Y1)
export const CURR_H = 84;  // Kopf (Waehrungsname + ECB-Vorkommastelle) + 6 Zeilen: .X (ECB-Nachkommastelle), L/CC/Y1/Y2/Y3
export const IND_H = 108;  // Kopf (VX + Spaltentitel) + 8 Zeilen 3T/52/L/CC/X/Y1/Y2/Y3
export const TABLE_H = 132; // Kopf (nur Name) + 10 Zeilen, Baselines 21..129
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
    ctx.fillStyle = C_TXT;
    ctx.fillText(block[i].name, cx, top + 9);
  }

  // Zeilen im gleichen 12er-Baseline-Raster wie die oberen Tabellen
  for (let r = 0; r < PERIODS.length; r++) {
    const y = top + 21 + r * 12;
    ctx.fillStyle = C_TXT;
    ctx.fillText(PERIODS[r], PAD_X + LABEL_W, y);
    for (let i = 0; i < n; i++) {
      drawVal(ctx, block[i].v[r], PAD_X + LABEL_W + (i + 1) * colW, y);
    }
  }

  // horizontale Trennstriche zwischen den Zeilen-Gruppen
  ctx.fillStyle = C_LINE;
  for (const b of GROUP_BREAKS) {
    const y = top + 21 + b * 12 + 4; // knapp unter der Baseline der Zeile b
    ctx.fillRect(PAD_X, y, W, 1);
  }
}

// Wahrungstabelle in Waehrungs-Perspektive: weiss = Waehrung gegenueber dem
// Euro gestaerkt, rot = gegenueber dem Euro geschwaecht (Vorzeichen liegt
// bereits in den Daten, kein Flip hier).
// Zeilen: L/CC = Distanz zu eigener SMA-Linie (L = 50 Tage, CC = 200 Tage,
// roemische Zahlen; positiv = Waehrung ueber ihrer Linie),
// Y1, Y2, Y3 = Veraenderung gegenueber dem Euro.

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
    const f = [curr[i].d50, curr[i].d200, curr[i].y, curr[i].y2, curr[i].y3];
    for (let r = 0; r < FX_PERIODS.length; r++) drawVal(ctx, f[r], cx, 33 + r * 12);
  }
  ctx.fillStyle = C_TXT;
  for (let r = 0; r < FX_PERIODS.length; r++) ctx.fillText(FX_PERIODS[r], LW, 33 + r * 12);

  // Trennstrich zwischen CC und Y1 (wie bei den ETF-Bloecken, volle Breite)
  ctx.fillStyle = C_LINE;
  ctx.fillRect(0, 49, W, 1);

  // Senkrechte Trennstriche zwischen allen Spalten (bei 10 schmalen
  // Waehrungsspalten fuer die optische Trennung), ueber die volle Blockhoehe
  for (let i = 0; i < n; i++) ctx.fillRect(LW + i * colW, 0, 1, CURR_H);
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
      const f = [ind[i].t3, ind[i].w52, ind[i].d50, ind[i].d200, ind[i].x, ind[i].y, ind[i].y2, ind[i].y3];
      drawVal(ctx, f[r], LW + (i + 1) * colW, y);
    }
  }

  // Trennstriche: nach 52 (Momentum-Block 3T/52) und nach X (vor dem Jahresblock)
  ctx.fillStyle = C_LINE;
  ctx.fillRect(0, top + 37, W, 1);
  ctx.fillRect(0, top + 73, W, 1);
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
