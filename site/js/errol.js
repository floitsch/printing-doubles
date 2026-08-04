import { fromBits } from "./float.js";
import { errolTrace } from "./errol-reference.js";

document.querySelector("#errol-ordinary-data").textContent = JSON.stringify(errolTrace(0.3));
document.querySelector("#errol-correction-data").textContent = JSON.stringify(errolTrace(fromBits(0x435eb281e7c86675n)));
await import("./trace-player.js");
