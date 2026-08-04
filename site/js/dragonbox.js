import { nextUp } from "./float.js";
import { dragonboxTrace } from "./dragonbox-reference.js";

document.querySelector("#dragonbox-big-data").textContent = JSON.stringify(dragonboxTrace(0.3));
document.querySelector("#dragonbox-small-data").textContent = JSON.stringify(dragonboxTrace(nextUp(1)));
document.querySelector("#dragonbox-short-data").textContent = JSON.stringify(dragonboxTrace(2));
await import("./trace-player.js");
