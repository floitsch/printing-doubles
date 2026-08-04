import { ryuTrace } from "./ryu-reference.js";

document.querySelector("#ryu-trace-data").textContent = JSON.stringify(ryuTrace(0.3));
await import("./trace-player.js");
