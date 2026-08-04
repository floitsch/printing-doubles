import { grisuTrace } from "./grisu-reference.js";

document.querySelector("#grisu-success-data").textContent = JSON.stringify(grisuTrace(0.3));
document.querySelector("#grisu-failure-data").textContent = JSON.stringify(grisuTrace(1e23));
await import("./trace-player.js");
