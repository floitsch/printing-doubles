import { coonenBTrace } from "./coonen-reference.js";

document.querySelector("#coonen-trace-data").textContent = JSON.stringify(coonenBTrace(1 / 3, 5));
await import("./trace-player.js");
