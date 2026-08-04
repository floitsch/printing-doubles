import { dragonTrace } from "./dragon-reference.js";

document.querySelector("#dragon-trace-data").textContent = JSON.stringify(dragonTrace(1 / 3));
await import("./trace-player.js");
