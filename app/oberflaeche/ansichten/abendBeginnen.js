// Abend beginnen: Sitzordnung und Vorhand wählen (Mockup „Schreiber · Abend beginnen“).
import { filzkopf, kopf, meldung, spielerAnlegenBlatt } from "../bausteine.js";
import { h, heute } from "../dom.js";
import { abweichungenText, merkeProfil, regelnWahlBlatt, zuletztGenutzt } from "../regeln.js";
import { plaetzeAus, spielerWahl, tischskizze, vorhandWahl } from "../sitzwahl.js";
let zustand = { reihe: [], vorhand: 0 };
let fuerRunde = "";
let profil = null;
export function abendBeginnen(app, teile) {
    const rundeId = teile[1] ?? "";
    const r = app.runde(rundeId);
    if (!r)
        return h("div", { class: "seite" }, kopf("Runde nicht gefunden", null));
    if (fuerRunde !== rundeId) {
        zustand = { reihe: [], vorhand: 0 };
        fuerRunde = rundeId;
        profil = null;
    }
    const regeln = profil ?? zuletztGenutzt(r);
    const aendern = (z) => { zustand = z; app.zeichne(); };
    const voll = zustand.reihe.length === 4;
    const aktive = Object.values(r.spieler).filter((s) => !s.ausgeblendet && !s.zusammengefuehrtIn).length;
    const frei = 4 - zustand.reihe.length;
    const beginnen = async () => {
        const sitzungId = app.neueId();
        const ok = await app.speichere("sitzungBegonnen", {
            datum: heute(), modus: "schreiber", profil: regeln,
            plaetze: plaetzeAus(zustand.reihe), ersteVorhand: (zustand.vorhand + 1),
        }, { runde: r.id, sitzung: sitzungId });
        if (ok) {
            merkeProfil(r.id, regeln);
            zustand = { reihe: [], vorhand: 0 };
            profil = null;
            app.geheZu(`/abend/${sitzungId}`);
        }
    };
    return h("div", { class: "seite" }, filzkopf("Abend beginnen", r.name, { rechts: h("a", { class: "knopf", href: `#/runde/${r.id}` }, "Abbrechen") }), meldung(app), h("div", { class: "zeile", style: "align-items: flex-start" }, h("div", { style: "flex-grow: 1; min-width: 0" }, h("div", { style: "font-weight: 600" }, `Regeln: ${regeln.name}`), h("div", { class: "leise" }, abweichungenText(regeln))), h("button", {
        class: "knopf", style: "flex: none", "data-fokus": "regeln-aendern",
        onclick: () => app.zeigeBlatt(regelnWahlBlatt(app, r, regeln, "Regeln für diesen Abend", (p) => { profil = p; app.zeigeBlatt(null); })),
    }, "Ändern")), tischskizze(r, zustand.reihe, voll ? `${r.spieler[zustand.reihe[zustand.vorhand] ?? ""]?.name ?? ""} kommt raus` : `Noch ${frei} ${frei === 1 ? "Platz" : "Plätze"} frei`), h("div", { class: "gruppe" }, h("div", { style: "font-size: 14px; font-weight: 600" }, "Spieler im Uhrzeigersinn antippen"), spielerWahl(r, zustand, aendern, () => app.zeigeBlatt(spielerAnlegenBlatt(app, r, (id) => {
        if (zustand.reihe.length < 4)
            zustand = { ...zustand, reihe: [...zustand.reihe, id] };
        app.zeichne();
    }))), aktive < 4 ? h("p", { class: "leise" }, `Für einen Abend braucht es vier Spieler. Es fehlen noch ${4 - aktive}, leg sie mit „+ Neu“ an.`) : null), voll ? vorhandWahl(r, zustand, aendern) : null, h("div", { class: "dehnen" }), h("button", { class: "knopf haupt", disabled: !voll, "data-fokus": "beginnen", onclick: () => void beginnen() }, voll ? "Abend beginnen" : "Erst 4 Spieler wählen"));
}
//# sourceMappingURL=abendBeginnen.js.map