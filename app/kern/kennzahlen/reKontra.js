import { hatGewonnen, prozent, spieleVon } from "./spiele.js";
/** Gewinnquote als Re und als Kontra. Nur Spiele mit bekannter Re-Partei. */
export const reKontra = {
    id: "re-kontra",
    titel: "Gewinnquote als Re / als Kontra",
    braucht: ["re", "gewinner"],
    berechne(spiele, id) {
        const bekannt = spieleVon(spiele, id).filter((s) => s.daten.re && s.daten.re.length > 0);
        if (bekannt.length === 0)
            return null;
        const w = { reGewonnen: 0, re: 0, kontraGewonnen: 0, kontra: 0 };
        for (const s of bekannt) {
            const gewonnen = hatGewonnen(s, id) ? 1 : 0;
            if (s.daten.re.includes(id)) {
                w.re++;
                w.reGewonnen += gewonnen;
            }
            else {
                w.kontra++;
                w.kontraGewonnen += gewonnen;
            }
        }
        return { wert: w, basis: bekannt.length };
    },
    format: (w) => `${prozent(w.reGewonnen, w.re)} / ${prozent(w.kontraGewonnen, w.kontra)}`,
};
//# sourceMappingURL=reKontra.js.map