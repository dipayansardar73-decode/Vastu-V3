import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const COLORS = {
  background: 0x0b1210,
  site: 0x17211e,
  siteEdge: 0x6d7b73,
  setback: 0xd0a85c,
  concrete: 0xa7ada7,
  wall: 0xe3ded1,
  wallInner: 0xc9c5bb,
  steel: 0x444c4a,
  glazing: 0x7eb6b0,
  door: 0x6f4d2f,
  road: 0x242a28,
  heatLow: 0x3abf8f,
  heatMid: 0xe2a33f,
  heatHigh: 0xd84b37,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function shapeFromPolygon(points) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].z);
  points.slice(1).forEach((point) => shape.lineTo(point.x, point.z));
  shape.closePath();
  return shape;
}

function lineLoop(points, color, y = 0.02, dashed = false) {
  const vertices = points.map((point) => new THREE.Vector3(point.x, y, point.z));
  vertices.push(vertices[0].clone());
  const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.35, gapSize: 0.22 })
    : new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}

function boxBetween(a, b, height, thickness, y, material) {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), material);
  mesh.position.set((a.x + b.x) / 2, y + height / 2, (a.z + b.z) / 2);
  mesh.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createLabel(text, color = '#dfe7df') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  context.font = '600 28px IBM Plex Mono, monospace';
  context.textAlign = 'center';
  context.fillStyle = color;
  context.fillText(text.toUpperCase(), 256, 58);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(4.4, 0.82, 1);
  return sprite;
}

function uniqueRoomEdges(rooms) {
  const edges = new Map();
  const add = (a, b) => {
    const p1 = `${a.x.toFixed(3)},${a.z.toFixed(3)}`;
    const p2 = `${b.x.toFixed(3)},${b.z.toFixed(3)}`;
    const key = [p1, p2].sort().join('|');
    edges.set(key, { a, b });
  };
  rooms.forEach((room) => {
    const x0 = room.x;
    const x1 = room.x + room.w;
    const z0 = room.z;
    const z1 = room.z + room.d;
    add({ x: x0, z: z0 }, { x: x1, z: z0 });
    add({ x: x1, z: z0 }, { x: x1, z: z1 });
    add({ x: x1, z: z1 }, { x: x0, z: z1 });
    add({ x: x0, z: z1 }, { x: x0, z: z0 });
  });
  return [...edges.values()];
}

export class EngineeringScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.background);
    this.scene.fog = new THREE.Fog(COLORS.background, 45, 115);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 250);
    this.camera.position.set(28, 24, 30);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI / 2.02;

    const hemisphere = new THREE.HemisphereLight(0xe6f0e9, 0x29302c, 2.1);
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xfff4dc, 3.2);
    sun.position.set(-22, 35, -18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    this.scene.add(sun);

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);
    this.solidGroup = new THREE.Group();
    this.modelRoot.add(this.solidGroup);
    this.roofGroup = null;
    this.xrayGroup = null;
    this.roofVisible = true;
    this.xrayVisible = false;
    this.componentFocus = 'all';
    this.design = null;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ color: 0x0d1513, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.04;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    this.animate();
  }

  clearModel() {
    this.modelRoot.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (material.map) material.map.dispose();
          material.dispose();
        });
      }
    });
    this.scene.remove(this.modelRoot);
    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);
    this.solidGroup = new THREE.Group();
    this.modelRoot.add(this.solidGroup);
  }

  renderDesign(design) {
    this.clearModel();
    this.design = design;
    this.createSite(design);
    this.createStructure(design);
    this.createXray(design);
    this.createRoad(design);
    this.setView('perspective');
  }

  createSite(design) {
    const siteGeometry = new THREE.ShapeGeometry(shapeFromPolygon(design.plotPolygon));
    siteGeometry.rotateX(Math.PI / 2);
    const site = new THREE.Mesh(siteGeometry, new THREE.MeshStandardMaterial({ color: COLORS.site, roughness: 0.94 }));
    site.receiveShadow = true;
    this.solidGroup.add(site);
    this.solidGroup.add(lineLoop(design.plotPolygon, COLORS.siteEdge, 0.04));
    this.solidGroup.add(lineLoop(design.footprint, COLORS.setback, 0.055, true));

    const grid = new THREE.GridHelper(90, 90, 0x27312d, 0x19221f);
    grid.position.y = 0.01;
    grid.material.opacity = 0.45;
    grid.material.transparent = true;
    this.solidGroup.add(grid);
  }

  createRoad(design) {
    const { plotWidth, plotDepth, roadWidth, roadSide } = design.input;
    let width = plotWidth;
    let depth = roadWidth;
    let x = 0;
    let z = 0;
    if (roadSide === 'south') z = -plotDepth / 2 - roadWidth / 2;
    if (roadSide === 'north') z = plotDepth / 2 + roadWidth / 2;
    if (roadSide === 'east' || roadSide === 'west') {
      width = roadWidth;
      depth = plotDepth;
      x = (roadSide === 'east' ? 1 : -1) * (plotWidth / 2 + roadWidth / 2);
    }
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.035, depth),
      new THREE.MeshStandardMaterial({ color: COLORS.road, roughness: 1 }),
    );
    road.position.set(x, -0.005, z);
    this.solidGroup.add(road);
    const label = createLabel(`${roadWidth} m road`, '#8a9991');
    label.position.set(x, 0.08, z);
    label.material.rotation = 0;
    this.solidGroup.add(label);
  }

  createStructure(design) {
    const input = design.input;
    const externalMaterial = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.78 });
    const internalMaterial = new THREE.MeshStandardMaterial({ color: COLORS.wallInner, roughness: 0.82 });
    const concreteMaterial = new THREE.MeshStandardMaterial({ color: COLORS.concrete, roughness: 0.68 });
    const steelMaterial = new THREE.MeshStandardMaterial({ color: COLORS.steel, roughness: 0.32, metalness: 0.65 });
    const glassMaterial = new THREE.MeshPhysicalMaterial({ color: COLORS.glazing, transmission: 0.48, transparent: true, opacity: 0.62, roughness: 0.12 });
    const doorMaterial = new THREE.MeshStandardMaterial({ color: COLORS.door, roughness: 0.55 });
    const wallHeight = input.floorHeight - 0.38;
    const extThickness = input.externalWall / 1000;
    const intThickness = input.internalWall / 1000;
    const columnSize = input.columnSize / 1000;

    for (let floor = 0; floor < input.floors; floor += 1) {
      const baseY = 0.3 + floor * input.floorHeight;
      const slabGeometry = new THREE.ExtrudeGeometry(shapeFromPolygon(design.footprint), { depth: 0.15, bevelEnabled: false });
      slabGeometry.rotateX(Math.PI / 2);
      const slab = new THREE.Mesh(slabGeometry, concreteMaterial);
      slab.position.y = baseY;
      slab.castShadow = true;
      slab.receiveShadow = true;
      this.solidGroup.add(slab);

      design.roomsByFloor[floor].forEach((room) => {
        const floorMesh = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(room.w - 0.12, 0.1), 0.035, Math.max(room.d - 0.12, 0.1)),
          new THREE.MeshStandardMaterial({ color: room.color, roughness: 0.88 }),
        );
        floorMesh.position.set(room.center.x, baseY + 0.18, room.center.z);
        floorMesh.receiveShadow = true;
        this.solidGroup.add(floorMesh);
      });

      uniqueRoomEdges(design.roomsByFloor[floor]).forEach(({ a, b }) => {
        this.solidGroup.add(boxBetween(a, b, wallHeight, intThickness, baseY + 0.16, internalMaterial));
      });
      design.footprint.forEach((point, index) => {
        const next = design.footprint[(index + 1) % design.footprint.length];
        this.solidGroup.add(boxBetween(point, next, wallHeight, extThickness, baseY + 0.16, externalMaterial));
      });
      design.openings.filter((opening) => opening.floor === floor).forEach((opening) => {
        this.createOpening(opening, baseY, input, glassMaterial, doorMaterial, steelMaterial);
      });

      if (input.structuralSystem !== 'load-bearing') {
        design.grid.columns.forEach((column) => {
          const size = input.structuralSystem === 'steel-frame' ? Math.max(0.18, columnSize * 0.72) : columnSize;
          const material = input.structuralSystem === 'steel-frame' ? steelMaterial : concreteMaterial;
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, input.floorHeight, size), material);
          mesh.position.set(column.x, baseY + input.floorHeight / 2, column.z);
          mesh.castShadow = true;
          this.solidGroup.add(mesh);
        });
      }

      const stair = design.roomsByFloor[floor].find((room) => room.type === 'stair');
      if (stair) this.createStair(stair, baseY, input.floorHeight, concreteMaterial);
      if (floor > 0) this.createFrontBalcony(design, baseY, glassMaterial, steelMaterial, concreteMaterial);
    }

    this.roofGroup = new THREE.Group();
    const roofY = 0.3 + input.floors * input.floorHeight;
    const roofGeometry = new THREE.ExtrudeGeometry(shapeFromPolygon(design.footprint), { depth: 0.16, bevelEnabled: false });
    roofGeometry.rotateX(Math.PI / 2);
    const roof = new THREE.Mesh(roofGeometry, concreteMaterial);
    roof.position.y = roofY;
    roof.castShadow = true;
    this.roofGroup.add(roof);
    design.footprint.forEach((point, index) => {
      this.roofGroup.add(boxBetween(point, design.footprint[(index + 1) % design.footprint.length], 1.05, 0.14, roofY + 0.16, externalMaterial));
    });
    const stairRoom = design.roomsByFloor.at(-1)?.find((room) => room.type === 'stair');
    if (stairRoom) {
      const headroom = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(stairRoom.w, 2.4), 2.25, Math.min(stairRoom.d, 3.0)),
        externalMaterial,
      );
      headroom.position.set(stairRoom.center.x, roofY + 1.26, stairRoom.center.z);
      headroom.castShadow = true;
      this.roofGroup.add(headroom);
      const headroomDoor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.95, 0.07), doorMaterial);
      headroomDoor.position.set(stairRoom.center.x, roofY + 1.05, stairRoom.z - 0.02);
      this.roofGroup.add(headroomDoor);
    }
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.65, 0.9, 24),
      new THREE.MeshStandardMaterial({ color: 0x2a3834, roughness: 0.5 }),
    );
    tank.position.set(design.footprintBounds.xMax - 1.4, roofY + 0.72, design.footprintBounds.zMax - 1.3);
    tank.castShadow = true;
    this.roofGroup.add(tank);
    const solar = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.08, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x1d2d35, metalness: 0.25, roughness: 0.25 }),
    );
    solar.position.set(design.footprintBounds.xMin + 1.8, roofY + 0.28, design.footprintBounds.zMax - 1.2);
    solar.rotation.x = -0.16;
    this.roofGroup.add(solar);
    this.roofGroup.visible = this.roofVisible;
    this.solidGroup.add(this.roofGroup);
  }

  createOpening(opening, baseY, input, glassMaterial, doorMaterial, frameMaterial) {
    const angle = -Math.atan2(opening.tangent.z, opening.tangent.x);
    const depth = opening.type.includes('door') ? 0.09 : 0.075;
    const material = opening.type.includes('door') ? doorMaterial : glassMaterial;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(opening.width + 0.12, opening.height + 0.12, depth), frameMaterial);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(opening.width, opening.height, depth + 0.01), material);
    const offset = 0.085;
    const x = opening.point.x + opening.normal.x * offset;
    const z = opening.point.z + opening.normal.z * offset;
    [frame, panel].forEach((mesh) => {
      mesh.position.set(x, baseY + 0.18 + opening.sill + opening.height / 2, z);
      mesh.rotation.y = angle;
      this.solidGroup.add(mesh);
    });
    const isWindow = opening.type === 'window' || opening.type === 'ventilator';
    if (isWindow) {
      const shadeDepth = input.facadeSystem === 'deep-shade' || input.climate === 'warm-humid' ? 0.5 : 0.22;
      const shade = new THREE.Mesh(new THREE.BoxGeometry(opening.width + 0.42, 0.08, shadeDepth), frameMaterial);
      shade.position.set(
        opening.point.x + opening.normal.x * (shadeDepth / 2),
        baseY + 0.18 + opening.sill + opening.height + 0.16,
        opening.point.z + opening.normal.z * (shadeDepth / 2),
      );
      shade.rotation.y = angle;
      shade.castShadow = true;
      this.solidGroup.add(shade);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(opening.width + 0.28, 0.06, 0.18), frameMaterial);
      sill.position.set(opening.point.x + opening.normal.x * 0.13, baseY + 0.18 + opening.sill - 0.04, opening.point.z + opening.normal.z * 0.13);
      sill.rotation.y = angle;
      this.solidGroup.add(sill);
    }
  }

  isFrontEdge(a, b, side) {
    const middle = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const bounds = this.design.footprintBounds;
    if (side === 'south') return Math.abs(middle.z - bounds.zMin) < 0.1;
    if (side === 'north') return Math.abs(middle.z - bounds.zMax) < 0.1;
    if (side === 'east') return Math.abs(middle.x - bounds.xMax) < 0.1;
    return Math.abs(middle.x - bounds.xMin) < 0.1;
  }

  createStair(room, baseY, floorHeight, material) {
    const steps = 16;
    const width = Math.min(room.w * 0.42, 1.15);
    const run = Math.min(room.d * 0.78, 4.2);
    for (let index = 0; index < steps; index += 1) {
      const tread = run / steps;
      const rise = floorHeight / (steps * 2);
      const step = new THREE.Mesh(new THREE.BoxGeometry(width, rise, tread), material);
      step.position.set(room.x + width / 2 + 0.18, baseY + 0.2 + rise * (index + 0.5), room.z + 0.3 + tread * (index + 0.5));
      step.castShadow = true;
      this.solidGroup.add(step);
    }
  }

  createFrontBalcony(design, baseY, glassMaterial, steelMaterial, concreteMaterial) {
    const bounds = design.footprintBounds;
    const side = design.input.roadSide;
    const width = Math.min((bounds.xMax - bounds.xMin) * 0.5, 5.5);
    const depth = 1.25;
    let x = (bounds.xMin + bounds.xMax) / 2;
    let z = (bounds.zMin + bounds.zMax) / 2;
    let slabW = width;
    let slabD = depth;
    if (side === 'south') z = bounds.zMin - depth / 2;
    if (side === 'north') z = bounds.zMax + depth / 2;
    if (side === 'east' || side === 'west') {
      slabW = depth; slabD = width;
      x = side === 'east' ? bounds.xMax + depth / 2 : bounds.xMin - depth / 2;
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.14, slabD), concreteMaterial);
    slab.position.set(x, baseY + 0.14, z);
    slab.castShadow = true;
    this.solidGroup.add(slab);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.85, side === 'east' || side === 'west' ? slabD : 0.04), glassMaterial);
    if (side === 'south') rail.position.set(x, baseY + 0.62, z - depth / 2);
    if (side === 'north') rail.position.set(x, baseY + 0.62, z + depth / 2);
    if (side === 'east' || side === 'west') {
      rail.geometry.dispose();
      rail.geometry = new THREE.BoxGeometry(0.04, 0.85, slabD);
      rail.position.set(x + (side === 'east' ? depth / 2 : -depth / 2), baseY + 0.62, z);
    }
    this.solidGroup.add(rail);
    const handrail = rail.clone();
    handrail.material = steelMaterial;
    handrail.scale.y = 0.055;
    handrail.position.y = baseY + 1.06;
    this.solidGroup.add(handrail);
  }

  toggleRoof() {
    this.roofVisible = !this.roofVisible;
    if (this.roofGroup) this.roofGroup.visible = this.roofVisible;
    return this.roofVisible;
  }

  heatColor(value) {
    if (value > 0.72) return COLORS.heatHigh;
    if (value > 0.46) return COLORS.heatMid;
    return COLORS.heatLow;
  }

  createXray(design) {
    if (this.xrayGroup) {
      this.modelRoot.remove(this.xrayGroup);
      this.xrayGroup.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose?.();
      });
    }
    this.xrayGroup = new THREE.Group();
    const input = design.input;
    const transparentConcrete = new THREE.MeshStandardMaterial({ color: 0xb7c0bb, transparent: true, opacity: 0.12, roughness: 0.5 });
    for (let floor = 0; floor < input.floors; floor += 1) {
      const y = 0.45 + floor * input.floorHeight;
      if (this.componentFocus === 'all' || this.componentFocus === 'slab') {
        const slabGeometry = new THREE.ExtrudeGeometry(shapeFromPolygon(design.footprint), { depth: 0.08, bevelEnabled: false });
        slabGeometry.rotateX(Math.PI / 2);
        const demand = design.structural.components.find((item) => item.type === 'slab').demand;
        const slab = new THREE.Mesh(slabGeometry, new THREE.MeshBasicMaterial({ color: this.heatColor(demand), transparent: true, opacity: 0.32 }));
        slab.position.y = y + 0.18;
        this.xrayGroup.add(slab);
      }
      if (this.componentFocus === 'all' || this.componentFocus === 'wall') {
        design.footprint.forEach((point, index) => {
          const wallDemand = design.structural.components.find((item) => item.type === 'wall').demand;
          const wall = boxBetween(point, design.footprint[(index + 1) % design.footprint.length], input.floorHeight - 0.45, 0.04, y, new THREE.MeshBasicMaterial({ color: this.heatColor(wallDemand), transparent: true, opacity: 0.22 }));
          this.xrayGroup.add(wall);
        });
      }
    }
    if (this.componentFocus === 'all' || this.componentFocus === 'column') {
      design.structural.hotspots.forEach((hotspot) => {
        const material = new THREE.MeshBasicMaterial({ color: this.heatColor(hotspot.demand), transparent: true, opacity: 0.86 });
        const size = 0.34 + hotspot.demand * 0.48;
        const column = new THREE.Mesh(new THREE.BoxGeometry(size, design.metrics.height, size), material);
        column.position.set(hotspot.x, design.metrics.height / 2, hotspot.z);
        this.xrayGroup.add(column);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(size * 0.85, 18, 12), material.clone());
        halo.material.opacity = 0.25;
        halo.position.set(hotspot.x, 0.35, hotspot.z);
        this.xrayGroup.add(halo);
      });
    }
    if (this.componentFocus === 'all') {
      design.structural.hotspots
        .filter((hotspot) => hotspot.demand > 0.58)
        .forEach((hotspot) => {
          const arrow = new THREE.ArrowHelper(
            new THREE.Vector3(0, -1, 0),
            new THREE.Vector3(hotspot.x, design.metrics.height + 1.2, hotspot.z),
            2 + hotspot.demand * 2,
            this.heatColor(hotspot.demand),
            0.55,
            0.28,
          );
          this.xrayGroup.add(arrow);
        });
    }
    if (this.componentFocus === 'all' || this.componentFocus === 'beam') {
      const beamDemand = design.structural.components.find((item) => item.type === 'beam').demand;
      const material = new THREE.MeshBasicMaterial({ color: this.heatColor(beamDemand), transparent: true, opacity: 0.72 });
      for (let floor = 1; floor <= input.floors; floor += 1) {
        const y = floor * input.floorHeight + 0.28;
        design.grid.xs.forEach((x) => {
          this.xrayGroup.add(boxBetween({ x, z: design.footprintBounds.zMin }, { x, z: design.footprintBounds.zMax }, 0.08, 0.16, y, material));
        });
        design.grid.zs.forEach((z) => {
          this.xrayGroup.add(boxBetween({ x: design.footprintBounds.xMin, z }, { x: design.footprintBounds.xMax, z }, 0.08, 0.16, y, material));
        });
      }
    }
    if (this.componentFocus === 'all' || this.componentFocus === 'stair') {
      design.roomsByFloor.forEach((rooms, floor) => {
        const stair = rooms.find((room) => room.type === 'stair');
        if (!stair) return;
        const demand = design.structural.components.find((item) => item.type === 'stair').demand;
        const core = new THREE.Mesh(
          new THREE.BoxGeometry(stair.w, input.floorHeight, stair.d),
          new THREE.MeshBasicMaterial({ color: this.heatColor(demand), transparent: true, opacity: 0.46 }),
        );
        core.position.set(stair.center.x, 0.3 + floor * input.floorHeight + input.floorHeight / 2, stair.center.z);
        this.xrayGroup.add(core);
      });
    }
    const ghost = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shapeFromPolygon(design.footprint), { depth: design.metrics.height, bevelEnabled: false }),
      transparentConcrete,
    );
    ghost.geometry.rotateX(Math.PI / 2);
    ghost.position.y = 0.18;
    this.xrayGroup.add(ghost);
    this.xrayGroup.visible = this.xrayVisible;
    this.modelRoot.add(this.xrayGroup);
  }

  setXray(visible, component = 'all') {
    this.xrayVisible = visible;
    this.componentFocus = component;
    if (this.design) {
      this.createXray(this.design);
      this.solidGroup.traverse((object) => {
        if (!object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if ('opacity' in material) {
            if (material.userData.baseOpacity == null) material.userData.baseOpacity = material.opacity ?? 1;
            if (material.userData.baseTransparent == null) material.userData.baseTransparent = material.transparent;
            material.transparent = visible ? true : material.userData.baseTransparent;
            material.opacity = visible ? Math.min(material.userData.baseOpacity, 0.16) : material.userData.baseOpacity;
          }
        });
      });
    }
  }

  setView(view) {
    if (!this.design) return;
    this.currentView = view;
    const bounds = this.design.footprintBounds;
    const size = Math.max(bounds.xMax - bounds.xMin, bounds.zMax - bounds.zMin);
    const height = this.design.metrics.height;
    const target = new THREE.Vector3(0, height * 0.35, 0);
    this.camera.up.set(0, 1, 0);
    this.controls.enableRotate = view === 'perspective';
    this.controls.target.copy(target);
    if (view === 'top') {
      this.camera.up.set(0, 0, -1);
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, Math.max(size * 1.9, height * 2.3), 0.001);
    } else if (view === 'front') {
      const distance = size * 1.8;
      const side = this.design.input.roadSide;
      if (side === 'north') this.camera.position.set(0, height * 0.55, distance);
      else if (side === 'east') this.camera.position.set(distance, height * 0.55, 0);
      else if (side === 'west') this.camera.position.set(-distance, height * 0.55, 0);
      else this.camera.position.set(0, height * 0.55, -distance);
    } else {
      this.camera.position.set(size * 1.25, Math.max(height * 1.15, size * 0.85), size * 1.35);
    }
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  resize() {
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.animate());
  }
}
