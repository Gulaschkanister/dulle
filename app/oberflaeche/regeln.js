// Regelprofile wählen, ansehen und anpassen (Spec 002, Mockup „Regelprofil bearbeiten“).
import { abweichungenVonDdv, istVorlage, SCHALTER, schalterText, VORLAGEN, UNSERE_RUNDE } from "../kern/profile.js";
import { leseLokal, schreibeLokal } from "./app.js";
import { h } from "./dom.js";
const ZULETZT = (rundeId) => `dulle.profil.${rundeId}`;
/** Alle wählbaren Profile einer Runde: eigene zuerst, dann die Vorlagen. */
export function profileDerRunde(runde) {
    return [...Object.values(runde?.profile ?? {}).sort((a, b) => a.name.localeCompare(b.name, "de")), ...VORLAGEN];
}
/** Zuletzt in dieser Runde benutztes Profil, sonst „Unsere Runde“. */
export function zuletztGenutzt(runde) {
    const id = runde ? leseLokal(ZULETZT(runde.id)) : null;
    return profileDerRunde(runde).find((p) => p.id === id) ?? UNSERE_RUNDE;
}
export function merkeProfil(rundeId, profil) {
    schreibeLokal(ZULETZT(rundeId), profil.id);
}
export function abweichungenText(profil) {
    const liste = abweichungenVonDdv(profil);
    return liste.length === 0 ? "genau nach DDV-Turnierregeln" : `abweichend von DDV: ${liste.join(" · ")}`;
}
/** Blatt: Profil wählen. */
export function regelnWahlBlatt(app, runde, aktuell, titel, waehlen) {
    return h("div", { class: "gruppe" }, h("h2", {}, titel), h("div", { class: "liste", role: "radiogroup", "aria-label": "Regelprofil" }, profileDerRunde(runde).map((p) => h("button", {
        class: "wahl", role: "radio", "aria-checked": String(p.id === aktuell.id),
        style: "justify-content: flex-start; flex-direction: column; align-items: flex-start; padding: 8px 12px; text-align: left; min-height: 56px",
        onclick: () => waehlen(p),
    }, h("span", { style: "font-weight: 600" }, p.name, istVorlage(p) ? "" : " (eigenes)"), h("span", { class: "leise" }, abweichungenText(p))))), h("button", { class: "knopf", onclick: () => app.zeigeBlatt(regelnBearbeitenBlatt(app, runde, aktuell, waehlen)) }, `„${aktuell.name}“ ansehen und anpassen`), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Schließen"));
}
/** Blatt: Profil ansehen und anpassen. Anpassen speichert immer ein eigenes Profil der Runde. */
export function regelnBearbeitenBlatt(app, runde, quelle, gespeichert) {
    const schalter = structuredClone(quelle.schalter);
    let name = istVorlage(quelle) ? `${quelle.name} (angepasst)` : quelle.name;
    const inhalt = h("div", { class: "gruppe" });
    const zeichne = () => {
        const entwurf = { ...quelle, schalter };
        const gruppen = [...new Set(SCHALTER.map((s) => s.gruppe))];
        inhalt.replaceChildren(h("h2", {}, quelle.name), h("p", { class: "leise", style: "margin: 0" }, abweichungenText(entwurf)), ...gruppen.map((g) => h("section", { class: "gruppe", "aria-label": g }, h("h3", { style: "font-size: 14px; color: var(--ink-muted); margin-top: 8px" }, g), SCHALTER.filter((s) => s.gruppe === g).map((s) => h("div", { class: "gruppe", style: "gap: 4px; padding: 6px 0; border-bottom: 1px solid var(--line)" }, h("div", { class: "zeile" }, h("span", { style: "flex-grow: 1; font-weight: 600" }, s.name), s.wirktImSchreiber ? null : h("span", { class: "leise", style: "font-size: 13px" }, "wirkt im Direktspiel")), s.art === "jaNein"
            ? h("div", { class: "segment", role: "group", "aria-label": s.name }, [true, false].map((w) => h("button", { "aria-pressed": String((schalter[s.schluessel] === true) === w), onclick: () => { schalter[s.schluessel] = w; zeichne(); } }, w ? "ja" : "nein")))
            : s.art === "menge"
                ? h("div", { class: "chips", role: "group", "aria-label": s.name }, (s.optionen ?? []).map((o) => {
                    const liste = Array.isArray(schalter[s.schluessel]) ? schalter[s.schluessel] : [];
                    const an = liste.includes(o.wert);
                    return h("button", { class: "wahl", "aria-pressed": String(an), onclick: () => { schalter[s.schluessel] = an ? liste.filter((x) => x !== o.wert) : [...liste, o.wert]; zeichne(); } }, o.text);
                }))
                : h("div", { class: "segment", role: "group", "aria-label": s.name }, (s.optionen ?? []).map((o) => h("button", {
                    "aria-pressed": String(schalterText(s, schalter[s.schluessel]) === o.text),
                    onclick: () => { schalter[s.schluessel] = o.wert; zeichne(); },
                }, o.text))))))), h("label", { for: "profilname" }, "Name des Profils"), h("input", { type: "text", id: "profilname", maxlength: 40, value: name, oninput: (e) => { name = e.target.value; } }), h("button", {
            class: "knopf haupt",
            onclick: async () => {
                const sauber = name.trim() || "Eigene Regeln";
                const profil = istVorlage(quelle)
                    ? { id: app.neueId(), name: sauber, version: 1, schalter }
                    : { id: quelle.id, name: sauber, version: quelle.version + 1, schalter };
                if (await app.speichere("profilGespeichert", { profil }, { runde: runde.id })) {
                    merkeProfil(runde.id, profil);
                    app.zeigeBlatt(null);
                    gespeichert(profil);
                }
            },
        }, "Als eigenes Profil speichern"), h("button", { class: "knopf text", onclick: () => app.zeigeBlatt(null) }, "Abbrechen"));
    };
    zeichne();
    return inhalt;
}
//# sourceMappingURL=regeln.js.map