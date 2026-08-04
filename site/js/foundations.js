import { exactDecimal, traceShortest } from "./oracle.js";

document.querySelector("#foundation-exact").textContent = exactDecimal(0.3);
document.querySelector("#oracle-trace-data").textContent = JSON.stringify(traceShortest(0.3));
await import("./trace-player.js");
