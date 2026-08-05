import { dragonMarginScene } from "./dragon-reference.js";
import { NumberLineView } from "./number-line-view.js";

new NumberLineView(document.querySelector("#dragon-margin-canvas")).setScene(dragonMarginScene());
await import("./dragon-visuals.js");
