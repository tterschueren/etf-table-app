# ETF-Uebersicht (iPhone-Web-App)

Schwarze Vollbildtabelle mit 14 ETF-Positionen, zwei Bloecken a 7 Spalten,
Zeitraeume 1W bis 3Y, Tageswert ueber dem Kurztitel.

## Entwickeln
    npm install
    npm run dev

## Kursdaten aktualisieren
    npm run update
Danach `npm run build` und neu deployen. Die App selbst laedt KEINE Kurse
im Browser – die Zahlen stehen in `src/data.js` und werden nur durch das
Update-Skript erneuert.

## Als iPhone-App installieren (PWA)
1. `npm run build` – erzeugt `dist/`
2. `dist/` hosten, z. B. Netlify Drop (app.netlify.com/drop), Vercel oder GitHub Pages
3. URL in Safari oeffnen
4. Teilen -> "Zum Home-Bildschirm" -> hinzufuegen

Die App startet dann im Vollbild ohne Browserleiste und funktioniert dank
Service Worker auch offline.

## Hinweis zu Trennern/Update
- Keine Trennlinien, alle Werte rechtsbuendig
- Werte: einstellige ganze Zahlen mit einer Nachkommastelle, zweistellige ganz; halbes rundet weg von null; leere Zelle = Zeitraum fehlt; kurze Historie unter 1 Jahr zeigt 1J seit Listung
