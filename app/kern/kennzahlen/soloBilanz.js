import { hatGewonnen, istSolo, spieleVon } from "./spiele.js";
/** Eigene Soli (auch Stilles Solo): gewonnen von gespielt. Ein Solo ist in beiden Modi erkennbar. */
export const soloBilanz = {
    id: "solo-bilanz",
    titel: "Solo-Bilanz",
    braucht: ["spielart", "re", "gewinner"],
    berechne(spiele, id) {
        const eigene = spieleVon(spiele, id);
        if (eigene.length === 0)
            return null;
        const soli = eigene.filter((s) => istSolo(s) && s.daten.re?.[0] === id);
        return { wert: { gewonnen: soli.filter((s) => hatGewonnen(s, id)).length, gespielt: soli.length }, basis: eigene.length };
    },
    format: (w) => (w.gespielt === 0 ? "kein Solo" : `${w.gewonnen} von ${w.gespielt}`),
};
//# sourceMappingURL=soloBilanz.js.map