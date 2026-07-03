const PAPER = '#f3f0e8';
const INK = '#17211e';
const MUTED = '#68726d';
const ACCENT = '#b47a32';
const GRID = '#aeb5b0';

export class DraftingCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.design = null;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.design && this.canvas.offsetParent !== null) this.render(this.design);
    });
    this.resizeObserver.observe(canvas.parentElement);
  }

  render(design, floorIndex = 0) {
    this.design = design;
    this.floorIndex = Math.max(0, Math.min(floorIndex, design.roomsByFloor.length - 1));
    const cssWidth = this.canvas.clientWidth || this.canvas.parentElement.clientWidth || 1200;
    const cssHeight = this.canvas.clientHeight || this.canvas.parentElement.clientHeight || 800;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = cssWidth;
    this.height = cssHeight;
    this.context.fillStyle = PAPER;
    this.context.fillRect(0, 0, cssWidth, cssHeight);

    const extents = this.getExtents(design);
    const titleWidth = Math.min(290, cssWidth * 0.24);
    const drawingWidth = cssWidth - titleWidth - 80;
    const drawingHeight = cssHeight - 100;
    const scale = Math.min(drawingWidth / (extents.width + 8), drawingHeight / (extents.depth + 8));
    this.transform = {
      scale,
      originX: 40 + drawingWidth / 2 - ((extents.xMin + extents.xMax) / 2) * scale,
      originY: 50 + drawingHeight / 2 + ((extents.zMin + extents.zMax) / 2) * scale,
    };

    this.drawBorder(titleWidth);
    this.drawRoad(design);
    this.drawPlot(design);
    this.drawSetback(design);
    this.drawRooms(design.roomsByFloor[this.floorIndex]);
    this.drawColumns(design);
    this.drawOpenings(design);
    this.drawDimensions(design);
    this.drawNorthArrow(design.input.northRotation);
    this.drawTitleBlock(design, titleWidth);
  }

  getExtents(design) {
    const xs = design.plotPolygon.map((point) => point.x);
    const zs = design.plotPolygon.map((point) => point.z);
    return {
      xMin: Math.min(...xs), xMax: Math.max(...xs),
      zMin: Math.min(...zs), zMax: Math.max(...zs),
      width: Math.max(...xs) - Math.min(...xs),
      depth: Math.max(...zs) - Math.min(...zs),
    };
  }

  x(value) { return this.transform.originX + value * this.transform.scale; }
  y(value) { return this.transform.originY - value * this.transform.scale; }

  line(a, b, options = {}) {
    const context = this.context;
    context.save();
    context.beginPath();
    context.strokeStyle = options.color || INK;
    context.lineWidth = options.width || 1;
    context.setLineDash(options.dash || []);
    context.moveTo(this.x(a.x), this.y(a.z));
    context.lineTo(this.x(b.x), this.y(b.z));
    context.stroke();
    context.restore();
  }

  polygon(points, options = {}) {
    const context = this.context;
    context.save();
    context.beginPath();
    context.moveTo(this.x(points[0].x), this.y(points[0].z));
    points.slice(1).forEach((point) => context.lineTo(this.x(point.x), this.y(point.z)));
    context.closePath();
    if (options.fill) { context.fillStyle = options.fill; context.fill(); }
    context.strokeStyle = options.color || INK;
    context.lineWidth = options.width || 1;
    context.setLineDash(options.dash || []);
    context.stroke();
    context.restore();
  }

  drawBorder(titleWidth) {
    const context = this.context;
    context.strokeStyle = INK;
    context.lineWidth = 1.2;
    context.strokeRect(14, 14, this.width - 28, this.height - 28);
    context.lineWidth = 0.5;
    context.strokeRect(20, 20, this.width - 40, this.height - 40);
    context.beginPath();
    context.moveTo(this.width - titleWidth, 20);
    context.lineTo(this.width - titleWidth, this.height - 20);
    context.stroke();
  }

  drawRoad(design) {
    const input = design.input;
    const halfW = input.plotWidth / 2;
    const halfD = input.plotDepth / 2;
    let polygon;
    if (input.roadSide === 'south') polygon = [{ x: -halfW, z: -halfD }, { x: halfW, z: -halfD }, { x: halfW, z: -halfD - input.roadWidth }, { x: -halfW, z: -halfD - input.roadWidth }];
    if (input.roadSide === 'north') polygon = [{ x: -halfW, z: halfD }, { x: halfW, z: halfD }, { x: halfW, z: halfD + input.roadWidth }, { x: -halfW, z: halfD + input.roadWidth }];
    if (input.roadSide === 'east') polygon = [{ x: halfW, z: -halfD }, { x: halfW + input.roadWidth, z: -halfD }, { x: halfW + input.roadWidth, z: halfD }, { x: halfW, z: halfD }];
    if (input.roadSide === 'west') polygon = [{ x: -halfW, z: -halfD }, { x: -halfW - input.roadWidth, z: -halfD }, { x: -halfW - input.roadWidth, z: halfD }, { x: -halfW, z: halfD }];
    this.polygon(polygon, { fill: '#d6d7d2', color: MUTED, width: 0.7 });
    const center = polygon.reduce((value, point) => ({ x: value.x + point.x / 4, z: value.z + point.z / 4 }), { x: 0, z: 0 });
    this.text(`${input.roadWidth.toFixed(1)} m WIDE ROAD`, center.x, center.z, 10, MUTED, 'center');
  }

  drawPlot(design) {
    this.polygon(design.plotPolygon, { color: INK, width: 2 });
    design.plotPolygon.forEach((point, index) => {
      const next = design.plotPolygon[(index + 1) % design.plotPolygon.length];
      const distance = Math.hypot(next.x - point.x, next.z - point.z);
      this.text(distance.toFixed(2), (point.x + next.x) / 2, (point.z + next.z) / 2, 8, MUTED, 'center', '#f3f0e8');
    });
  }

  drawSetback(design) {
    this.polygon(design.footprint, { color: ACCENT, width: 1, dash: [7, 4] });
  }

  drawRooms(rooms) {
    const context = this.context;
    rooms.forEach((room) => {
      const x = this.x(room.x);
      const y = this.y(room.z + room.d);
      const width = room.w * this.transform.scale;
      const height = room.d * this.transform.scale;
      context.fillStyle = `${room.color}38`;
      context.fillRect(x, y, width, height);
      context.strokeStyle = INK;
      context.lineWidth = room.type === 'balcony' ? 0.8 : 1.4;
      context.strokeRect(x, y, width, height);
      context.save();
      context.beginPath();
      context.rect(x + 2, y + 2, Math.max(0, width - 4), Math.max(0, height - 4));
      context.clip();
      if (width > 78 && height > 44) {
        const nameSize = Math.max(7, Math.min(9, width / Math.max(room.name.length, 8) * 1.45));
        this.text(room.name.toUpperCase(), room.center.x, room.center.z + 0.17, nameSize, INK, 'center');
        this.text(`${room.w.toFixed(2)} × ${room.d.toFixed(2)}  |  ${room.area.toFixed(1)} m²`, room.center.x, room.center.z - 0.18, 6.8, MUTED, 'center');
      } else if (width > 48 && height > 27) {
        this.text(room.name.toUpperCase(), room.center.x, room.center.z, 6.8, INK, 'center');
      } else {
        this.text(room.id, room.center.x, room.center.z, 6.5, INK, 'center');
      }
      context.restore();
    });
  }

  drawColumns(design) {
    const context = this.context;
    design.grid.columns.forEach((column) => {
      const size = Math.max(5, 0.3 * this.transform.scale);
      context.fillStyle = INK;
      context.fillRect(this.x(column.x) - size / 2, this.y(column.z) - size / 2, size, size);
    });
    design.grid.xs.forEach((x, index) => {
      this.text(String(index + 1), x, design.footprintBounds.zMin - 0.75, 8, ACCENT, 'center', PAPER);
    });
    design.grid.zs.forEach((z, index) => {
      this.text(String.fromCharCode(65 + index), design.footprintBounds.xMin - 0.75, z, 8, ACCENT, 'center', PAPER);
    });
  }

  drawOpenings(design) {
    const input = design.input;
    design.footprint.forEach((point, index) => {
      const next = design.footprint[(index + 1) % design.footprint.length];
      const length = Math.hypot(next.x - point.x, next.z - point.z);
      const count = Math.max(1, Math.floor(length / 3.4));
      for (let opening = 1; opening <= count; opening += 1) {
        const t = opening / (count + 1);
        const center = { x: point.x + (next.x - point.x) * t, z: point.z + (next.z - point.z) * t };
        const tangent = { x: (next.x - point.x) / length, z: (next.z - point.z) / length };
        const width = 1.35;
        const a = { x: center.x - tangent.x * width / 2, z: center.z - tangent.z * width / 2 };
        const b = { x: center.x + tangent.x * width / 2, z: center.z + tangent.z * width / 2 };
        this.line(a, b, { color: '#2f7f86', width: 4 });
        this.line(a, b, { color: PAPER, width: 1 });
      }
    });
    const front = this.frontMidpoint(design.footprintBounds, input.roadSide);
    this.text('MAIN ENTRY', front.x, front.z, 7.5, ACCENT, 'center', PAPER);
  }

  frontMidpoint(bounds, side) {
    if (side === 'south') return { x: (bounds.xMin + bounds.xMax) / 2, z: bounds.zMin - 0.35 };
    if (side === 'north') return { x: (bounds.xMin + bounds.xMax) / 2, z: bounds.zMax + 0.35 };
    if (side === 'east') return { x: bounds.xMax + 0.35, z: (bounds.zMin + bounds.zMax) / 2 };
    return { x: bounds.xMin - 0.35, z: (bounds.zMin + bounds.zMax) / 2 };
  }

  drawDimensions(design) {
    const bounds = design.footprintBounds;
    this.dimension({ x: bounds.xMin, z: bounds.zMax }, { x: bounds.xMax, z: bounds.zMax }, 1.2);
    this.dimension({ x: bounds.xMax, z: bounds.zMin }, { x: bounds.xMax, z: bounds.zMax }, -1.2);
  }

  dimension(a, b, offset) {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const normal = { x: -(b.z - a.z) / length, z: (b.x - a.x) / length };
    const da = { x: a.x + normal.x * offset, z: a.z + normal.z * offset };
    const db = { x: b.x + normal.x * offset, z: b.z + normal.z * offset };
    this.line(a, da, { color: MUTED, width: 0.6 });
    this.line(b, db, { color: MUTED, width: 0.6 });
    this.line(da, db, { color: MUTED, width: 0.8 });
    this.text(`${length.toFixed(2)} m`, (da.x + db.x) / 2, (da.z + db.z) / 2, 8, INK, 'center', PAPER);
  }

  drawNorthArrow(rotation) {
    const x = 64;
    const y = 74;
    const context = this.context;
    context.save();
    context.translate(x, y);
    context.rotate((rotation * Math.PI) / 180);
    context.strokeStyle = INK;
    context.lineWidth = 1.4;
    context.beginPath(); context.moveTo(0, 24); context.lineTo(0, -22); context.stroke();
    context.beginPath(); context.moveTo(0, -25); context.lineTo(-6, -10); context.lineTo(0, -13); context.lineTo(6, -10); context.closePath(); context.fillStyle = INK; context.fill();
    context.restore();
    context.font = '700 11px IBM Plex Mono, monospace';
    context.fillStyle = INK;
    context.textAlign = 'center';
    context.fillText('N', x, y - 33);
  }

  drawTitleBlock(design, titleWidth) {
    const context = this.context;
    const x = this.width - titleWidth + 18;
    const right = this.width - 36;
    let y = 52;
    const write = (text, size = 10, color = INK, weight = 500) => {
      context.font = `${weight} ${size}px IBM Plex Mono, monospace`;
      context.fillStyle = color;
      context.textAlign = 'left';
      context.fillText(text, x, y);
      y += size + 8;
    };
    write('VASTU / ENGINEERING STUDIO', 9, ACCENT, 700);
    write(design.input.projectName.toUpperCase(), 15, INK, 700);
    write(design.input.location.toUpperCase(), 8, MUTED, 500);
    y += 12;
    context.beginPath(); context.moveTo(x, y); context.lineTo(right, y); context.strokeStyle = MUTED; context.lineWidth = 0.5; context.stroke(); y += 22;
    write('DRAWING', 7, MUTED, 600);
    const floorName = this.floorIndex === 0 ? 'GROUND FLOOR' : `LEVEL ${String(this.floorIndex + 1).padStart(2, '0')}`;
    write(`${floorName} CONCEPT PLAN`, 11, INK, 700);
    write('SCALE: FIT TO SHEET', 8, MUTED, 500);
    write(`SHEET: VA-A01  /  REV: P01`, 8, MUTED, 500);
    y += 16;
    write('DESIGN BASIS', 7, MUTED, 600);
    write(`PLOT AREA       ${design.metrics.plotArea.toFixed(1)} m²`, 8);
    write(`GROUND COVERAGE ${design.metrics.coverage.toFixed(1)} %`, 8);
    write(`PROPOSED FAR    ${design.metrics.far.toFixed(2)}`, 8);
    write(`STOREYS          G + ${design.input.floors - 1}`, 8);
    write(`STRUCTURE        ${design.input.structuralSystem.toUpperCase()}`, 8);
    y += 16;
    write('PRELIMINARY QUANTITIES', 7, MUTED, 600);
    write(`CONCRETE         ${design.quantities.concrete.toFixed(1)} m³`, 8);
    write(`MASONRY          ${design.quantities.masonry.toFixed(1)} m³`, 8);
    write(`REINFORCEMENT    ${design.quantities.reinforcement.toFixed(0)} kg`, 8);
    y = this.height - 126;
    write('STATUS', 7, MUTED, 600);
    write('CONCEPT / NOT FOR CONSTRUCTION', 9, '#9f4e38', 700);
    write('Verify dimensions, regulations,', 7, MUTED, 500);
    write('structure and services before use.', 7, MUTED, 500);
  }

  text(value, x, z, size = 9, color = INK, align = 'center', background = null) {
    const context = this.context;
    context.save();
    context.font = `600 ${size}px IBM Plex Mono, monospace`;
    context.textAlign = align;
    context.textBaseline = 'middle';
    const px = this.x(x);
    const py = this.y(z);
    if (background) {
      const metrics = context.measureText(value);
      context.fillStyle = background;
      context.fillRect(px - metrics.width / 2 - 3, py - size / 2 - 2, metrics.width + 6, size + 4);
    }
    context.fillStyle = color;
    context.fillText(value, px, py);
    context.restore();
  }

  download(filename) {
    if (!this.design) return;
    const link = document.createElement('a');
    link.download = filename;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }
}
