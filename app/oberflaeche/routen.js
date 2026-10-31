// Hash-Router: #/ · #/runde-neu · #/runde/<id> · #/runde/<id>/abend-beginnen · #/runde/<id>/statistik · #/runde/<id>/spieler/<spielerId> · #/abend/<id> · #/abend/<id>/eintragen[/<nr>] · #/abend/<id>/abrechnung
import { abrechnung } from "./ansichten/abrechnung.js";
import { abendBeginnen } from "./ansichten/abendBeginnen.js";
import { eintragen } from "./ansichten/eintragen.js";
import { runde } from "./ansichten/runde.js";
import { rundeNeu } from "./ansichten/rundeNeu.js";
import { spielblock } from "./ansichten/spielblock.js";
import { start } from "./ansichten/start.js";
import { spielerProfil, statistik } from "./ansichten/statistik.js";
import { einstellungen } from "./ansichten/einstellungen.js";
import { kartenBuilder } from "./ansichten/kartenBuilder.js";
import { beitretenAnsicht, raumAnsicht } from "./ansichten/beitreten.js";
import { spieltisch } from "./ansichten/spieltisch.js";
import { tischEroeffnen } from "./ansichten/tischEroeffnen.js";
export function routen(teile) {
    const [bereich, , unter] = teile;
    if (bereich === "runde-neu")
        return rundeNeu;
    if (bereich === "einstellungen")
        return einstellungen;
    if (bereich === "kartensatz")
        return kartenBuilder;
    if (bereich === "tisch")
        return spieltisch;
    if (bereich === "beitreten")
        return beitretenAnsicht;
    if (bereich === "raum")
        return raumAnsicht;
    if (bereich === "runde")
        return unter === "abend-beginnen" ? abendBeginnen : unter === "statistik" ? statistik : unter === "am-handy" ? tischEroeffnen : unter === "spieler" ? spielerProfil : runde;
    if (bereich === "abend")
        return unter === "eintragen" ? eintragen : unter === "abrechnung" ? abrechnung : spielblock;
    return start;
}
//# sourceMappingURL=routen.js.map