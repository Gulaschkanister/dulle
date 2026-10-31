import { hatGewonnen, prozent, spieleVon } from "./spiele.js";
/** Anteil gewonnener Spiele. „Niemand gewinnt“ zählt als nicht gewonnen. */
export const gewinnquote = {
    id: "gewinnquote",
    titel: "Spiele gewonnen",
    braucht: ["gewinner"],
    kopf: true,
    berechne(spiele, id) {
        const eigene = spieleVon(spiele, id);
        if (eigene.length === 0)
            return null;
        return { wert: { gewonnen: eigene.filter((s) => hatGewonnen(s, id)).length, gespielt: eigene.length }, basis: eigene.length };
    },
    format: (w) => prozent(w.gewonnen, w.gespielt),
};
//# sourceMappingURL=gewinnquote.js.map