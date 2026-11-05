// Laedt 3-Jahres-Kurshistorien von Yahoo Finance (ueber r.jina.ai-Proxy,
// direkter Abruf als Fallback) und schreibt src/data.js neu.
// Aufruf: npm run update   (Internet noetig)
import { writeFileSync } from "node:fs";

const DAY = 86400;
const CUT = null; // null = letzter verfuegbarer Kurs; alternativ "YYYY-MM-DD"

// Anzeigename -> Yahoo-Symbol
const SYMBOLS = {
  EMV: "5MVL.DE", CNR: "CNI", SCV: "AVGS.L", JPN: "WTIZ.DE", XUS: "TDIV.AS",
  SGX: "S68.SI", EMD: "WTEI.DE", FCF: "QDEV.DE", USM: "QDVA.DE", EUS: "WTES.DE",
  USV: "WTVU.MI", IND: "EPIN.DE",
  CPK: "CP", V00: "^GSPC",
};
const NAMES = Object.keys(SYMBOLS);
// Abruf in kleinen Gruppen (zu viele Symbole pro URL schlagen fehl)
const GROUPS = [
  ["5MVL.DE", "CNI", "AVGS.L", "WTIZ.DE"],
  ["TDIV.AS", "S68.SI", "WTEI.DE", "QDEV.DE"],
  ["QDVA.DE", "WTES.DE", "WTVU.MI", "EPIN.DE"],
  ["CP", "^GSPC"],
];

async function fetchSpark(symbols, useProxy, range = "5y") {
  const host = useProxy ? "https://r.jina.ai/https://query1.finance.yahoo.com" : "https://query1.finance.yahoo.com";
  const url = host + "/v7/finance/spark?symbols=" + symbols.join(",") + "&range=" + range + "&interval=1d";
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  let text = await res.text();
  const i = text.indexOf("{");
  if (i > 0) text = text.slice(i);
  text = text.replace(/[\n\r]/g, "");
  const data = JSON.parse(text);
  const raw = data.spark && data.spark.result ? data.spark.result : [];
  const out = {};
  for (const item of raw) {
    const sym = item.symbol;
    const response = item.response && item.response[0];
    if (!response) continue;
    const ts = response.timestamp || [];
    const close = response.indicators.quote[0].close || [];
    const pts = [];
    for (let k = 0; k < ts.length; k++) {
      if (close[k] != null) pts.push([ts[k], close[k]]);
    }
    if (pts.length > 1) out[sym] = pts;
  }
  return out;
}

async function fetchAll() {
  const wanted = Object.values(SYMBOLS);
  const all = {};
  for (let useProxy = true; useProxy !== null; useProxy = useProxy ? false : null) {
    let ok = true;
    for (const g of GROUPS) {
      try {
        const part = await fetchSpark(g, useProxy);
        Object.assign(all, part);
      } catch (e) {
        ok = false;
      }
    }
    if (ok && wanted.every((s) => all[s])) return all;
  }
  const missing = wanted.filter((s) => !all[s]);
  if (missing.length) throw new Error("Keine Daten fuer: " + missing.join(", "));
  return all;
}

// letzter Kurs mit Zeitstempel <= Grenzzeit
function at(pts, limitTs) {
  let lo = null;
  for (const [ts, c] of pts) {
    if (ts <= limitTs && (lo == null || ts > lo[0])) lo = [ts, c];
  }
  return lo;
}

// Anzeige-String: ganze Zahl bei zweistelligem Wert,
// eine Nachkommastelle bei einstelligem (halbe weg von null)
function display(x) {
  if (x == null) return null;
  const r = Math.sign(x) * Math.round(Math.abs(x));
  if (Math.abs(r) < 10) {
    const d = Math.sign(x) * (Math.round(Math.abs(x) * 10) / 10);
    const s = Math.abs(d).toFixed(1);
    return (d < 0 ? "-" : "") + s;
  }
  return (x < 0 ? "-" : "") + Math.abs(r);
}

function windowPct(pts, lastTs, a, b) {
  const base = at(pts, lastTs - a * DAY);
  const end = at(pts, lastTs - b * DAY);
  if (!base || !end || !base[1] || !end[1]) return null;
  return (end[1] / base[1] - 1) * 100;
}

// Durchschnitt der letzten n Tages-Schlusskurse (fuer 50T/200T-Signale)
const smaOf = (pts, lastTs, n) => {
  const cs = pts.filter(([ts]) => ts <= lastTs).map((p) => p[1]);
  return cs.length >= n ? cs.slice(-n).reduce((a, b) => a + b, 0) / n : null;
};

// Prozentuale Distanz des letzten Kurses zum SMA(n), positiv = darueber
const smaDist = (pts, lastTs, n) => {
  const sma = smaOf(pts, lastTs, n);
  if (sma == null) return null;
  const cs = pts.filter(([ts]) => ts <= lastTs);
  return (cs[cs.length - 1][1] / sma - 1) * 100;
};

// Kreuz-Distanz X: SMA-50T gegen SMA-200T, positiv = 50T-Linie ueber der
// 200T-Linie (Golden-Cross-Regime), negativ = darunter (Death-Cross-Regime)
const smaX = (pts, lastTs) => {
  const s50 = smaOf(pts, lastTs, 50), s200 = smaOf(pts, lastTs, 200);
  return s50 != null && s200 != null ? (s50 / s200 - 1) * 100 : null;
};

// 52-Wochen-Hoch (Kalenderjahr-Fenster). Null bei Historie juenger als
// ~10 Monate, damit "52" nicht versehentlich ein seit-Listing-Hoch ist.
const hi52Of = (pts, lastTs) => {
  const win = pts.filter(([ts]) => ts <= lastTs && ts >= lastTs - 365 * DAY);
  if (win.length < 2 || win[0][0] > lastTs - 300 * DAY) return null;
  return Math.max(...win.map((p) => p[1]));
};

// RSI(n) nach Wilder auf einer Liste von Schlusskursen (Standard: 14 Tage)
const rsiOf = (cs, n = 14) => {
  if (cs.length < n + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = cs[i] - cs[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  let ag = g / n, al = l / n;
  for (let i = n + 1; i < cs.length; i++) {
    const d = cs[i] - cs[i - 1];
    ag = (ag * (n - 1) + (d > 0 ? d : 0)) / n;
    al = (al * (n - 1) + (d < 0 ? -d : 0)) / n;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
};

// 3T-Basispaar [jetzt, vor 3 Tageswerten]: deckt die letzten 3 Tagesbewegungen
// ab, inkl. des aktuellen Tags, falls er schon begonnen hat (letzter Kurs).
const last3 = (pts, lastTs) => {
  const cs = pts.filter(([ts]) => ts <= lastTs);
  if (cs.length < 4) return null;
  return [cs[cs.length - 1][1], cs[cs.length - 4][1]];
};

const rows = await fetchAll();

const result = [];
for (const name of NAMES) {
  const pts = rows[SYMBOLS[name]];
  let lastTs = pts[pts.length - 1][0];
  if (CUT) {
    const cutPts = pts.filter(([ts]) => ts <= Date.parse(CUT) / 1000);
    if (cutPts.length > 1) lastTs = cutPts[cutPts.length - 1][0];
  }
  const win = (a, b) => windowPct(pts, lastTs, a, b);
  // 1-Jahres-Fenster; bei kurzer Historie (juenger als 1 Jahr) seit Listung
  let y1 = win(365, 0);
  if (y1 == null) {
    const first = at(pts, lastTs - 400 * DAY);
    if (!first || pts[0][0] > lastTs - 365 * DAY) {
      y1 = (pts[pts.length - 1][1] / pts[0][1] - 1) * 100;
    }
  }
  const l3 = last3(pts, lastTs); // 3T: [jetzt, vor 3 Tageswerten]
  const closes = pts.filter(([ts]) => ts <= lastTs).map((p) => p[1]);
  const rsiNow = rsiOf(closes);
  const rsi5 = rsiNow != null && closes.length >= 20 ? rsiOf(closes.slice(0, closes.length - 5)) : null;
  const rsR = rsiNow != null ? Math.round(rsiNow) : null;
  const cols = {
    name,
    t3: display(l3 != null ? (l3[0] / l3[1] - 1) * 100 : null),
    w52: display(hi52Of(pts, lastTs) != null ? (at(pts, lastTs)[1] / hi52Of(pts, lastTs) - 1) * 100 : null),
    d50: display(smaDist(pts, lastTs, 50)),
    d200: display(smaDist(pts, lastTs, 200)),
    x: display(smaX(pts, lastTs)),
    // RSI-14 ganzzahlig, rot (Minus) unter 50
    rs: rsR == null ? null : (rsR < 50 ? "-" : "") + String(rsR),
    // RSI-Bewegung ueber 5 Tage in %
    rm: display(rsiNow != null && rsi5 != null ? (rsiNow / rsi5 - 1) * 100 : null),
    y1x: y1, y2: display(win(730, 365)), y3: display(win(1095, 730)),
    y1: display(y1),
  };
  result.push(cols);
}

// Spalten absteigend nach exaktem 1-Jahres-Ergebnis (fehlende ans Ende)
const cmpY1 = (a, b) => {
  if (a.y1x == null && b.y1x == null) return 0;
  if (a.y1x == null) return 1;
  if (b.y1x == null) return -1;
  return b.y1x - a.y1x;
};
result.sort(cmpY1);

const q = (s) => (s == null ? "null" : '"' + s + '"');
// Alle 14 Werte frei nach exaktem 1-Jahres-Ergebnis sortieren, dann erst
// die Tabelle in zwei Bloecke teilen. Steigen ALL oder DAX in die obere
// Tabelle auf, zeigt genau das, dass die eigenen Strategien sie nicht schlagen.
const blocks = [result.slice(0, 7), result.slice(7, 14)];
const lines = blocks.map((block) =>
  "  [\n" + block.map((c) =>
    '    { name: "' + c.name + '", v: [' + q(c.t3) + ", " + q(c.w52) + ", " + q(c.d50) + ", " + q(c.d200) + ", " + q(c.x) + ", " + q(c.rs) + ", " + q(c.rm) + ", " + q(c.y1) + ", " + q(c.y2) + ", " + q(c.y3) + "] }"
  ).join(",\n") + "\n  ]"
);

// --- Wahrungskurse: 1 EUR in Fremdwaehrung; Veraenderungen in
// Waehrungs-Perspektive (positiv = Waehrung gegen den Euro gestaerkt) ---
// Zeilen: L/CC = Distanz zur eigenen SMA-50/200T-Linie, Y1, Y2, Y3.
// Leitzinsen: automatisch von FRED (fredgraph.csv, kein API-Key noetig).
// ECB = Einlagensatz (ECBDFR), USD = Effective Fed Funds (FEDFUNDS),
// GBP/JPY/AUD/BR = OECD-Referenzzins (IRSTCI01-Reihen, monatlich, folgen dem
// Leitzins eng). CHF/CNY: FRED-Reihen veraltet, daher "-".
// Bei Fehlern bleibt der zuletzt bekannte Wert aus RATES_FALLBACK stehen.
const RATES_FALLBACK = { ECB: "2.5", USD: "3.9", JPY: "1.0", GBP: "3.7", CNY: "-",
  CHF: "-", AUD: "4.4", BR: "13.9", CAD: "-", SGD: "-", INR: "-" };
const RATE_SERIES = { ECB: "ECBDFR", USD: "FEDFUNDS", GBP: "IRSTCI01GBM156N",
  JPY: "IRSTCI01JPM156N", AUD: "IRSTCI01AUM156N", BR: "IRSTCI01BRM156N",
  CAD: "IRSTCI01CAM156N" };
async function fetchFredRate(sym) {
  for (const host of ["https://fred.stlouisfed.org/graph/fredgraph.csv?id=",
                      "https://r.jina.ai/https://fred.stlouisfed.org/graph/fredgraph.csv?id="]) {
    try {
      const res = await fetch(host + sym + "&cosd=2025-01-01");
      if (!res.ok) continue;
      const rows = (await res.text()).split("\n").map((l) => l.split(","))
        .filter((p) => p.length >= 2 && p[1] !== "" && p[1] !== "." && !isNaN(parseFloat(p[1])));
      if (rows.length) return String(Math.round(parseFloat(rows[rows.length - 1][1]) * 10) / 10);
    } catch (e) {}
  }
  return null;
}
const RATES = Object.assign({}, RATES_FALLBACK);
for (const rn of Object.keys(RATE_SERIES)) {
  const v = await fetchFredRate(RATE_SERIES[rn]);
  if (v) RATES[rn] = v;
}

const FX = [["USD", "EURUSD=X"], ["JPY", "EURJPY=X"], ["GBP", "EURGBP=X"], ["CNY", "EURCNY=X"],
  ["CHF", "EURCHF=X"], ["AUD", "EURAUD=X"], ["BR", "EURBRL=X"], ["CAD", "EURCAD=X"],
  ["SGD", "EURSGD=X"], ["INR", "EURINR=X"]];
const fxRaw = {};
for (let g = 0; g < FX.length; g += 3) {
  let part = null;
  for (let useProxy = true; useProxy !== null; useProxy = useProxy ? false : null) {
    try { part = await fetchSpark(FX.slice(g, g + 3).map((f) => f[1]), useProxy, "5y"); break; } catch (e) { part = null; }
  }
  Object.assign(fxRaw, part || {});
}
// Anzeige-Regel wie ueberall: Werte ab 10 ganzzahlig ohne Nachkommastellen
// (z.B. Selic 13.9 -> "14"); kleine Werte bleiben wie geliefert.
const fmtRate = (s) => {
  const v = parseFloat(s);
  if (isNaN(v)) return s;
  return Math.abs(v) >= 10 ? String(Math.round(v)) : s;
};

const fxRows = [];
for (const [n, sym] of FX) {
  const pts = fxRaw[sym];
  if (!pts) continue;
  let lastTs = pts[pts.length - 1][0];
  if (CUT) {
    const cutPts = pts.filter(([ts]) => ts <= Date.parse(CUT) / 1000);
    if (cutPts.length > 1) lastTs = cutPts[cutPts.length - 1][0];
  }
  const now = at(pts, lastTs);
  const y365 = at(pts, lastTs - 365 * DAY);
  const y730 = at(pts, lastTs - 730 * DAY);
  const y1095 = at(pts, lastTs - 1095 * DAY);

  // Waehrungs-Perspektive: Vorzeichen der EURxxx-Veraenderungen flippen,
  // positiv = Waehrung gegenueber dem Euro gestaerkt (weiss), negativ =
  // geschwaecht (rot). 50T/200T = Distanz des Kurses zu seinem eigenen
  // SMA, ebenfalls geflippt: positiv = Waehrung ueber ihrer Linie.
  const s50 = smaOf(pts, lastTs, 50), s200 = smaOf(pts, lastTs, 200);

  fxRows.push({
    n,
    r: fmtRate(RATES[n] || "-"),
    d50: display(now && s50 ? -(now[1] / s50 - 1) * 100 : null),
    d200: display(now && s200 ? -(now[1] / s200 - 1) * 100 : null),
    y: display(y365 && now ? -(now[1] / y365[1] - 1) * 100 : null),
    y2: display(y365 && y730 ? -(y365[1] / y730[1] - 1) * 100 : null),
    y3: display(y730 && y1095 ? -(y730[1] / y1095[1] - 1) * 100 : null),
  });
}
// Spalten absteigend nach 1-Jahres-Gewinn der Waehrung gegen den Euro
fxRows.sort((a, b) => (parseFloat(b.y) || 0) - (parseFloat(a.y) || 0));
const currLines = fxRows.map((c) =>
  '  { n: "' + c.n + '", r: ' + q(c.r) + ', d50: ' + q(c.d50) + ', d200: ' + q(c.d200) + ', y: ' + q(c.y) + ', y2: ' + q(c.y2) + ', y3: ' + q(c.y3) + " }"
).join(",\n");

// --- Indikatoren: VIX, 10Y, SOX, CU, GLD, OIL, GAS, ALL, DAX ---
// Zeilen (feste Reihenfolge, nicht sortiert): 1W (Tage 0-7), +3W (Scheibe
// Tage 8-29), +3M (Scheibe Tage 30-121), 1Y/2Y/3Y rolling.
// VIX wie alle anderen Reihen: weiss = Wert gestiegen, rot = gefallen. 10Y in Basispunkten.
// Rot = Wert gefallen, weiss = gestiegen (einheitliche Regel).
const INDS = [["GLD", "GC=F"], ["OIL", "BZ=F"], ["GAS", "NG=F"], ["CU", "HG=F"], ["SOX", "^SOX"], ["10Y", "^TNX"], ["VIX", "^VIX"], ["ALL", "VWCE.DE"], ["DAX", "^GDAXI"]];
const IND_ORDER = ["VIX", "10Y", "SOX", "CU", "GLD", "OIL", "GAS", "ALL", "DAX"];
const indRows = [];
let vixLevel = "21";   // Fallback, wird beim Abruf ueberschrieben
for (const [n, sym] of INDS) {
  let pts = null;
  for (let useProxy = true; useProxy !== null; useProxy = useProxy ? false : null) {
    try { const part = await fetchSpark([sym], useProxy, "5y"); pts = part[sym]; if (pts) break; } catch (e) { pts = null; }
  }
  if (!pts) continue;
  let lastTs = pts[pts.length - 1][0];
  if (CUT) {
    const cutPts = pts.filter(([ts]) => ts <= Date.parse(CUT) / 1000);
    if (cutPts.length > 1) lastTs = cutPts[cutPts.length - 1][0];
  }
  const now = at(pts, lastTs);
  const l3 = last3(pts, lastTs); // 3T: [jetzt, vor 3 Tageswerten]
  const y1a = at(pts, lastTs - 365 * DAY), y2a = at(pts, lastTs - 730 * DAY), y3a = at(pts, lastTs - 1095 * DAY);

  if (n === "VIX") {
    // VIX-Zeile: Label = aktueller Stand, wie alle Reihen: weiss = gestiegen, rot = gefallen
    vixLevel = String(Math.round(now[1]));
    const vp = (t) => (t && now ? (now[1] / t[1] - 1) * 100 : null);
    indRows.push({
      n, lvl: vixLevel,
      t3: display(l3 != null ? (l3[0] / l3[1] - 1) * 100 : null),
      w52: display(hi52Of(pts, lastTs) != null ? (now[1] / hi52Of(pts, lastTs) - 1) * 100 : null),
      y: display(vp(y1a)),
      y2: display(y1a && y2a ? (y1a[1] / y2a[1] - 1) * 100 : null),
      y3: display(y2a && y3a ? (y2a[1] / y3a[1] - 1) * 100 : null),
      d50: display(smaDist(pts, lastTs, 50)),
      d200: display(smaDist(pts, lastTs, 200)),
      x: display(smaX(pts, lastTs)),
    });
    continue;
  }
  const s = (x) => (x == null ? "null" : String(Math.round(x * 10) / 10));
  if (n === "10Y") {
    // Basispunkte, einheitliche Regel: ROT = Wert gefallen, WEISS = gestiegen
    const bp = (t) => (t && now ? Math.round((now[1] - t[1]) * 100) : null);
    indRows.push({
      n, lvl: now[1].toFixed(2),
      t3: s(l3 != null ? (l3[0] - l3[1]) * 100 : null),
      w52: s(hi52Of(pts, lastTs) != null ? Math.round((now[1] - hi52Of(pts, lastTs)) * 100) : null),
      y: s(bp(y1a)),
      y2: s(y1a && y2a ? Math.round((y1a[1] - y2a[1]) * 100) : null),
      y3: s(y2a && y3a ? Math.round((y2a[1] - y3a[1]) * 100) : null),
      d50: s(smaOf(pts, lastTs, 50) != null ? Math.round((now[1] - smaOf(pts, lastTs, 50)) * 100) : null),
      d200: s(smaOf(pts, lastTs, 200) != null ? Math.round((now[1] - smaOf(pts, lastTs, 200)) * 100) : null),
      // X in bp: Distanz SMA-50T zu SMA-200T (absolut, wie L/CC)
      x: s(smaOf(pts, lastTs, 50) != null && smaOf(pts, lastTs, 200) != null ? Math.round((smaOf(pts, lastTs, 50) - smaOf(pts, lastTs, 200)) * 1000) / 10 : null),
    });
  } else {
    const pct = (t) => (t && now ? (now[1] / t[1] - 1) * 100 : null);
    indRows.push({
      n,
      lvl: (n === "GLD" || n === "SOX" || n === "DAX") ? String(Math.round(now[1])) : now[1].toFixed(1),
      t3: display(l3 != null ? (l3[0] / l3[1] - 1) * 100 : null),
      w52: display(hi52Of(pts, lastTs) != null ? (now[1] / hi52Of(pts, lastTs) - 1) * 100 : null),
      y: display(pct(y1a)),
      y2: display(y1a && y2a ? (y1a[1] / y2a[1] - 1) * 100 : null),
      y3: display(y2a && y3a ? (y2a[1] / y3a[1] - 1) * 100 : null),
      d50: display(smaDist(pts, lastTs, 50)),
      d200: display(smaDist(pts, lastTs, 200)),
      x: display(smaX(pts, lastTs)),
    });
  }
}
// feste Reihenfolge: VIX, 10Y, SOX, CU, GLD, OIL, GAS, ALL, DAX
indRows.sort((a, b) => IND_ORDER.indexOf(a.n) - IND_ORDER.indexOf(b.n));
const indLines = indRows.map((c) =>
  '  { n: "' + c.n + '", lvl: "' + c.lvl + '", t3: ' + q(c.t3) + ', w52: ' + q(c.w52) + ', y: ' + q(c.y) + ', y2: ' + q(c.y2) + ', y3: ' + q(c.y3) + ', d50: ' + q(c.d50) + ', d200: ' + q(c.d200) + ', x: ' + q(c.x) + " }"
).join(",\n");

const updated = new Date().toISOString().slice(0, 10);
const out = "// Automatisch generiert von scripts/update-data.mjs (nicht von Hand editieren).\n"
  + "// v = [3T (3 Tage inkl. heute), 52 (52W-Hoch-Distanz), L (SMA-50T), CC (SMA-200T), X (Kreuz-Distanz SMA50/SMA200), RS (RSI-14, rot unter 50), RM (RSI-Aenderung 5T in %), 1Y, 2Y, 3Y] Anzeige-Strings,\n"
  + "// null = Zeitraum fehlt (kurze Historie). Stand: " + updated + "\n"
  + 'export const UPDATED = "' + updated + '";\nexport const ECB_RATE = "' + RATES.ECB + '";\nexport const VIX_LEVEL = "' + vixLevel + '";\nexport const CURRENCIES = [\n' + currLines + '\n];\nexport const INDICATORS = [\n' + indLines + '\n];\nexport const BLOCKS = [\n'
  + lines.join(",\n") + "\n];\n";

writeFileSync(new URL("../src/data.js", import.meta.url), out);
console.log("src/data.js neu geschrieben (Stand " + updated + ", " + result.length + " Positionen)");
