// Mitspieler-Seite (Spec 010): hält die letzte Sicht und den Tisch, schickt Aktionen. Kein DOM.
// Auch der Gastgeber spielt über diese Klasse (über einen Speicher-Kanal).
/** So viele Ereignisse je Nachricht beim Abgleich. */
const PAKET = 300;
export class Mitspieler {
    kanal;
    o;
    tisch = null;
    sicht = null;
    platz = null;
    meldung = null;
    hinweis = null;
    /** Wann der Hinweis kam (lokale Uhr): Die Oberfläche blendet ihn nach ein paar Sekunden aus. */
    hinweisSeit = 0;
    verbunden = true;
    letzteSeq = 0;
    halloGesendet = false;
    beiAenderung = null;
    /** Seit wann die Verbindung weg ist (lokale Uhr), sonst null. */
    wegSeit = null;
    wackelt = false;
    constructor(kanal, o = {}) {
        this.kanal = kanal;
        this.o = o;
        kanal.beiNachricht((n) => void this.nimm(n));
        kanal.beiStatus((s) => {
            this.wackelt = s === "wackelt";
            this.verbunden = s !== "zu";
            if (s === "zu" && this.wegSeit === null)
                this.wegSeit = Date.now();
            this.geaendert();
        });
    }
    /** Spec 012: Stand aus einer früheren Verbindung übernehmen (nach Neuladen oder vor der Rückkehr). */
    uebernimmStand(tisch, sicht) {
        if (!this.tisch && tisch)
            this.tisch = tisch;
        if (!this.sicht && sicht)
            this.sicht = sicht;
    }
    async nimm(n) {
        switch (n.t) {
            case "tisch":
                this.tisch = n.tisch;
                if (n.tisch.ich)
                    this.platz = n.tisch.ich;
                if (!this.halloGesendet) {
                    // Einmal pro Verbindung: mit Token zurück an den alten Platz, sonst nur Hallo.
                    this.halloGesendet = true;
                    if (this.o.version)
                        this.senden({ t: "version", v: this.o.version });
                    const token = this.o.tokenFuer?.(n.tisch.tischId);
                    if (token && !this.platz)
                        this.senden({ t: "hallo", token });
                }
                break;
            case "sitzt":
                this.platz = n.platz;
                this.meldung = null;
                if (this.tisch)
                    this.o.merkeToken?.(this.tisch.tischId, n.token);
                break;
            case "sicht":
                // Fehlt eine Nummer, ist etwas verloren gegangen: Sicht neu anfordern (netz-sicherheit, Regel 4).
                if (this.letzteSeq !== 0 && n.seq !== this.letzteSeq + 1 && n.seq > this.letzteSeq) {
                    this.letzteSeq = n.seq;
                    this.sicht = n.sicht;
                    this.senden({ t: "neu" });
                    break;
                }
                if (n.seq <= this.letzteSeq)
                    break;
                this.letzteSeq = n.seq;
                this.sicht = n.sicht;
                break;
            case "abgelehnt":
                this.meldung = n.grund;
                break;
            case "hinweis":
                this.hinweis = n.text;
                this.hinweisSeit = Date.now();
                break;
            case "runde":
                await this.o.uebernimm?.(n.ereignisse);
                break;
            case "bestand": {
                const t = this.tisch;
                if (!t || !this.o.ergaenzung)
                    break;
                const fehlen = await this.o.ergaenzung(t.rundeId, new Set(n.ids), t.sitzungId);
                for (let i = 0; i < fehlen.length; i += PAKET)
                    this.senden({ t: "ergaenzung", ereignisse: fehlen.slice(i, i + PAKET) });
                break;
            }
            case "uebergabe":
                if (this.tisch)
                    await this.o.uebergabe?.(n.zustand, this.tisch);
                break;
        }
        if (this.tisch && this.platz)
            this.o.merkeStand?.(this.tisch, this.sicht);
        this.geaendert();
    }
    wahl(w) { this.senden({ t: "wahl", wahl: w }); }
    zuruecknehmen() { this.senden({ t: "zuruecknehmen" }); }
    bestaetige(platz) { this.senden({ t: "bestaetige", platz }); }
    /** Tisch verlassen: Verbindung schließen. */
    trennen() { this.kanal.schliessen(); }
    waehle(spielerId) { this.senden({ t: "platz", spielerId }); }
    neuAmTisch(name) { this.senden({ t: "platz", neuerName: name }); }
    /** Eine Ablehnung bleibt sichtbar, bis man das Nächste tut. */
    aktion(a) { this.hinweis = null; this.meldung = null; this.senden({ t: "aktion", aktion: a }); }
    senden(n) {
        this.kanal.senden(n);
    }
    geaendert() {
        this.beiAenderung?.();
    }
}
//# sourceMappingURL=mitspieler.js.map