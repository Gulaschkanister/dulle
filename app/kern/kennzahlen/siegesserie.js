import { hatGewonnen, spieleVon } from "./spiele.js";
/** Längste Folge gewonnener Spiele, über Abende hinweg. */
export const siegesserie = {
    id: "siegesserie",
    titel: "Längste Siegesserie",
    braucht: ["gewinner"],
    berechne(spiele, id) {
        const eigene = spieleVon(spiele, id);
        if (eigene.length === 0)
            return null;
        let laengste = 0;
        let aktuell = 0;
        for (const s of eigene) {
            aktuell = hatGewonnen(s, id) ? aktuell + 1 : 0;
            laengste = Math.max(laengste, aktuell);
        }
        return { wert: laengste, basis: eigene.length };
    },
    format: (w) => `${w} ${w === 1 ? "Spiel" : "Spiele"}`,
};
//# sourceMappingURL=siegesserie.js.map