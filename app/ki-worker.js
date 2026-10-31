// Web Worker der guten KI (Spec 015): rechnet abseits der Oberfläche, damit der Tisch nicht ruckelt. Er bekommt nur
// die Sicht eines Platzes und das Regelprofil, nie den Zustand des Spiels.
import { IM_BETRIEB, kiZugGut } from "./kern/ki/gut.js";
const ort = self;
ort.onmessage = (e) => {
    const { id, sicht, profil } = e.data;
    try {
        ort.postMessage({ id, zug: kiZugGut(sicht, profil, { ...IM_BETRIEB, zufall: Math.random }) });
    }
    catch (f) {
        ort.postMessage({ id, fehler: String(f) });
    }
};
//# sourceMappingURL=ki-worker.js.map