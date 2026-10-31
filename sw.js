// Service Worker (Spec 001): speichert alle App-Dateien und liefert sie offline aus.
// VERSION und DATEIEN setzt werkzeuge/bauen.mjs beim Bauen ein.

const VERSION = "0.1.0-1d80893766";
const DATEIEN = [
  "./",
  "./app/kern/abrechnung.js",
  "./app/kern/austausch.js",
  "./app/kern/bezug.js",
  "./app/kern/erzeugen.js",
  "./app/kern/farbsehen.js",
  "./app/kern/form.js",
  "./app/kern/kartengestaltung.js",
  "./app/kern/kartensatz.js",
  "./app/kern/katalog.js",
  "./app/kern/kennzahlen/ansagenGehalten.js",
  "./app/kern/kennzahlen/bestePaarung.js",
  "./app/kern/kennzahlen/geldBilanz.js",
  "./app/kern/kennzahlen/gewinnquote.js",
  "./app/kern/kennzahlen/hochzeiten.js",
  "./app/kern/kennzahlen/index.js",
  "./app/kern/kennzahlen/punkteGesamt.js",
  "./app/kern/kennzahlen/reKontra.js",
  "./app/kern/kennzahlen/siegesserie.js",
  "./app/kern/kennzahlen/soloBilanz.js",
  "./app/kern/kennzahlen/spiele.js",
  "./app/kern/kennzahlen/typen.js",
  "./app/kern/ki/gut.js",
  "./app/kern/ki/notfall.js",
  "./app/kern/profile.js",
  "./app/kern/projektion.js",
  "./app/kern/schnell.js",
  "./app/kern/spiel/engine.js",
  "./app/kern/spiel/karten.js",
  "./app/kern/spiel/stich.js",
  "./app/kern/typen.js",
  "./app/kern/ulid.js",
  "./app/kern/wertung.js",
  "./app/ki-worker.js",
  "./app/main.js",
  "./app/netz/export.js",
  "./app/netz/gastgeber.js",
  "./app/netz/kanal.js",
  "./app/netz/kiSpieler.js",
  "./app/netz/mitspieler.js",
  "./app/netz/protokoll.js",
  "./app/netz/raum.js",
  "./app/netz/sdp.js",
  "./app/netz/stuecke.js",
  "./app/netz/trystero.js",
  "./app/netz/webrtc.js",
  "./app/oberflaeche/ansichten/abendBeginnen.js",
  "./app/oberflaeche/ansichten/abrechnung.js",
  "./app/oberflaeche/ansichten/beitreten.js",
  "./app/oberflaeche/ansichten/einstellungen.js",
  "./app/oberflaeche/ansichten/eintragen.js",
  "./app/oberflaeche/ansichten/kartenBuilder.js",
  "./app/oberflaeche/ansichten/runde.js",
  "./app/oberflaeche/ansichten/rundeNeu.js",
  "./app/oberflaeche/ansichten/spielblock.js",
  "./app/oberflaeche/ansichten/spieltisch.js",
  "./app/oberflaeche/ansichten/start.js",
  "./app/oberflaeche/ansichten/statistik.js",
  "./app/oberflaeche/ansichten/tischEroeffnen.js",
  "./app/oberflaeche/app.js",
  "./app/oberflaeche/bausteine.js",
  "./app/oberflaeche/dom.js",
  "./app/oberflaeche/export.js",
  "./app/oberflaeche/foto.js",
  "./app/oberflaeche/karten.js",
  "./app/oberflaeche/kiRechner.js",
  "./app/oberflaeche/qr.js",
  "./app/oberflaeche/regeln.js",
  "./app/oberflaeche/routen.js",
  "./app/oberflaeche/sicherung.js",
  "./app/oberflaeche/sitzwahl.js",
  "./app/oberflaeche/tisch.js",
  "./app/speicher/persistenz.js",
  "./app/speicher/speicher.js",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./index.html",
  "./kartensaetze/deutsch.json",
  "./kartensaetze/franzoesisch.json",
  "./kartensaetze/vierfarben.json",
  "./lib/jsQR.js",
  "./lib/qrcode.js",
  "./lib/trystero.js",
  "./manifest.webmanifest",
  "./schriften/barlow-400.woff2",
  "./schriften/barlow-600.woff2",
  "./schriften/fraunces-600.woff2",
  "./schriften/jetbrains-mono.woff2",
  "./stil/app.css",
  "./stil/tokens.css"
];
const CACHE = `dulle-${VERSION}`;

self.addEventListener("install", (ereignis) => {
  // Kein skipWaiting: Die neue Version übernimmt erst, wenn die Seite es erlaubt (nie mitten im Eintragen).
  ereignis.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(DATEIEN)));
});

self.addEventListener("activate", (ereignis) => {
  ereignis.waitUntil(
    caches.keys().then((namen) => Promise.all(namen.filter((n) => n.startsWith("dulle-") && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (ereignis) => {
  if (ereignis.data === "jetzt-aktualisieren") self.skipWaiting();
});

self.addEventListener("fetch", (ereignis) => {
  const anfrage = ereignis.request;
  if (anfrage.method !== "GET" || new URL(anfrage.url).origin !== self.location.origin) return;
  ereignis.respondWith(
    caches.match(anfrage, { ignoreSearch: true }).then((treffer) => {
      if (treffer) return treffer;
      // Seitenaufrufe (auch mit #-Route) bekommen offline immer die App.
      if (anfrage.mode === "navigate") return caches.match("./index.html").then((index) => index ?? fetch(anfrage));
      return fetch(anfrage);
    }),
  );
});
