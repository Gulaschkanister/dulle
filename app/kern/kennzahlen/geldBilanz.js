import { euro } from "../abrechnung.js";
import { spieleVon } from "./spiele.js";
/** Geld über alle mit Punktwert abgeschlossenen Abende. Prämien zählen nicht (Spec 007). */
export const geldBilanz = {
    id: "geld-bilanz",
    titel: "Geld-Bilanz",
    braucht: ["punkte", "punktwertCent"],
    kopf: true,
    nurMitDaten: true,
    berechne(spiele, id) {
        const mitGeld = spieleVon(spiele, id).filter((s) => s.punktwertCent);
        if (mitGeld.length === 0)
            return null;
        return { wert: mitGeld.reduce((a, s) => a + (s.daten.punkte[id] ?? 0) * s.punktwertCent, 0), basis: mitGeld.length };
    },
    format: (cent) => (cent > 0 ? `+${euro(cent)}` : euro(cent)),
};
//# sourceMappingURL=geldBilanz.js.map