import { dragonMarginScene, dragonStructuralTrace, dragonTrace } from "./dragon-reference.js";
import { NumberLineView } from "./number-line-view.js";

document.querySelector("#dragon-trace-data").textContent = JSON.stringify(dragonTrace(1 / 3));
document.querySelector("#dragon-structure-data").textContent = JSON.stringify(dragonStructuralTrace());
new NumberLineView(document.querySelector("#dragon-margin-canvas")).setScene(dragonMarginScene());
await import("./trace-player.js");
