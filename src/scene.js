import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { isExteriorRoomEdge, pointInPolygon, distanceToPolygon } from './domain.js';

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

function distanceToSegment(p, a, b) {
  const l2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.z - a.z);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) };
  return Math.hypot(p.x - proj.x, p.z - proj.z);
}

function interpolate(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

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

function uniqueRoomEdges(rooms, footprint) {
  const edges = new Map();
  const add = (a, b, room) => {
    const p1 = `${a.x.toFixed(3)},${a.z.toFixed(3)}`;
    const p2 = `${b.x.toFixed(3)},${b.z.toFixed(3)}`;
    const key = [p1, p2].sort().join('|');
    if (!edges.has(key)) {
      edges.set(key, { a, b, room });
    }
  };
  rooms.forEach((room) => {
    if (!room.polygon) return;
    for (let i = 0; i < room.polygon.length; i++) {
      add(room.polygon[i], room.polygon[(i + 1) % room.polygon.length], room);
    }
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
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);

    this.modelRoot = new THREE.Group();
    this.scene.add(this.modelRoot);
    this.groups = {
      site: new THREE.Group(),
      slabs: new THREE.Group(),
      columns: new THREE.Group(),
      walls: new THREE.Group(),
      stairs: new THREE.Group(),
      balconies: new THREE.Group(),
      openings: new THREE.Group(),
      rooms: new THREE.Group(),
      roof: new THREE.Group(),
    };
    Object.values(this.groups).forEach((g) => this.modelRoot.add(g));
    this.xrayGroup = null;
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
    this.groups = {
      site: new THREE.Group(),
      slabs: new THREE.Group(),
      columns: new THREE.Group(),
      walls: new THREE.Group(),
      stairs: new THREE.Group(),
      balconies: new THREE.Group(),
      openings: new THREE.Group(),
      rooms: new THREE.Group(),
      roof: new THREE.Group(),
    };
    Object.values(this.groups).forEach((g) => this.modelRoot.add(g));
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
    this.groups.site.add(site);
    this.groups.site.add(lineLoop(design.plotPolygon, COLORS.siteEdge, 0.04));
    this.groups.site.add(lineLoop(design.footprint, COLORS.setback, 0.055, true));

    const grid = new THREE.GridHelper(90, 90, 0x27312d, 0x19221f);
    grid.position.y = 0.01;
    grid.material.opacity = 0.45;
    grid.material.transparent = true;
    this.groups.site.add(grid);
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
    this.groups.site.add(road);
    const label = createLabel(`${roadWidth} m road`, '#8a9991');
    label.position.set(x, 0.08, z);
    label.material.rotation = 0;
    this.groups.site.add(label);
  }

  createStructure(design) {
    const input = design.input;
    const externalMaterial = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.78 });
    const internalMaterial = new THREE.MeshStandardMaterial({ color: COLORS.wallInner, roughness: 0.82 });
    const concreteMaterial = new THREE.MeshStandardMaterial({ color: COLORS.concrete, roughness: 0.68 });
    const steelMaterial = new THREE.MeshStandardMaterial({ color: COLORS.steel, roughness: 0.32, metalness: 0.65 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x8aa8a0, transparent: true, opacity: 0.35, roughness: 0.15, metalness: 0.85 });
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
      this.groups.slabs.add(slab);

      design.roomsByFloor[floor].forEach((room) => {
        if (!room.polygon) return;
        const shape = shapeFromPolygon(room.polygon.map(p => ({
          x: p.x - room.center.x, 
          z: p.z - room.center.z
        })));
        const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false });
        geom.rotateX(Math.PI / 2);
        geom.translate(0, -0.0175, 0);
        const floorMesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: room.color, roughness: 0.88 }));
        floorMesh.position.set(room.center.x, baseY + 0.18, room.center.z);
        floorMesh.receiveShadow = true;
        this.groups.rooms.add(floorMesh);
      });

      uniqueRoomEdges(design.roomsByFloor[floor], design.footprint).forEach(({ a, b, room }) => {
        const isExt = isExteriorRoomEdge(a, b, design.footprint);
        
        // Skip edges that are bridging gaps in concave polygons (not internal, not on boundary)
        const midpoint = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        if (!isExt && !pointInPolygon(midpoint, design.footprint)) {
          return;
        }

        const length = Math.hypot(b.x - a.x, b.z - a.z);
        const edgeOpenings = design.openings.filter((o) => o.floor === floor && distanceToSegment(o.point, a, b) < 0.05);
        edgeOpenings.sort((o1, o2) => Math.hypot(o1.point.x - a.x, o1.point.z - a.z) - Math.hypot(o2.point.x - a.x, o2.point.z - a.z));
        let currentT = 0;
        
        const isBalcony = room.type === 'balcony';
        const isParking = room.type === 'parking';
        const thickness = isExt ? extThickness : intThickness;
        const material = isExt ? externalMaterial : internalMaterial;
        
        if (isExt && isParking) {
           // Parking is completely open at ground level
           return;
        }

        if (isExt && isBalcony) {
           // Draw just a glass railing/parapet for open rooms
           this.groups.walls.add(boxBetween(a, b, 1.05, thickness, baseY + 0.16, glassMaterial));
           return;
        }

        edgeOpenings.forEach((o) => {
          const dist = Math.hypot(o.point.x - a.x, o.point.z - a.z);
          const startT = Math.max(currentT, (dist - o.width / 2) / length);
          const endT = Math.min(1, (dist + o.width / 2) / length);
          if (startT > currentT) {
            this.groups.walls.add(boxBetween(interpolate(a, b, currentT), interpolate(a, b, startT), wallHeight, thickness, baseY + 0.16, material));
          }
          if (o.sill > 0) {
            this.groups.walls.add(boxBetween(interpolate(a, b, startT), interpolate(a, b, endT), o.sill, thickness, baseY + 0.16, material));
          }
          const lintelHeight = wallHeight - (o.sill + o.height);
          if (lintelHeight > 0) {
            this.groups.walls.add(boxBetween(interpolate(a, b, startT), interpolate(a, b, endT), lintelHeight, thickness, baseY + 0.16 + o.sill + o.height, material));
          }
          currentT = Math.max(currentT, endT);
        });
        if (currentT < 1) {
          this.groups.walls.add(boxBetween(interpolate(a, b, currentT), b, wallHeight, thickness, baseY + 0.16, material));
        }
      });
      design.openings.filter((opening) => opening.floor === floor).forEach((opening) => {
        this.createOpening(opening, baseY, input, glassMaterial, doorMaterial, steelMaterial);
      });

      if (input.structuralSystem !== 'load-bearing') {
        const topFloor = floor === input.floors - 1;
        // Use ground floor stair room for extending columns for the roof mumty
        const stairForColumns = design.roomsByFloor[0]?.find((room) => room.type === 'stair');
        design.grid.columns.forEach((column) => {
          const size = input.structuralSystem === 'steel-frame' ? Math.max(0.18, columnSize * 0.72) : columnSize;
          const material = input.structuralSystem === 'steel-frame' ? steelMaterial : concreteMaterial;
          let colHeight = input.floorHeight;
          let yPos = baseY + input.floorHeight / 2;
          
          if (topFloor && stairForColumns) {
            if (column.x >= stairForColumns.x - 0.2 && column.x <= stairForColumns.x + stairForColumns.w + 0.2 &&
                column.z >= stairForColumns.z - 0.2 && column.z <= stairForColumns.z + stairForColumns.d + 0.2) {
              colHeight += 2.55;
              yPos += 1.275;
            }
          }
          
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, colHeight, size), material);
          mesh.position.set(column.x, yPos, column.z);
          mesh.castShadow = true;
          this.groups.columns.add(mesh);
        });
      }

      // Use ground floor stair location for all floors to ensure perfect vertical stacking
      const stair = design.roomsByFloor[0]?.find((room) => room.type === 'stair');
      if (stair) this.createStair(stair, baseY, input.floorHeight, concreteMaterial);
    }

    this.groups.roof.clear();
    const roofY = 0.3 + input.floors * input.floorHeight;
    const roofGeometry = new THREE.ExtrudeGeometry(shapeFromPolygon(design.footprint), { depth: 0.16, bevelEnabled: false });
    roofGeometry.rotateX(Math.PI / 2);
    const roof = new THREE.Mesh(roofGeometry, concreteMaterial);
    roof.position.y = roofY;
    roof.castShadow = true;
    this.groups.roof.add(roof);
    design.footprint.forEach((point, index) => {
      this.groups.roof.add(boxBetween(point, design.footprint[(index + 1) % design.footprint.length], 1.05, 0.14, roofY + 0.16, externalMaterial));
    });
    let mumtyY = roofY;
    // Base the roof structure on the ground floor stair core so it aligns visually from the outside
    const stairRoom = design.roomsByFloor[0]?.find((room) => room.type === 'stair');
    if (stairRoom && stairRoom.polygon) {
      const height = 2.4;
      mumtyY = roofY + 0.16 + height;
      
      // Mumty Walls
      for (let i = 0; i < stairRoom.polygon.length; i++) {
        const p1 = stairRoom.polygon[i];
        const p2 = stairRoom.polygon[(i + 1) % stairRoom.polygon.length];
        this.groups.roof.add(boxBetween(p1, p2, height, extThickness, roofY + 0.16, externalMaterial));
      }
      
      // Mumty Roof Slab
      const shape = shapeFromPolygon(stairRoom.polygon.map(p => ({
        x: p.x - stairRoom.center.x, 
        z: p.z - stairRoom.center.z
      })));
      const mumtySlabGeom = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false });
      mumtySlabGeom.rotateX(Math.PI / 2);
      mumtySlabGeom.translate(0, -0.075, 0);
      const mumtySlab = new THREE.Mesh(mumtySlabGeom, concreteMaterial);
      // scale slab slightly to create overhang
      mumtySlab.scale.set(1.1, 1, 1.1);
      mumtySlab.position.set(stairRoom.center.x, mumtyY + 0.075, stairRoom.center.z);
      mumtySlab.castShadow = true;
      this.groups.roof.add(mumtySlab);
    }
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.65, 1.2, 24),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }),
    );
    tank.position.set(stairRoom ? stairRoom.center.x : design.footprintBounds.xMax - 1.4, mumtyY + 0.15 + 0.6, stairRoom ? stairRoom.center.z : design.footprintBounds.zMax - 1.3);
    tank.castShadow = true;
    this.groups.roof.add(tank);
    const solar = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.08, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x1d2d35, metalness: 0.25, roughness: 0.25 }),
    );
    solar.position.set(design.footprintBounds.xMin + 1.8, roofY + 0.28, design.footprintBounds.zMax - 1.2);
    solar.rotation.x = -0.16;
    this.groups.roof.add(solar);
  }

  createOpening(opening, baseY, input, glassMaterial, doorMaterial, frameMaterial) {
    const angle = -Math.atan2(opening.tangent.z, opening.tangent.x);
    const depth = opening.type.includes('door') ? 0.09 : 0.075;
    let material = glassMaterial;
    if (opening.type === 'main-door' || opening.type === 'internal-door' || opening.type === 'service-door') {
      material = doorMaterial;
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(opening.width + 0.12, opening.height + 0.12, depth), frameMaterial);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(opening.width, opening.height, depth + 0.01), material);
    const offset = 0.085;
    const x = opening.point.x + opening.normal.x * offset;
    const z = opening.point.z + opening.normal.z * offset;
    [frame, panel].forEach((mesh) => {
      mesh.position.set(x, baseY + 0.18 + opening.sill + opening.height / 2, z);
      mesh.rotation.y = angle;
      this.groups.openings.add(mesh);
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
      this.groups.openings.add(shade);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(opening.width + 0.28, 0.06, 0.18), frameMaterial);
      sill.position.set(opening.point.x + opening.normal.x * 0.13, baseY + 0.18 + opening.sill - 0.04, opening.point.z + opening.normal.z * 0.13);
      sill.rotation.y = angle;
      this.groups.openings.add(sill);
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
    const halfSteps = Math.ceil((floorHeight / 0.16) / 2);
    const useX = room.w >= room.d;
    const roomLength = useX ? room.w : room.d;
    const roomWidth = useX ? room.d : room.w;
    
    const width = Math.min(roomWidth / 2 - 0.05, 1.2);
    const landingD = Math.max(width, 1.0);
    const flightD = Math.max(roomLength - landingD - 0.2, 1.0);
    const tread = flightD / halfSteps;
    const rise = floorHeight / (halfSteps * 2);
    
    for (let i = 0; i < halfSteps; i += 1) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(useX ? tread : width, rise, useX ? width : tread), material);
      const px = useX ? room.x + 0.1 + tread * (i + 0.5) : room.x + width / 2 + 0.1;
      const pz = useX ? room.z + width / 2 + 0.1 : room.z + 0.1 + tread * (i + 0.5);
      step.position.set(px, baseY + 0.16 + rise * (i + 0.5), pz);
      step.castShadow = true;
      this.groups.stairs.add(step);
    }
    
    const landing = new THREE.Mesh(new THREE.BoxGeometry(useX ? landingD : width * 2 + 0.1, rise, useX ? width * 2 + 0.1 : landingD), material);
    const lx = useX ? room.x + 0.1 + flightD + landingD / 2 - tread / 2 : room.x + width + 0.15;
    const lz = useX ? room.z + width + 0.15 : room.z + 0.1 + flightD + landingD / 2 - tread / 2;
    landing.position.set(lx, baseY + 0.16 + rise * halfSteps, lz);
    landing.castShadow = true;
    this.groups.stairs.add(landing);
    
    for (let i = 0; i < halfSteps; i += 1) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(useX ? tread : width, rise, useX ? width : tread), material);
      const px = useX ? room.x + 0.1 + flightD - tread * (i + 0.5) : room.x + width * 1.5 + 0.2;
      const pz = useX ? room.z + width * 1.5 + 0.2 : room.z + 0.1 + flightD - tread * (i + 0.5);
      step.position.set(px, baseY + 0.16 + floorHeight / 2 + rise * (i + 0.5), pz);
      step.castShadow = true;
      this.groups.stairs.add(step);
    }
  }

  setLayerVisibility(layer, visible) {
    if (this.groups[layer]) {
      this.groups[layer].visible = visible;
    }
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
      Object.values(this.groups).forEach((group) => {
        group.traverse((object) => {
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
