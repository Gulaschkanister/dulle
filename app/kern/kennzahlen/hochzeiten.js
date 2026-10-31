import { spieleVon } from "./spiele.js";
/** Wer hatte die Hochzeit? Der Prämienträger (Spec 007), sonst der zuerst gewählte Re-Spieler. */
function hochzeiter(d) {
    return Object.keys(d.praemie ?? {})[0] ?? d.re?.[0];
}
/** Hochzeiten des Spielers und seine Prämienpunkte. */
export const hochzeiten = {
    id: "hochzeiten",
    titel: "Hochzeiten",
    braucht: ["spielart", "re"],
    nurMitDaten: true,
    berechne(spiele, id) {
        const eigene = spieleVon(spiele, id);
        const meine = eigene.filter((s) => s.daten.spielart === "hochzeit" && hochzeiter(s.daten) === id);
        if (meine.length === 0)
            return null;
        return { wert: { anzahl: meine.length, praemie: meine.reduce((a, s) => a + (s.daten.praemie?.[id] ?? 0), 0) }, basis: eigene.length };
    },
    format: (w) => `${w.anzahl}${w.praemie > 0 ? ` · +${w.praemie} Prämie` : ""}`,
};
//# sourceMappingURL=hochzeiten.js.map