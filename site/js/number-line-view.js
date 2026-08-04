/**
 * A deliberately algorithm-agnostic number-line renderer.
 *
 * Coordinates are supplied by the caller. A scene may contain bands, lanes,
 * ticks, markers, brackets, and captions. The float explorer, static figures,
 * and algorithm traces all use this same vocabulary.
 */
export class NumberLineView {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.scene = null;
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(canvas);
  }

  setScene(scene) {
    this.scene = scene;
    this.render();
  }

  size() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(300, Math.round(this.canvas.clientWidth));
    const height = Math.max(260, Math.round(this.canvas.clientHeight));
    if (this.canvas.width !== width * ratio || this.canvas.height !== height * ratio) {
      this.canvas.width = width * ratio;
      this.canvas.height = height * ratio;
    }
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width, height };
  }

  render() {
    if (!this.scene) return;
    const { width, height } = this.size();
    const ctx = this.context;
    const scene = this.scene;
    const domain = scene.domain || [-1.4, 1.4];
    const margin = scene.margin ?? 0;
    const mapX = (value) => margin + (value - domain[0]) / (domain[1] - domain[0]) * (width - 2 * margin);
    const mapY = (value) => value <= 1 ? value * height : value;
    this.hitRegions = [];

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = scene.background || "#192632";
    ctx.fillRect(0, 0, width, height);
    if (scene.grid !== false) this.drawGrid(ctx, width, height, scene.gridColor);

    for (const band of scene.bands || []) {
      const left = mapX(band.from);
      const right = mapX(band.to);
      const top = mapY(band.top ?? .13);
      const bottom = mapY(band.bottom ?? .85);
      ctx.fillStyle = band.color || "rgba(223,255,82,.13)";
      ctx.fillRect(left, top, right - left, bottom - top);
      if (band.border) {
        ctx.strokeStyle = band.border;
        ctx.lineWidth = band.width || 1;
        ctx.strokeRect(left, top, right - left, bottom - top);
      }
      if (band.label && right - left > 90) this.label(ctx, band.label, (left + right) / 2, top + 17, band.textColor || band.border || "#dfff52", "center");
    }

    for (const marker of scene.markers || []) {
      const x = mapX(marker.x);
      const markerTop = mapY(marker.from ?? .08);
      const markerBottom = mapY(marker.to ?? .9);
      ctx.strokeStyle = marker.color || "rgba(255,255,255,.35)";
      ctx.lineWidth = marker.width || 1;
      ctx.setLineDash(marker.dash || [2, 7]);
      ctx.beginPath();
      ctx.moveTo(x, markerTop);
      ctx.lineTo(x, markerBottom);
      ctx.stroke();
      ctx.setLineDash([]);
      if (marker.endpoint) {
        const endpointY = mapY(marker.endpointY ?? .35);
        ctx.beginPath();
        ctx.arc(x, endpointY, marker.endpointRadius || 5, 0, Math.PI * 2);
        ctx.fillStyle = marker.endpoint === "included" ? (marker.color || "#dfff52") : (scene.background || "#192632");
        ctx.fill();
        ctx.strokeStyle = marker.color || "#dfff52";
        ctx.lineWidth = 2;
        ctx.stroke();
        if (marker.endpointLabel) this.label(ctx, marker.endpointLabel, x + (marker.endpointLabelDx || 0), endpointY + (marker.endpointLabelDy || -12), marker.textColor || marker.color, marker.endpointAlign || "center");
      }
      if (marker.label) this.label(ctx, marker.label, x, mapY(marker.labelY ?? .94), marker.textColor || marker.color, marker.align || "center");
      if (marker.inspect) this.hitRegions.push({ x, y1: markerTop, y2: markerBottom, radius: marker.hitRadius || 14, inspect: marker.inspect });
    }

    for (const lane of scene.lanes || []) this.drawLane(ctx, lane, mapX, mapY, width);
    for (const bracket of scene.brackets || []) this.drawBracket(ctx, bracket, mapX, mapY);
    for (const caption of scene.captions || []) this.label(ctx, caption.text, mapX(caption.x ?? domain[0]), mapY(caption.y ?? .06), caption.color || "#f4f0e8", caption.align || "left", caption.font);

    if (scene.footer) this.label(ctx, scene.footer, width / 2, height - 20, scene.footerColor || "#f4f0e8", "center");
  }

  drawGrid(ctx, width, height, color = "rgba(255,255,255,.055)") {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (let y = 40; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(width, y + .5); ctx.stroke(); }
    for (let x = 40; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, height); ctx.stroke(); }
  }

  drawLane(ctx, lane, mapX, mapY, width) {
    const laneMargin = lane.margin ?? 0;
    const laneMapX = lane.domain
      ? (value) => laneMargin + (value - lane.domain[0]) / (lane.domain[1] - lane.domain[0]) * (width - 2 * laneMargin)
      : mapX;
    const y = mapY(lane.y);
    for (const band of lane.bands || []) {
      const left = laneMapX(band.from);
      const right = laneMapX(band.to);
      const top = y - (band.above ?? 34);
      const bottom = y + (band.below ?? 34);
      ctx.fillStyle = band.color || "rgba(223,255,82,.13)";
      ctx.fillRect(left, top, right - left, bottom - top);
      if (band.border) {
        ctx.strokeStyle = band.border;
        ctx.lineWidth = band.width || 1;
        ctx.strokeRect(left, top, right - left, bottom - top);
      }
      if (band.label && right - left > 100) this.label(ctx, band.label, (left + right) / 2, top - 8, band.textColor || band.border || lane.color, "center");
    }
    ctx.strokeStyle = lane.color || "#8eb3ff";
    ctx.lineWidth = lane.width || 1;
    ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(width, y + .5); ctx.stroke();
    if (lane.label) this.label(ctx, lane.label, 14, y - (lane.labelOffset || 58), lane.color || "#8eb3ff", "left");
    for (const tick of lane.ticks || []) {
      const x = laneMapX(tick.x);
      if (x < -8 || x > width + 8) continue;
      const height = tick.height ?? (tick.active ? 48 : 20);
      ctx.strokeStyle = tick.color || lane.color || "#8eb3ff";
      ctx.lineWidth = tick.width || (tick.active ? 3 : 1);
      ctx.beginPath(); ctx.moveTo(x, y - height); ctx.lineTo(x, y + (tick.below ?? height)); ctx.stroke();
      if (tick.dot) {
        ctx.fillStyle = tick.color || lane.color;
        ctx.beginPath(); ctx.arc(x, y, tick.dot, 0, Math.PI * 2); ctx.fill();
      }
      if (tick.label) this.label(ctx, tick.label, x + (tick.labelDx || 0), y + (tick.labelY ?? height + 17), tick.textColor || tick.color || lane.color, tick.align || "center");
      if (tick.topLabel) this.label(ctx, tick.topLabel, x, y - height - 10, tick.textColor || tick.color || lane.color, "center");
      if (tick.inspect) this.hitRegions.push({ x, y, radius: tick.hitRadius || 16, inspect: tick.inspect });
    }
  }

  hitTest(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best = null;
    for (const region of this.hitRegions || []) {
      const nearestY = region.y1 === undefined ? region.y : Math.max(region.y1, Math.min(region.y2, y));
      const distance = Math.hypot(x - region.x, y - nearestY);
      if (distance <= region.radius && (!best || distance < best.distance)) best = { ...region, distance };
    }
    return best;
  }

  drawBracket(ctx, bracket, mapX, mapY) {
    const left = mapX(bracket.from);
    const right = mapX(bracket.to);
    const y = mapY(bracket.y);
    const cap = bracket.cap || 10;
    ctx.strokeStyle = bracket.color || "#ef4b35";
    ctx.lineWidth = bracket.width || 2;
    ctx.beginPath();
    ctx.moveTo(left, y); ctx.lineTo(right, y);
    ctx.moveTo(left, y - cap); ctx.lineTo(left, y + cap);
    ctx.moveTo(right, y - cap); ctx.lineTo(right, y + cap);
    ctx.stroke();
    if (bracket.label) this.label(ctx, bracket.label, (left + right) / 2, y - 13, bracket.color || "#ef4b35", "center");
  }

  label(ctx, text, x, y, color, align = "left", font = "10px 'DM Mono', monospace") {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  }
}
