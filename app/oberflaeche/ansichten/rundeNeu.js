// Neue Runde: Name und Spieler in einem Schritt (Spec 006, Mockup „Neu: Runde und Spieler in einem Schritt“).
// Tipp-Budget: Rundenname + je Spieler Name + Enter + ein Tipp auf die Hauptaktion.
import { leseLokal, schreibeLokal } from "../app.js";
import { WIE_SPIELT_IHR } from "./runde.js";
import { filzkopf, meldung } from "../bausteine.js";
import { h } from "../dom.js";
let entwurf = { name: "", spieler: [], eingabe: "" };
export function rundeNeu(app) {
    const aendern = (teil) => { entwurf = { ...entwurf, ...teil }; app.zeichne(); };
    const hinzufuegen = () => {
        const name = entwurf.eingabe.trim();
        if (!name)
            return;
        aendern({ spieler: [...entwurf.spieler, name], eingabe: "", zuletzt: name });
    };
    const anzahl = entwurf.spieler.length;
    const anlegen = async () => {
        if (!entwurf.name.trim()) {
            app.melde("Gib der Runde zuerst einen Namen, zum Beispiel „Donnerstagsrunde“.");
            document.getElementById("rundenname")?.focus();
            return;
        }
        const rest = entwurf.eingabe.trim();
        const spieler = rest ? [...entwurf.spieler, rest] : entwurf.spieler;
        const rundeId = app.neueId();
        if (!(await app.speichere("rundeAngelegt", { name: entwurf.name.trim() }, { runde: rundeId })))
            return;
        for (const name of spieler) {
            if (!(await app.speichere("spielerAngelegt", { spielerId: app.neueId(), name }, { runde: rundeId })))
                return;
        }
        entwurf = { name: "", spieler: [], eingabe: "" };
        app.melde(null);
        // Spec 018: In die Runde, „Wie spielt ihr?“ ist offen (live oder mit echten Karten).
        schreibeLokal(WIE_SPIELT_IHR, rundeId);
        app.geheZu(`/runde/${rundeId}`);
    };
    return h("div", { class: "seite" }, filzkopf("Neue Runde", "Name und Spieler in einem Schritt", { rechts: h("a", { class: "knopf", href: "#/" }, "Abbrechen") }), meldung(app), h("div", { class: "gruppe" }, h("label", { for: "rundenname" }, "Name der Runde"), h("input", {
        type: "text", id: "rundenname", maxlength: 40, placeholder: "Donnerstagsrunde", autocomplete: "off", enterkeyhint: "next",
        value: entwurf.name, "data-fokus": "rundenname",
        oninput: (e) => { entwurf.name = e.target.value; },
        onkeydown: (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                app.zeichne();
                document.getElementById("neuer-spieler")?.focus();
            }
        },
    })), h("div", { class: "gruppe" }, h("div", { class: "zeile" }, h("label", { for: "neuer-spieler", style: "flex-grow: 1" }, "Spieler"), h("span", { class: "leise", style: `color: var(${anzahl === 0 ? "--warning" : "--accent"})` }, anzahl >= 4 ? `${anzahl} Spieler` : anzahl === 0 ? "Trag mindestens dich selbst ein." : `${anzahl} Spieler`)), anzahl > 0
        ? h("div", { class: "chips", "aria-label": "Spieler der neuen Runde" }, entwurf.spieler.map((name, i) => h("span", { class: `chip${name === entwurf.zuletzt && i === anzahl - 1 ? " neu-dazu" : ""}` }, name, h("button", {
            class: "weg", type: "button", "aria-label": `${name} entfernen`,
            onclick: () => aendern({ spieler: entwurf.spieler.filter((_, j) => j !== i), zuletzt: "" }),
        }, "×"))))
        : null, h("div", { class: "zeile" }, h("input", {
        type: "text", id: "neuer-spieler", maxlength: 24, placeholder: "Name eingeben", autocomplete: "off", enterkeyhint: "next",
        value: entwurf.eingabe, "data-fokus": "neuer-spieler",
        oninput: (e) => { entwurf.eingabe = e.target.value; },
        onkeydown: (e) => { if (e.key === "Enter") {
            e.preventDefault();
            hinzufuegen();
        } },
    }), h("button", { type: "button", class: "knopf", style: "flex: none", "data-fokus": "hinzufuegen", onclick: hinzufuegen }, "Hinzufügen")), 
    // Spec 017 (Live-Test 2026-11-13): ein Text für beide Wege, passend zu dem, was die App wirklich verlangt.
    h("p", { class: "leise", style: "margin: 0" }, anzahl >= 4
        ? "Enter fügt hinzu und hält das Feld offen. Weitere Spieler kommen jederzeit dazu."
        : "Live am Handy tragen sich die anderen beim Beitreten selbst ein, freie Plätze kann die KI übernehmen. Zum Mitschreiben mit echten Karten braucht ihr vier.")), h("div", { class: "dehnen" }), h("button", { class: "knopf haupt", "data-fokus": "runde-anlegen", onclick: () => void anlegen() }, anzahl > 0 ? `Runde mit ${anzahl} ${anzahl === 1 ? "Spieler" : "Spielern"} anlegen` : "Runde anlegen"));
}
//# sourceMappingURL=rundeNeu.js.map