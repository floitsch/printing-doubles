import { coonenBTrace } from "./coonen-reference.js";

document.querySelector("#coonen-trace-data").textContent = JSON.stringify(coonenBTrace(0.00135, 4));
await import("./trace-player.js");
