import { nextUp } from "./float.js";
import { schubfachTrace } from "./schubfach-reference.js";

document.querySelector("#schubfach-coarse-data").textContent = JSON.stringify(schubfachTrace(0.3));
document.querySelector("#schubfach-fine-data").textContent = JSON.stringify(schubfachTrace(nextUp(1)));
await import("./trace-player.js");
