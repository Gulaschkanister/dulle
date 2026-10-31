import { spieleVon } from "./spiele.js";
/** Summe aller Punkte einschließlich Prämien (Spec 007). */
export const punkteGesamt = {
    id: "punkte-gesamt",
    titel: "Punkte gesamt",
    braucht: ["punkte"],
    kopf: true,
    berechne(spiele, id) {
        const eigene = spieleVon(spiele, id);
        if (eigene.length === 0)
            return null;
        const wert = eigene.reduce((a, s) => a + (s.daten.punkte[id] ?? 0) + (s.daten.praemie?.[id] ?? 0), 0);
        return { wert, basis: eigene.length };
    },
    format: (w) => (w > 0 ? `+${w}` : w < 0 ? `−${-w}` : "0"),
};
//# sourceMappingURL=punkteGesamt.js.map