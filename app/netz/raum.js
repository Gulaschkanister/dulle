// Raum (Spec 030): Geräte finden sich über eine Vermittlung (im Betrieb Trystero mit Nostr, im Test ein Speicher) und
// sprechen danach direkt über Kanäle. Stern bleibt: Mitspieler reden nur mit dem Gastgeber (netz-sicherheit, Grundsatz).
// Kein DOM.
import { speicherKanalPaar } from "./kanal.js";
function zufall128() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function neuerRaum() {
    return { id: zufall128(), passwort: zufall128() };
}
const ZEICHEN = /^[A-Za-z0-9_-]{16,64}$/;
export function istRaum(r) {
    const x = r;
    return !!x && typeof x.id === "string" && typeof x.passwort === "string" && ZEICHEN.test(x.id) && ZEICHEN.test(x.passwort);
}
/** Link-Teil hinter `#`: `/raum/<id>/<passwort>`. */
export function raumPfad(r) {
    return `/raum/${r.id}/${r.passwort}`;
}
/** Hält eingehende Nachrichten zurück, bis jemand zuhört: Ein Gegenüber kann senden, bevor die App den Kanal kennt. */
export function gepuffert(k) {
    const puffer = [];
    const hoerer = [];
    k.beiNachricht((n) => { if (hoerer.length === 0)
        puffer.push(n);
    else
        for (const f of [...hoerer])
            f(n); });
    return {
        senden: (n) => k.senden(n),
        beiNachricht: (f) => { hoerer.push(f); if (hoerer.length === 1)
            for (const n of puffer.splice(0))
                for (const g of [...hoerer])
                    g(n); },
        beiStatus: (f) => k.beiStatus(f),
        schliessen: () => k.schliessen(),
        get offen() { return k.offen; },
    };
}
const istRolle = (n) => n?.t === "rolle";
/**
 * Gastgeber im Raum: meldet sich bei jedem Gegenüber als Gastgeber dieses Tischs. Wer sich als Mitspieler meldet, geht an
 * `neuerGast` (einmal je Kanal). Andere Gastgeber im Raum werden ignoriert.
 */
export function gastgeberImRaum(raum, tischId, neuerGast) {
    raum.beiGegenueber((kanal) => {
        let zugewiesen = false;
        kanal.beiNachricht((n) => {
            if (zugewiesen || !istRolle(n) || n.rolle !== "mitspieler")
                return;
            zugewiesen = true;
            neuerGast(kanal);
        });
        kanal.senden({ t: "rolle", rolle: "gastgeber", tischId });
    });
}
/**
 * Mitspieler im Raum: wartet auf den Gastgeber (bei Rückkehr nur den mit derselben Tisch-ID). `verbunden` hängt seinen
 * Mitspieler an den Kanal, erst danach meldet sich dieses Gerät beim Gastgeber, damit keine Nachricht verloren geht.
 * Andere Mitspieler im Raum bleiben stumm. Ergebnis: false, wenn nach `ms` kein Gastgeber da war.
 */
export function mitspielerImRaum(raum, tischId, ms, verbunden) {
    return new Promise((fertig) => {
        let gefunden = false;
        const uhr = setTimeout(() => { if (!gefunden)
            fertig(false); }, ms);
        raum.beiGegenueber((kanal) => {
            kanal.beiNachricht((n) => {
                if (gefunden || !istRolle(n) || n.rolle !== "gastgeber")
                    return;
                if (tischId !== null && n.tischId !== tischId)
                    return;
                gefunden = true;
                clearTimeout(uhr);
                verbunden(kanal, n.tischId);
                kanal.senden({ t: "rolle", rolle: "mitspieler" });
                fertig(true);
            });
        });
    });
}
/** Vermittlung im Speicher (Tests): Wer denselben Raum mit demselben Passwort betritt, bekommt Kanäle zu allen anderen. */
export class SpeicherVermittlung {
    raeume = new Map();
    /** Für Tests: Vermittlung abschalten (kein Internet). */
    erreichbar = true;
    async betrete(raum) {
        if (!this.erreichbar)
            throw new Error("Keine Vermittlung erreichbar.");
        const schluessel = `${raum.id}/${raum.passwort}`;
        const mitglieder = this.raeume.get(schluessel) ?? new Set();
        this.raeume.set(schluessel, mitglieder);
        const hoerer = [];
        const wartend = [];
        const ich = {
            kanaele: new Set(),
            melde: (k) => { ich.kanaele.add(k); if (hoerer.length)
                hoerer.forEach((f) => f(k));
            else
                wartend.push(k); },
        };
        // Mit allen, die schon im Raum sind, je ein Kanalpaar (wie Trystero: jeder mit jedem).
        for (const andere of mitglieder) {
            const [a, b] = speicherKanalPaar();
            queueMicrotask(() => { andere.melde(gepuffert(a)); ich.melde(gepuffert(b)); });
        }
        mitglieder.add(ich);
        return {
            beiGegenueber: (f) => { hoerer.push(f); for (const k of wartend.splice(0))
                f(k); },
            verlasse: () => { mitglieder.delete(ich); for (const k of ich.kanaele)
                k.schliessen(); },
        };
    }
}
//# sourceMappingURL=raum.js.map