// Wiederkehrende Bausteine der Bildschirme.
import { leseLokal, schreibeLokal } from "./app.js";
import { h } from "./dom.js";
const HINWEIS_EINGEKLAPPT = "dulle.hinweisEingeklappt";
export function kopf(titel, unterzeile, rechts) {
    return h("header", { class: "kopf" }, h("div", { class: "titel" }, h("h1", {}, titel), unterzeile ? h("div", { class: "unterzeile" }, unterzeile) : null), rechts ?? null);
}
const SYM = {
    herz: "M12 21s-7.6-4.7-9.7-9.3C.8 8.3 3 4.4 6.7 4.4c2.2 0 3.8 1.3 5.3 3.3 1.5-2 3.1-3.3 5.3-3.3 3.7 0 5.9 3.9 4.4 7.3C19.6 16.3 12 21 12 21z",
    karo: "M12 2l8.2 10L12 22 3.8 12z",
    kreuz: "M12 2.6a4.2 4.2 0 0 0-3.4 6.7 4.2 4.2 0 1 0 2.6 7.1c-.3 2.2-1.2 3.7-2.7 4.6h7c-1.5-.9-2.4-2.4-2.7-4.6a4.2 4.2 0 1 0 2.6-7.1A4.2 4.2 0 0 0 12 2.6z",
};
function miniKarte(rang, symbol, farbe, x, y, drehung) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    const pfad = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pfad.setAttribute("d", symbol);
    pfad.setAttribute("fill", farbe);
    svg.appendChild(pfad);
    return h("div", { class: "mini-karte", style: `left: ${x}px; top: ${y}px; transform: rotate(${drehung}deg)` }, h("span", { style: `color: ${farbe}` }, rang), svg);
}
/** Kartenmotiv im Filzkopf: Kreuz-Dame, Fuchs, Dulle. Rein dekorativ. */
function kartenMotiv() {
    return h("div", { class: "karten-motiv", "aria-hidden": "true" }, miniKarte("D", SYM.kreuz, "#1C1A16", 14, 18, -14), miniKarte("A", SYM.karo, "#C0281F", 48, 8, -2), miniKarte("10", SYM.herz, "#C0281F", 84, 16, 12));
}
/** Filzkopf (Spec 006): Filzfläche, Titel in Fraunces, Knöpfe als Umriss, optional Kartenmotiv. */
export function filzkopf(titel, unterzeile, o = {}) {
    return h("header", { class: `filzkopf${o.motiv ? "" : " schmal"}${o.mitBlock ? " mit-block" : ""}` }, o.motiv ? kartenMotiv() : null, h("div", { class: "titel" }, h("h1", {}, titel), unterzeile ? h("div", { class: "unterzeile" }, unterzeile) : null), o.rechts ? h("div", { class: "rechts" }, o.rechts) : null, o.aktionen ? h("div", { class: "aktionen" }, o.aktionen) : null);
}
/** Dauer eines Bewegungs-Tokens in ms; 0 bei reduzierter Bewegung (tokens.css setzt dann 0ms). */
export function bewegungMs(token) {
    const wert = getComputedStyle(document.documentElement).getPropertyValue(`--motion-${token}`).trim();
    return Number.parseFloat(wert) || 0;
}
/** Zählt eine Zahl in einem Element von `von` auf `bis` hoch (Text, kein Layout). */
export function zaehleHoch(el, von, bis, format) {
    const dauer = bewegungMs("slow");
    if (dauer === 0 || von === bis) {
        el.textContent = format(bis);
        return;
    }
    const start = performance.now();
    const schritt = (jetzt) => {
        const anteil = Math.min(1, (jetzt - start) / dauer);
        const weich = 1 - (1 - anteil) ** 3;
        el.textContent = format(Math.round(von + (bis - von) * weich));
        if (anteil < 1 && el.isConnected)
            requestAnimationFrame(schritt);
    };
    el.textContent = format(von);
    requestAnimationFrame(schritt);
}
/** Hinweis gegen die 7-Tage-Löschung in Safari. Bleibt, bis die App vom Home-Bildschirm läuft; einklappbar. */
export function homeHinweis(app) {
    if (!app.hinweisHomeBildschirm)
        return null;
    if (leseLokal(HINWEIS_EINGEKLAPPT)) {
        return h("button", { class: "knopf text leise", "data-fokus": "hinweis-auf", onclick: () => { schreibeLokal(HINWEIS_EINGEKLAPPT, null); app.zeichne(); } }, "Spiele nicht dauerhaft gesichert · Mehr");
    }
    return h("div", { class: "hinweis", role: "note" }, h("div", { style: "flex-grow: 1" }, h("b", {}, "Zum Home-Bildschirm hinzufügen. "), "Sonst kann Safari deine Spiele nach 7 Tagen löschen. Teilen-Symbol, dann „Zum Home-Bildschirm“."), h("button", { class: "knopf text leise", "data-fokus": "hinweis-zu", onclick: () => { schreibeLokal(HINWEIS_EINGEKLAPPT, true); app.zeichne(); } }, "Später"));
}
export function meldung(app) {
    if (!app.meldung)
        return null;
    return h("div", { class: `hinweis ${app.meldungArt}`, role: app.meldungArt === "fehler" ? "alert" : "status" }, h("div", { style: "flex-grow: 1" }, app.meldung), h("button", { class: "knopf text leise", onclick: () => app.melde(null) }, "OK"));
}
export function spielerName(runde, spielerId) {
    if (spielerId.startsWith("ki-"))
        return "KI";
    return runde?.spieler[spielerId]?.name ?? "Unbekannt";
}
/**
 * Kurze Namen für enge Spalten. Das erste Wort (vor Leerzeichen oder Bindestrich) bleibt ganz, wenn es
 * höchstens 6 Zeichen hat. Längere werden auf den kürzesten Anfang (4–6 Zeichen) gekürzt, mit dem kein
 * anderer Spieler beginnt, und enden mit Punkt („Anna“, „Anne.“). Geht das nicht, bleibt der volle Name.
 */
export function kurzNamen(runde, ids) {
    const erstes = (id) => {
        const voll = spielerName(runde, id);
        return voll.split(/[\s-]/)[0] || voll;
    };
    const ergebnis = {};
    for (const id of ids) {
        const wort = erstes(id);
        if (wort.length <= 6) {
            ergebnis[id] = wort;
            continue;
        }
        const andere = ids.filter((x) => x !== id).map((x) => erstes(x).toLowerCase());
        let kurz;
        for (let n = 4; n <= 6 && !kurz; n++) {
            const anfang = wort.slice(0, n).toLowerCase();
            if (!andere.some((a) => a.startsWith(anfang)))
                kurz = `${wort.slice(0, n)}.`;
        }
        ergebnis[id] = kurz ?? spielerName(runde, id);
    }
    return ergebnis;
}
/**
 * Blatt zum Anlegen von Spielern (Spec 006): bleibt nach dem Anlegen offen, Feld wird geleert und behält den
 * Fokus, darunter die gerade angelegten Namen. `nachher` bekommt jede neue ID (z. B. um ihn gleich zu setzen).
 */
export function spielerAnlegenBlatt(app, runde, nachher) {
    const hinweis = h("div", { class: "leise", "aria-live": "polite" });
    const liste = h("div", { class: "chips", "aria-live": "polite" });
    const feld = h("input", {
        type: "text", id: "spielername", maxlength: 24, autocomplete: "off", enterkeyhint: "next", "data-fokus": "spielername",
        oninput: () => {
            const name = feld.value.trim().toLowerCase();
            const doppelt = name !== "" && Object.values(app.runde(runde.id)?.spieler ?? {}).some((s) => s.name.toLowerCase() === name);
            hinweis.textContent = doppelt ? "Diesen Namen gibt es schon. Geht trotzdem, ein Kürzel hilft beim Unterscheiden." : "";
        },
    });
    // Speichern nacheinander, Feld sofort leeren: Wer schnell tippt, verliert sonst den nächsten Namen,
    // weil das Feld erst nach dem Speichern des vorigen geleert würde.
    let kette = Promise.resolve();
    const anlegen = () => {
        const sauber = feld.value.trim();
        if (!sauber)
            return;
        feld.value = "";
        hinweis.textContent = "";
        feld.focus();
        kette = kette.then(async () => {
            const spielerId = app.neueId();
            if (!(await app.speichere("spielerAngelegt", { spielerId, name: sauber }, { runde: runde.id }))) {
                if (!feld.value)
                    feld.value = sauber;
                return;
            }
            liste.appendChild(h("span", { class: "chip neu-dazu" }, sauber));
            nachher?.(spielerId);
        });
    };
    return h("form", { class: "gruppe", onsubmit: (e) => { e.preventDefault(); anlegen(); } }, h("h2", {}, "Spieler anlegen"), h("label", { for: "spielername" }, "Name, dann Enter für den Nächsten"), h("div", { class: "zeile" }, feld, h("button", { type: "submit", class: "knopf", style: "flex: none" }, "Hinzufügen")), hinweis, liste, h("button", { type: "button", class: "knopf haupt", "data-fokus": "spieler-fertig", onclick: () => app.zeigeBlatt(null) }, "Fertig"));
}
/** Blatt für einen vorhandenen Spieler: umbenennen, aus- oder einblenden. */
export function spielerBlatt(app, runde, spielerId) {
    const spieler = runde.spieler[spielerId];
    if (!spieler)
        return h("p", {}, "Diesen Spieler gibt es nicht.");
    let name = spieler.name;
    const umbenennen = async () => {
        const sauber = name.trim();
        if (!sauber || sauber === spieler.name)
            return app.zeigeBlatt(null);
        if (await app.speichere("spielerUmbenannt", { spielerId, name: sauber }, { runde: runde.id }))
            app.zeigeBlatt(null);
    };
    return h("form", { class: "gruppe", onsubmit: (e) => { e.preventDefault(); void umbenennen(); } }, h("h2", {}, spieler.name), h("label", { for: "spielername" }, "Name"), h("input", { type: "text", id: "spielername", maxlength: 24, value: spieler.name, oninput: (e) => { name = e.target.value; } }), h("button", { type: "submit", class: "knopf haupt" }, "Namen speichern"), h("button", {
        type: "button", class: "knopf",
        onclick: async () => {
            if (await app.speichere("spielerAusgeblendet", { spielerId, ausgeblendet: !spieler.ausgeblendet }, { runde: runde.id }))
                app.zeigeBlatt(null);
        },
    }, spieler.ausgeblendet ? "Wieder einblenden" : "Ausblenden"), h("p", { class: "leise" }, spieler.ausgeblendet
        ? "Ausgeblendete Spieler fehlen in den Auswahllisten. Ihre Spiele bleiben erhalten."
        : "Ausblenden entfernt den Spieler aus den Auswahllisten. Seine Spiele bleiben erhalten."), h("button", { type: "button", class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Schließen"));
}
//# sourceMappingURL=bausteine.js.map