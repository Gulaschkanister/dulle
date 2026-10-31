// Vermittlung über Trystero mit Nostr (Spec 030). Trystero wird erst bei Bedarf aus dist/lib geladen (gebündelt von
// werkzeuge/bauen.mjs, kein CDN). Jedes Gegenüber im Raum wird ein Kanal; große Nachrichten zerlegt Trystero selbst.
import { gepuffert } from "./raum.js";
/** Kennung der App bei Trystero: Räume anderer Apps mit derselben Raum-ID treffen sich nie mit unseren. */
const APP_ID = "dulle-doppelkopf-v1";
let modul = null;
function lade() {
    modul ??= import(/* Pfad zur Laufzeit, relativ zur Seite */ new URL("lib/trystero.js", document.baseURI).href);
    return modul;
}
class TrysteroKanal {
    sende;
    trenne;
    empfaenger = [];
    statusHoerer = [];
    offen = true;
    constructor(sende, trenne) {
        this.sende = sende;
        this.trenne = trenne;
    }
    senden(nachricht) { if (this.offen)
        this.sende(nachricht); }
    beiNachricht(f) { this.empfaenger.push(f); }
    beiStatus(f) { this.statusHoerer.push(f); }
    liefere(n) { for (const f of [...this.empfaenger])
        f(n); }
    schliessen() {
        if (!this.offen)
            return;
        this.offen = false;
        this.trenne();
        for (const f of [...this.statusHoerer])
            f("zu");
    }
}
export function trysteroVermittlung(o = {}) {
    return {
        async betrete(raum) {
            const t = await lade();
            const room = t.joinRoom({
                appId: APP_ID, password: raum.passwort,
                ...(o.relays ? { relayConfig: { urls: o.relays } } : {}),
                ...(o.turn ? { turnConfig: o.turn } : {}),
            }, raum.id);
            // Nachrichten als JSON-Text; große Texte zerlegt Trystero selbst.
            const aktion = room.makeAction("d");
            const kanaele = new Map();
            const hoerer = [];
            const wartend = [];
            room.onPeerJoin = (peer) => {
                const k = new TrysteroKanal((n) => void aktion.send(JSON.stringify(n), { target: peer }), () => kanaele.delete(peer));
                kanaele.set(peer, k);
                const g = gepuffert(k);
                if (hoerer.length)
                    hoerer.forEach((f) => f(g));
                else
                    wartend.push(g);
            };
            room.onPeerLeave = (peer) => kanaele.get(peer)?.schliessen();
            aktion.onMessage = (text, { peerId }) => {
                let n;
                try {
                    n = JSON.parse(text);
                }
                catch {
                    return;
                }
                kanaele.get(peerId)?.liefere(n);
            };
            return {
                beiGegenueber: (f) => { hoerer.push(f); for (const k of wartend.splice(0))
                    f(k); },
                verlasse: () => { for (const k of [...kanaele.values()])
                    k.schliessen(); void room.leave(); },
            };
        },
    };
}
//# sourceMappingURL=trystero.js.map