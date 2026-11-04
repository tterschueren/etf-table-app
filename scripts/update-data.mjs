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
  USV: "WTVU.MI", IND: "EPIN.DE", DAX: "^GDAXI", ALL: "VWCE.DE",
};
const NAMES = Object.keys(SYMBOLS);
// Abruf in kleinen Gruppen (zu viele Symbole pro URL schlagen fehl)
const GROUPS = [
  ["5MVL.DE", "CNI", "AVGS.L", "WTIZ.DE"],
  ["TDIV.AS", "S68.SI", "WTEI.DE", "QDEV.DE"],
  ["QDVA.DE", "WTES.DE", "WTVU.MI", "EPIN.DE"],
  ["^GDAXI", "VWCE.DE"],
];

async function fetchSpark(symbols, useProxy, range = "3y") {
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
  const cols = {
    name,
    day: display(win(2, 0)),
    w1: display(win(8, 2)), w2: display(win(15, 9)), w3: display(win(22, 16)), w4: display(win(28, 21)),
    m2: display(win(60, 30)), m3: display(win(90, 60)),
    m4s: display(win(122, 91)), // Scheibe Tage 91-122 (Monat nach 3M)
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
    '    { name: "' + c.name + '", v: [' + q(c.day) + ", " + q(c.w1) + ", " + q(c.w2) + ", " + q(c.w3) + ", " + q(c.w4) + ", " + q(c.m2) + ", " + q(c.m3) + ", " + q(c.m4s) + ", " + q(c.y1) + ", " + q(c.y2) + ", " + q(c.y3) + "] }"
  ).join(",\n") + "\n  ]"
);

// --- Wahrungskurse: 1 EUR in Fremdwaehrung plus Veraenderungen ---
// Zeilen: 1M (rolling 30 Tage), +3M (Scheibe Tage 30-121), 1Y, 2Y, 3Y.
// Leitzinsen: automatisch von FRED (fredgraph.csv, kein API-Key noetig).
// ECB = Einlagensatz (ECBDFR), USD = Effective Fed Funds (FEDFUNDS),
// GBP/JPY/AUD = OECD-Referenzzins (IRSTCI01-Reihen, monatlich, folgen dem
// Leitzins eng). CHF/CNY/BR: keine FRED-Reihe, daher "-" bzw. Fallback.
// Bei Fehlern bleibt der zuletzt bekannte Wert aus RATES_FALLBACK stehen.
const RATES_FALLBACK = { ECB: "2.5", USD: "3.9", JPY: "0.8", GBP: "3.8", CNY: "-",
  CHF: "0", AUD: "4.9", BR: "-" };
const RATE_SERIES = { ECB: "ECBDFR", USD: "FEDFUNDS", GBP: "IRSTCI01GBM156N",
  JPY: "IRSTCI01JPM156N", AUD: "IRSTCI01AUM156N" };
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
  ["CHF", "EURCHF=X"], ["AUD", "EURAUD=X"], ["BR", "EURBRL=X"]];
const fxRaw = {};
for (let g = 0; g < FX.length; g += 3) {
  let part = null;
  for (let useProxy = true; useProxy !== null; useProxy = useProxy ? false : null) {
    try { part = await fetchSpark(FX.slice(g, g + 3).map((f) => f[1]), useProxy, "5y"); break; } catch (e) { part = null; }
  }
  Object.assign(fxRaw, part || {});
}
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
  const m30 = at(pts, lastTs - 30 * DAY);
  const p30 = at(pts, lastTs - 30 * DAY), p121 = at(pts, lastTs - 121 * DAY);
  const y365 = at(pts, lastTs - 365 * DAY);
  const y730 = at(pts, lastTs - 730 * DAY);
  const y1095 = at(pts, lastTs - 1095 * DAY);

  fxRows.push({
    n,
    r: RATES[n] || "-",
    m: display(m30 && now ? (now[1] / m30[1] - 1) * 100 : null),
    s3m: display(p30 && p121 ? (p30[1] / p121[1] - 1) * 100 : null),
    y: display(y365 && now ? (now[1] / y365[1] - 1) * 100 : null),
    y2: display(y365 && y730 ? (y365[1] / y730[1] - 1) * 100 : null),
    y3: display(y730 && y1095 ? (y730[1] / y1095[1] - 1) * 100 : null),
  });
}
// Spalten aufsteigend nach 1-Jahres-Verlust des Euro sortieren
fxRows.sort((a, b) => (parseFloat(a.y) || 0) - (parseFloat(b.y) || 0));
const currLines = fxRows.map((c) =>
  '  { n: "' + c.n + '", r: "' + c.r + '", m: ' + q(c.m) + ', s3m: ' + q(c.s3m) + ', y: ' + q(c.y) + ', y2: ' + q(c.y2) + ', y3: ' + q(c.y3) + " }"
).join(",\n");

// --- Indikatoren: VIX, 10Y, SOX, CU, GLD, OIL, GAS ---
// Zeilen (feste Reihenfolge, nicht sortiert): 1W (Tage 0-7), +3W (Scheibe
// Tage 8-29), +3M (Scheibe Tage 30-121), 1Y/2Y/3Y rolling.
// Nur VIX invertiert: rot = Volatilitaet gestiegen. 10Y in Basispunkten.
// Rot = Wert gefallen, weiss = gestiegen (einheitliche Regel).
const INDS = [["GLD", "GC=F"], ["OIL", "BZ=F"], ["GAS", "NG=F"], ["CU", "HG=F"], ["SOX", "^SOX"], ["10Y", "^TNX"], ["VIX", "^VIX"]];
const IND_ORDER = ["VIX", "10Y", "SOX", "CU", "GLD", "OIL", "GAS"];
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
  const w7 = at(pts, lastTs - 7 * DAY);
  const p8 = at(pts, lastTs - 8 * DAY), p29 = at(pts, lastTs - 29 * DAY);
  const p30 = at(pts, lastTs - 30 * DAY), p121 = at(pts, lastTs - 121 * DAY);
  const y1a = at(pts, lastTs - 365 * DAY), y2a = at(pts, lastTs - 730 * DAY), y3a = at(pts, lastTs - 1095 * DAY);

  if (n === "VIX") {
    // VIX-Zeile: Label = aktueller Stand, Veraenderungen invertiert (rot = Angst gestiegen)
    vixLevel = String(Math.round(now[1]));
    const ivp = (t) => (t && now ? -((now[1] / t[1] - 1) * 100) : null);
    indRows.push({
      n, lvl: vixLevel,
      w: display(ivp(w7)),
      s3w: display(p8 && p29 ? -((p8[1] / p29[1] - 1) * 100) : null),
      s3m: display(p30 && p121 ? -((p30[1] / p121[1] - 1) * 100) : null),
      y: display(ivp(y1a)),
      y2: display(y1a && y2a ? -((y1a[1] / y2a[1] - 1) * 100) : null),
      y3: display(y2a && y3a ? -((y2a[1] / y3a[1] - 1) * 100) : null),
    });
    continue;
  }
  const s = (x) => (x == null ? "null" : String(Math.round(x * 10) / 10));
  if (n === "10Y") {
    // Basispunkte, einheitliche Regel: ROT = Wert gefallen, WEISS = gestiegen
    const bp = (t) => (t && now ? Math.round((now[1] - t[1]) * 100) : null);
    indRows.push({
      n, lvl: now[1].toFixed(2),
      w: s(bp(w7)),
      s3w: s(p8 && p29 ? Math.round((p8[1] - p29[1]) * 100) : null),
      s3m: s(p30 && p121 ? Math.round((p30[1] - p121[1]) * 100) : null),
      y: s(bp(y1a)),
      y2: s(y1a && y2a ? Math.round((y1a[1] - y2a[1]) * 100) : null),
      y3: s(y2a && y3a ? Math.round((y2a[1] - y3a[1]) * 100) : null),
    });
  } else {
    const pct = (t) => (t && now ? (now[1] / t[1] - 1) * 100 : null);
    indRows.push({
      n,
      lvl: n === "GLD" ? String(Math.round(now[1])) : (n === "SOX" ? String(Math.round(now[1])) : now[1].toFixed(1)),
      w: display(pct(w7)),
      s3w: display(p8 && p29 ? (p8[1] / p29[1] - 1) * 100 : null),
      s3m: display(p30 && p121 ? (p30[1] / p121[1] - 1) * 100 : null),
      y: display(pct(y1a)),
      y2: display(y1a && y2a ? (y1a[1] / y2a[1] - 1) * 100 : null),
      y3: display(y2a && y3a ? (y2a[1] / y3a[1] - 1) * 100 : null),
    });
  }
}
// feste Reihenfolge: VIX, 10Y, SOX, CU, GLD, OIL, GAS
indRows.sort((a, b) => IND_ORDER.indexOf(a.n) - IND_ORDER.indexOf(b.n));
const indLines = indRows.map((c) =>
  '  { n: "' + c.n + '", lvl: "' + c.lvl + '", w: ' + q(c.w) + ', s3w: ' + q(c.s3w) + ', s3m: ' + q(c.s3m) + ', y: ' + q(c.y) + ', y2: ' + q(c.y2) + ', y3: ' + q(c.y3) + " }"
).join(",\n");

const updated = new Date().toISOString().slice(0, 10);
const out = "// Automatisch generiert von scripts/update-data.mjs (nicht von Hand editieren).\n"
  + "// v = [1D, 1W, 2W, 3W, 4W, 2M, 3M, 4M (Scheibe Tage 91-122), 1Y, 2Y, 3Y] als Anzeige-Strings,\n"
  + "// null = Zeitraum fehlt (kurze Historie). Stand: " + updated + "\n"
  + 'export const UPDATED = "' + updated + '";\nexport const ECB_RATE = "' + RATES.ECB + '";\nexport const VIX_LEVEL = "' + vixLevel + '";\nexport const CURRENCIES = [\n' + currLines + '\n];\nexport const INDICATORS = [\n' + indLines + '\n];\nexport const BLOCKS = [\n'
  + lines.join(",\n") + "\n];\n";

writeFileSync(new URL("../src/data.js", import.meta.url), out);
console.log("src/data.js neu geschrieben (Stand " + updated + ", " + result.length + " Positionen)");
