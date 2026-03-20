# Swipe & Rate – Setup

## Voraussetzungen
- [Node.js](https://nodejs.org/) (v16 oder neuer)

## Installation

```bash
# Abhängigkeiten installieren
npm install

# Server starten
npm start
```

Die App ist dann erreichbar unter: **http://localhost:3000**

## Bilder hinzufügen

Lege deine Bilder einfach in den Ordner:

```
public/images/
```

Unterstützte Formate: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.avif`

Der Dateiname wird automatisch als Bildtitel verwendet (Bindestriche und Unterstriche werden zu Leerzeichen).

Beispiel:
```
public/images/
  mein-urlaub.jpg       → "mein urlaub"
  berlin_sommer.png     → "berlin sommer"
  foto123.webp          → "foto123"
```

**Nach dem Hinzufügen neuer Bilder:** Seite im Browser neu laden – die Bilder werden automatisch in zufälliger Reihenfolge angezeigt.

## Bedienung

| Geste / Button | Aktion |
|---|---|
| Wischen nach rechts / ♥ | Bild mögen |
| Wischen nach links / ✕ | Bild ablehnen |
| Wischen nach unten / ★ | Als Favorit speichern |

Gespeicherte Favoriten erscheinen unten als Galerie. Ein Klick auf ein Favoritenbild öffnet es groß.

## Port ändern

```bash
PORT=8080 npm start
```

## Produktivbetrieb (optional)

Mit [PM2](https://pm2.keymetrics.io/) dauerhaft im Hintergrund laufen lassen:

```bash
npm install -g pm2
pm2 start server.js --name swipe-app
pm2 save
pm2 startup
```
