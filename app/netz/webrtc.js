// WebRTC-Datenkanal als Kanal (Spec 010). Signalisierung per QR-Tausch im kompakten Format aus Spike 009.
// Ohne STUN: am Tisch im selben WLAN oder Hotspot reichen lokale Kandidaten (netz-sicherheit, „Signalisierung“).
import { entpacke, komprimiere } from "./sdp.js";
import { Zusammensetzer, zerlege } from "./stuecke.js";
const STUN = [{ urls: "stun:stun.l.google.com:19302" }];
/** Wie lange Kandidaten gesammelt werden, bevor der Code entsteht. */
const SAMMELN_MS = 3000;
class WebRtcKanal {
    pc;
    empfaenger = [];
    statusHoerer = [];
    warteschlange = [];
    dc = null;
    zu = false;
    stuecke = new Zusammensetzer();
    constructor(pc) {
        this.pc = pc;
        pc.addEventListener("connectionstatechange", () => {
            if (pc.connectionState === "failed" || pc.connectionState === "closed")
                this.melde("zu");
            else if (pc.connectionState === "disconnected")
                this.melde("wackelt");
            else if (pc.connectionState === "connected" && this.dc?.readyState === "open")
                this.melde("offen");
        });
    }
    get offen() {
        return this.dc?.readyState === "open";
    }
    setze(dc) {
        this.dc = dc;
        dc.addEventListener("open", () => {
            for (const t of this.warteschlange.splice(0))
                dc.send(t);
            for (const f of this.statusHoerer)
                f("offen");
        });
        dc.addEventListener("close", () => this.melde("zu"));
        dc.addEventListener("message", (e) => {
            let rahmen;
            try {
                rahmen = JSON.parse(String(e.data));
            }
            catch {
                return;
            }
            const r = this.stuecke.nimm(rahmen);
            if (r.fertig)
                for (const f of this.empfaenger)
                    f(r.nachricht);
        });
    }
    senden(nachricht) {
        for (const text of zerlege(JSON.stringify(nachricht))) {
            if (this.dc?.readyState === "open")
                this.dc.send(text);
            else if (!this.zu)
                this.warteschlange.push(text);
        }
    }
    beiNachricht(f) { this.empfaenger.push(f); }
    beiStatus(f) { this.statusHoerer.push(f); }
    schliessen() {
        this.dc?.close();
        this.pc.close();
        this.melde("zu");
    }
    melde(s) {
        if (this.zu)
            return;
        if (s === "zu")
            this.zu = true;
        for (const f of this.statusHoerer)
            f(s);
    }
}
async function sammle(pc) {
    if (pc.iceGatheringState === "complete")
        return;
    await new Promise((fertig) => {
        const t = setTimeout(fertig, SAMMELN_MS);
        pc.addEventListener("icegatheringstatechange", () => {
            if (pc.iceGatheringState === "complete") {
                clearTimeout(t);
                fertig();
            }
        });
    });
}
/** Gastgeber: Einladung erzeugen. `annehmen` nimmt den Antwort-Code des Mitspielers. */
export async function erstelleEinladung(mitStun = false) {
    const pc = new RTCPeerConnection({ iceServers: mitStun ? STUN : [] });
    const kanal = new WebRtcKanal(pc);
    kanal.setze(pc.createDataChannel("tisch", { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    await sammle(pc);
    const code = komprimiere(pc.localDescription.sdp, "offer", mitStun);
    return {
        code, kanal,
        annehmen: async (antwortCode) => {
            const s = entpacke(antwortCode);
            if (s.art !== "answer")
                throw new Error("Das ist eine Einladung, keine Antwort. Bitte den Antwort-Code des Mitspielers scannen.");
            await pc.setRemoteDescription({ type: "answer", sdp: s.sdp });
        },
    };
}
/** Mitspieler: Antwort auf eine Einladung erzeugen. */
export async function beantworteEinladung(einladungsCode) {
    const s = entpacke(einladungsCode);
    if (s.art !== "offer")
        throw new Error("Das ist keine Einladung. Bitte den Code vom Handy des Gastgebers scannen.");
    const pc = new RTCPeerConnection({ iceServers: s.stun ? STUN : [] });
    const kanal = new WebRtcKanal(pc);
    pc.addEventListener("datachannel", (e) => kanal.setze(e.channel));
    await pc.setRemoteDescription({ type: "offer", sdp: s.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await sammle(pc);
    return { code: komprimiere(pc.localDescription.sdp, "answer", s.stun), kanal };
}
//# sourceMappingURL=webrtc.js.map