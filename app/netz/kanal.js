// Kanal zwischen zwei Geräten (Spec 010). WebRTC im echten Spiel, Speicher-Kanal in Tests und für das eigene
// Gerät des Gastgebers: Auch er spielt über dieselbe Schnittstelle wie alle anderen (netz-sicherheit, Regel 3).
/** Ein Ende eines Speicher-Kanals. Nachrichten laufen als JSON, wie über das Netz, und asynchron. */
class SpeicherEnde {
    gegenueber = null;
    offen = true;
    empfaenger = [];
    statusHoerer = [];
    /** Für Tests: alle gesendeten Nachrichten mitschreiben. */
    gesendet = [];
    senden(nachricht) {
        if (!this.offen || !this.gegenueber)
            return;
        const text = JSON.stringify(nachricht);
        this.gesendet.push(JSON.parse(text));
        const ziel = this.gegenueber;
        queueMicrotask(() => { if (ziel.offen)
            for (const f of ziel.empfaenger)
                f(JSON.parse(text)); });
    }
    beiNachricht(f) { this.empfaenger.push(f); }
    beiStatus(f) { this.statusHoerer.push(f); }
    schliessen() {
        if (!this.offen)
            return;
        this.offen = false;
        for (const f of this.statusHoerer)
            f("zu");
        this.gegenueber?.schliessen();
    }
}
export function speicherKanalPaar() {
    const a = new SpeicherEnde();
    const b = new SpeicherEnde();
    a.gegenueber = b;
    b.gegenueber = a;
    return [a, b];
}
//# sourceMappingURL=kanal.js.map