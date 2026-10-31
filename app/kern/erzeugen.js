// Neue Ereignisse auf dem eigenen Gerät erzeugen: Umschlag füllen, Form und Bezug prüfen.
import { pruefeBezug } from "./bezug.js";
import { pruefeForm } from "./form.js";
import { SCHEMA_VERSION, SITZUNGS_TYPEN } from "./typen.js";
import { neueUlid } from "./ulid.js";
export function erzeugeEreignis(typ, daten, k) {
    const jetzt = k.jetzt ?? new Date();
    const ereignis = {
        v: SCHEMA_VERSION,
        id: neueUlid(jetzt.getTime()),
        runde: k.rundeId,
        zeit: jetzt.toISOString(),
        geraet: k.geraet,
        typ,
        daten,
    };
    if (SITZUNGS_TYPEN.has(typ)) {
        if (k.sitzungId === undefined)
            return { ok: false, fehler: ["Für dieses Ereignis fehlt die Sitzung."] };
        ereignis.sitzung = k.sitzungId;
        ereignis.seq = (k.hoechsteSeq ?? 0) + 1;
    }
    const fehler = [...pruefeForm(ereignis), ...pruefeBezug(typ, daten, k)];
    return fehler.length > 0 ? { ok: false, fehler } : { ok: true, wert: ereignis };
}
//# sourceMappingURL=erzeugen.js.map