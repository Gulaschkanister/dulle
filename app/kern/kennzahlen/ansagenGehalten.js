import { hatGewonnen, spieleVon } from "./spiele.js";
/** Hat die eigene Partei angesagt, hat sie dann gewonnen? Nur Rechner-Spiele kennen Ansagen. */
export const ansagenGehalten = {
    id: "ansagen-gehalten",
    titel: "Ansagen gehalten",
    braucht: ["ansagen", "re", "gewinner"],
    berechne(spiele, id) {
        const mitAnsagen = spieleVon(spiele, id).filter((s) => s.daten.eingabe === "rechner" && s.daten.ansagen && s.daten.re);
        if (mitAnsagen.length === 0)
            return null;
        let angesagt = 0;
        let gehalten = 0;
        for (const s of mitAnsagen) {
            const partei = s.daten.re.includes(id) ? "re" : "kontra";
            if (!s.daten.ansagen.some((a) => a.partei === partei))
                continue;
            angesagt++;
            if (hatGewonnen(s, id))
                gehalten++;
        }
        return { wert: { gehalten, angesagt }, basis: mitAnsagen.length };
    },
    format: (w) => (w.angesagt === 0 ? "nie angesagt" : `${w.gehalten} von ${w.angesagt}`),
};
//# sourceMappingURL=ansagenGehalten.js.map