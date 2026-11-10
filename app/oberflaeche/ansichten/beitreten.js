// Beitreten (Spec 010, 030; Mockups „Beitreten“ und „Lobby“): Einladung per QR beantworten oder per Link verbinden,
// sich auswählen.
import { abweichungenVonDdv } from "../../kern/profile.js";
import { filzkopf, kopf } from "../bausteine.js";
import { h } from "../dom.js";
import { qrCode } from "../qr.js";
import { istRaum } from "../../netz/raum.js";
import { nameBlatt } from "./spieltisch.js";
import { beitreten, beitretenUeberRaum, schliesseTisch, tisch, zurueckkehren } from "../tisch.js";
let auswahl = null;
let neuerName = "";
let qrFuer = null;
export function beitretenAnsicht(app, teile) {
    const code = decodeURIComponent(teile.slice(1).join("/"));
    const t = tisch();
    // Spec 012: Wer mit altem Stand ohne Verbindung dasitzt, kehrt über diese Einladung zurück (Antwort am Spieltisch).
    if (t?.rolle === "mitspieler" && t.client && !t.client.verbunden && !t.neu) {
        queueMicrotask(() => { void zurueckkehren(app, code); app.geheZu("/tisch"); });
        return h("div", { class: "seite" }, kopf("Verbinde …", null));
    }
    if (!t || t.rolle !== "mitspieler") {
        queueMicrotask(() => void beitreten(app, code));
        return h("div", { class: "seite" }, kopf("Verbinde …", null));
    }
    return inhalt(app, t);
}
/** #/raum/<id>/<passwort> (Spec 030): verbinden über den Raum, danach wie nach dem QR-Tausch. */
export function raumAnsicht(app, teile) {
    const raum = { id: teile[1] ?? "", passwort: teile[2] ?? "" };
    if (!istRaum(raum)) {
        return h("div", { class: "seite" }, filzkopf("Einladung", "Der Link ist unvollständig"), h("p", { class: "hinweis fehler", role: "alert" }, "Bitte den ganzen Link aus der Nachricht öffnen."), h("a", { class: "knopf", href: "#/" }, "Zur Startseite"));
    }
    const t = tisch();
    if (t?.rolle === "gastgeber") {
        return h("div", { class: "seite" }, filzkopf("Einladung", "Das ist der Link zu deinem eigenen Tisch."), h("a", { class: "knopf haupt", href: "#/tisch" }, "Zum Tisch"));
    }
    // Getrennt mit altem Stand: Die Rückkehr über den Raum läuft am Spieltisch von selbst.
    if (t?.rolle === "mitspieler" && t.client && !t.client.verbunden) {
        queueMicrotask(() => app.geheZu("/tisch"));
        return h("div", { class: "seite" });
    }
    if (!t || t.rolle !== "mitspieler") {
        queueMicrotask(() => void beitretenUeberRaum(app, raum));
        return verbinde(app);
    }
    return inhalt(app, t);
}
/** Verbinden über den Link: Fortschritt und ein Weg zurück. */
function verbinde(app) {
    return h("div", { class: "seite", "aria-busy": "true" }, filzkopf("Einladung", "Verbinde mit dem Tisch …"), h("progress", { class: "laedt", "aria-label": "Verbinde mit dem Tisch" }), h("p", { class: "leise" }, "Über das Internet, direkt zum Handy des Gastgebers. Das dauert ein paar Sekunden."), h("button", { class: "knopf", "data-fokus": "abbrechen", onclick: async () => { await schliesseTisch(app); app.geheZu("/"); } }, "Abbrechen"));
}
function inhalt(app, t) {
    if (t.fehler) {
        return h("div", { class: "seite" }, filzkopf("Einladung", "Das hat nicht geklappt"), h("p", { class: "hinweis fehler", role: "alert" }, t.fehler), 
        // Über den Link: Oft war der Gastgeber nur kurz nicht da. Neu laden versucht es noch einmal.
        t.ueberRaum ? h("button", { class: "knopf haupt", "data-fokus": "nochmal", onclick: () => location.reload() }, "Noch einmal versuchen") : null, h("a", { class: "knopf", href: "#/" }, "Zur Startseite"));
    }
    const c = t.client;
    if (!c || (!c.tisch && !t.antwort)) {
        if (t.ueberRaum)
            return verbinde(app);
        return h("div", { class: "seite", "aria-busy": "true" }, filzkopf("Einladung", "Antwort wird erstellt …"));
    }
    // Sobald es Karten gibt: an den Tisch.
    if (c.sicht && c.platz) {
        queueMicrotask(() => app.geheZu("/tisch"));
        return h("div", { class: "seite" });
    }
    // ---------- Noch nicht verbunden: Antwort zeigen ----------
    if (!c.tisch && t.antwort) {
        if (qrFuer?.code !== t.antwort.code) {
            const platz = h("div", { class: "qr qr-laedt" }, "QR-Code wird erstellt …");
            qrFuer = { code: t.antwort.code, el: platz };
            const fuer = qrFuer;
            void qrCode(t.antwort.code, "Dein Antwort-Code").then((el) => { if (qrFuer === fuer) {
                platz.replaceWith(el);
                fuer.el = el;
            } });
        }
        return h("div", { class: "seite" }, filzkopf("Fast da", "Zeig diesen Code dem Handy, das den Tisch eröffnet hat"), h("section", { class: "karte einladung" }, qrFuer.el, h("p", { class: "leise", style: "margin: 0; text-align: center" }, "Der Gastgeber tippt „Antwort scannen“ und hält sein Handy über diesen Code."), h("details", {}, h("summary", {}, "Code als Text"), h("textarea", { readonly: true, rows: 3, id: "antwort-code", "aria-label": "Dein Antwort-Code" }, t.antwort.code))), h("p", { class: "leise" }, "Verbindung direkt zum Gastgeber, ohne Internet. Ihr müsst im selben WLAN oder Hotspot sein."));
    }
    const ti = c.tisch;
    if (!ti)
        return h("div", { class: "seite" });
    // ---------- Verbunden, noch kein Platz: Wer bist du? ----------
    if (!c.platz) {
        // Verwaiste Plätze bleiben wählbar (Stufe 4: neues Gerät, ein anderer bestätigt).
        // Spielt die KI für jemanden (Spec 013), ist sein Platz ebenfalls wählbar: Er übernimmt nach dem laufenden Stich.
        const zurueck = (p) => p.zustand === "weg" || p.ki === "fuer";
        const belegt = new Set(ti.plaetze.filter((p) => !zurueck(p)).map((p) => p.spielerId).filter(Boolean));
        const neu = auswahl === "neu";
        const gewaehlt = ti.spieler.find((s) => s.id === auswahl);
        return h("div", { class: "seite" }, filzkopf("Doppelkopf", `${ti.gastgeberName} lädt dich an den Tisch der ${ti.rundenName} ein.`), c.meldung ? h("p", { class: "hinweis fehler", role: "alert" }, c.meldung) : null, c.hinweis ? h("p", { class: "hinweis info", role: "status" }, c.hinweis) : null, inAppAnsicht() ? h("div", { class: "hinweis info", role: "note", "data-in-app": "" }, h("span", {}, h("b", {}, "Besser im Browser öffnen. "), "Hier drin reißt die Verbindung ab, sobald du die App wechselst. Über ⋯ oder das Teilen-Symbol „In Safari öffnen“ bzw. „In Chrome öffnen“ wählen.")) : null, ti.ersatzFuer ? h("p", { class: "hinweis info" }, `Gesucht wird ein Ersatz für Platz ${ti.ersatzFuer}. Wähle dich aus oder lege dich neu an.`) : null, h("section", { class: "gruppe" }, h("h2", { id: "wer-titel" }, "Wer bist du?"), h("div", { class: "raster-2", role: "group", "aria-labelledby": "wer-titel" }, ti.spieler.map((s) => h("button", {
            class: "wahl", "aria-pressed": String(auswahl === s.id), disabled: belegt.has(s.id), "data-fokus": `wer-${s.id}`,
            onclick: () => { auswahl = s.id; app.zeichne(); },
        }, s.name, belegt.has(s.id) ? h("span", { class: "zusatz" }, "sitzt schon") : null)), h("button", { class: "wahl neu", "aria-pressed": String(neu), "data-fokus": "wer-neu", onclick: () => { auswahl = "neu"; app.zeichne(); } }, "Mein Name fehlt")), neu ? [
            h("label", { for: "neuer-name" }, "Dein Name am Tisch"),
            h("input", { id: "neuer-name", type: "text", maxlength: 24, value: neuerName, placeholder: "z. B. Jonas", "data-fokus": "neuer-name", oninput: (e) => {
                    neuerName = e.target.value;
                    const knopf = document.querySelector('[data-fokus="platz-nehmen"]');
                    if (knopf) {
                        knopf.disabled = !neuerName.trim();
                        knopf.textContent = neuerName.trim() ? `Als ${neuerName.trim()} Platz nehmen` : "Namen eingeben";
                    }
                } }),
        ] : null), h("div", { class: "dehnen" }), h("button", {
            class: "knopf haupt", disabled: !gewaehlt && !(neu && neuerName.trim()), "data-fokus": "platz-nehmen",
            onclick: () => { if (neu)
                c.neuAmTisch(neuerName);
            else if (gewaehlt)
                c.waehle(gewaehlt.id); },
        }, neu ? (neuerName.trim() ? `Als ${neuerName.trim()} Platz nehmen` : "Namen eingeben") : gewaehlt ? `Als ${gewaehlt.name} Platz nehmen` : "Wähle dich aus"), h("p", { class: "leise", style: "margin: 0" }, "Kein Konto, keine E-Mail. Dieses Gerät merkt sich deinen Platz an diesem Tisch."), nichtMitspielen(app, c));
    }
    // ---------- Lobby ----------
    const ab = abweichungenVonDdv(ti.profil);
    return h("div", { class: "seite" }, filzkopf(`${ti.gastgeberName}s Tisch`, c.verbunden ? "direkt verbunden" : "Verbindung weg"), h("section", { class: "plaetze", "aria-label": "Plätze am Tisch" }, ti.plaetze.map((p) => h("div", { class: "platz-zeile", "data-platz": p.platz }, h("span", { class: "platz-nr" }, String(p.platz)), h("span", { class: "platz-name" }, p.name ?? "Platz frei", p.platz === c.platz ? h("span", { class: "leise" }, " · du") : null), p.platz === c.platz ? h("button", { class: "knopf text", "data-fokus": "name-aendern", onclick: () => app.zeigeBlatt(nameBlatt(app, c, p.name ?? "")) }, "Name ändern") : null, h("span", { class: `platz-status ${p.verbunden ? "ok" : ""}` }, p.spielerId ? (p.verbunden ? "da" : ti.schonLive === false ? "noch nicht da" : "getrennt") : "frei")))), h("p", {}, `${ti.gastgeberName} startet, sobald alle vier sitzen. Gespielt wird im Uhrzeigersinn.`), h("section", { class: "karte" }, h("strong", {}, `Regeln: ${ti.profil.name}`), ab.length === 0 ? h("p", { class: "leise", style: "margin: 0" }, "genau nach DDV-Turnierregeln")
        : h("ul", { style: "margin: 0; padding-left: 18px" }, ab.map((a) => h("li", {}, a)))), h("p", { class: "leise" }, "Jetzt schon quer halten, dann geht es gleich los."), nichtMitspielen(app, c));
}
/**
 * Spec 017: Läuft die Seite in einer App-internen Ansicht (Link aus WhatsApp, Instagram, Facebook …)? Dort trennt der
 * Wechsel in eine andere App die Verbindung, und Wiederverbinden klappt schlechter.
 */
export function inAppAnsicht(ua = navigator.userAgent) {
    return /WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|; wv\)/.test(ua);
}
/** Spec 017: Ausweg für Gäste vor dem Spiel (falscher Link, will doch nicht mitspielen). */
function nichtMitspielen(app, c) {
    return h("button", { class: "knopf text", "data-fokus": "nicht-mitspielen", onclick: async () => { c.trennen(); await schliesseTisch(app); app.geheZu("/"); } }, "Nicht mitspielen");
}
//# sourceMappingURL=beitreten.js.map