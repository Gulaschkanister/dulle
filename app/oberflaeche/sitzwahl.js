// Sitzordnung wählen: vier Spieler im Uhrzeigersinn antippen, eine Tischskizze zeigt das Ergebnis live.
// Platz 1 unten, dann links, oben, rechts.
import { kurzNamen } from "./bausteine.js";
import { h } from "./dom.js";
export function plaetzeAus(reihe) {
    return reihe.map((spielerId, i) => ({ platz: (i + 1), art: "mensch", spielerId }));
}
/** Tischskizze mit Kurznamen; die Beschriftung steht unter dem Tisch, damit die Plätze sie nicht verdecken. */
export function tischskizze(runde, reihe, beschriftung) {
    const kurz = kurzNamen(runde, reihe);
    return h("div", { class: "gruppe" }, h("div", { class: "tisch", "aria-hidden": "true" }, h("div", { class: "filz" }), [0, 1, 2, 3].map((i) => {
        const id = reihe[i];
        const klasse = id ? "belegt" : i === reihe.length ? "naechster" : "";
        return h("div", { class: `sitz p${i + 1} ${klasse}` }, h("span", { class: "nr" }, i + 1), id ? kurz[id] ?? "?" : i === reihe.length ? "tippen …" : "frei");
    })), h("p", { class: "leise", style: "margin: 0; text-align: center", "aria-live": "polite" }, beschriftung));
}
/** Liefert die Knöpfe zur Auswahl. `aendern` bekommt den neuen Zustand. */
export function spielerWahl(runde, z, aendern, neu) {
    const spieler = Object.values(runde.spieler)
        .filter((s) => !s.ausgeblendet && !s.zusammengefuehrtIn)
        .sort((a, b) => a.name.localeCompare(b.name, "de"));
    const kurz = kurzNamen(runde, spieler.map((s) => s.id));
    return h("div", { class: "raster-3", role: "group", "aria-label": "Spieler im Uhrzeigersinn" }, spieler.map((s) => {
        const idx = z.reihe.indexOf(s.id);
        const gewaehlt = idx >= 0;
        return h("button", {
            class: "wahl", "aria-pressed": String(gewaehlt), "data-fokus": `sitz-${s.id}`, title: s.name,
            "aria-label": gewaehlt ? `${s.name}, Platz ${idx + 1}` : s.name,
            onclick: () => {
                if (gewaehlt)
                    aendern({ reihe: z.reihe.filter((x) => x !== s.id), vorhand: 0 });
                else if (z.reihe.length < 4)
                    aendern({ ...z, reihe: [...z.reihe, s.id] });
            },
        }, h("span", { class: "kuerzen" }, gewaehlt ? `${idx + 1} · ${kurz[s.id] ?? s.name}` : s.name));
    }), neu ? h("button", { class: "wahl neu", "data-fokus": "sitz-neu", onclick: neu }, "+ Neu") : null);
}
export function vorhandWahl(runde, z, aendern) {
    const kurz = kurzNamen(runde, z.reihe);
    return h("div", { class: "gruppe" }, h("div", { id: "vorhand-titel", style: "font-size: 14px; font-weight: 600" }, "Wer kommt im ersten Spiel raus?"), h("div", { class: "segment", role: "group", "aria-labelledby": "vorhand-titel" }, z.reihe.map((id, i) => h("button", {
        "aria-pressed": String(z.vorhand === i), "data-fokus": `vorhand-${i}`, "aria-label": runde.spieler[id]?.name ?? "?",
        onclick: () => aendern({ ...z, vorhand: i }),
    }, kurz[id] ?? "?"))));
}
//# sourceMappingURL=sitzwahl.js.map