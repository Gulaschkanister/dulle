// Startpunkt der App: Speicher öffnen, Datenverlust vorbeugen, Service Worker anmelden, Oberfläche zeichnen.
import { App } from "./oberflaeche/app.js";
import { ladeKartensaetze } from "./oberflaeche/karten.js";
import { ladeOffenenTisch } from "./oberflaeche/tisch.js";
import { routen } from "./oberflaeche/routen.js";
import { bittePersistenz, brauchtHomeBildschirmHinweis } from "./speicher/persistenz.js";
import { EreignisSpeicher } from "./speicher/speicher.js";
async function los() {
    const wurzel = document.getElementById("app");
    if (!wurzel)
        return;
    let speicher;
    try {
        speicher = await EreignisSpeicher.oeffne();
    }
    catch {
        wurzel.innerHTML = `<div class="seite"><div class="hinweis fehler" role="alert">
      Dulle kann auf diesem Gerät nichts speichern. Das passiert vor allem in privaten Fenstern oder wenn
      Website-Daten blockiert sind. Öffne Dulle in einem normalen Fenster oder erlaube Website-Daten.</div></div>`;
        return;
    }
    const app = new App(speicher, await speicher.geraetId(), wurzel, routen);
    app.hinweisHomeBildschirm = brauchtHomeBildschirmHinweis({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        standalone: navigator.standalone === true,
        displayModeStandalone: matchMedia("(display-mode: standalone)").matches,
    });
    await speicher.setzeEinstellung("persistenz", await bittePersistenz(navigator.storage));
    await ladeKartensaetze(speicher);
    await ladeOffenenTisch(app);
    await app.start();
    meldeServiceWorkerAn(app);
}
function meldeServiceWorkerAn(app) {
    if (!("serviceWorker" in navigator))
        return;
    // Nur wenn diese Seite schon von einer älteren Version gesteuert wird, ist eine neue Version ein Update.
    // (WebKit meldet „installed“ beim allerersten Laden erst nach clients.claim(), also mit Controller.)
    const hatteVersion = navigator.serviceWorker.controller !== null;
    let neuLaden = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (neuLaden)
            location.reload();
    });
    navigator.serviceWorker.register("sw.js").then((anmeldung) => {
        const bereit = (wartend) => {
            app.updateBereit = () => {
                neuLaden = true;
                wartend.postMessage("jetzt-aktualisieren");
            };
            app.zeichne();
        };
        if (anmeldung.waiting && hatteVersion)
            bereit(anmeldung.waiting);
        anmeldung.addEventListener("updatefound", () => {
            const neu = anmeldung.installing;
            neu?.addEventListener("statechange", () => {
                if (neu.state === "installed" && hatteVersion)
                    bereit(neu);
            });
        });
    }).catch(() => {
        // Ohne Service Worker läuft die App trotzdem, nur nicht offline.
    });
}
void los();
//# sourceMappingURL=main.js.map