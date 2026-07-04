const ROOM_LIBRARY = {
  entry: { label: 'Entrance foyer', weight: 8, zone: 'front', color: '#c5a66a' },
  living: { label: 'Living room', weight: 26, zone: 'front', color: '#d9b979' },
  dining: { label: 'Dining', weight: 16, zone: 'middle', color: '#b7c7a3' },
  kitchen: { label: 'Kitchen', weight: 15, zone: 'rear', color: '#91b4a6' },
  bedroom: { label: 'Bedroom', weight: 18, zone: 'quiet', color: '#aeb9cd' },
  toilet: { label: 'Toilet', weight: 7, zone: 'service', color: '#77a9b6' },
  stair: { label: 'Stair core', weight: 10, zone: 'core', color: '#9b9e9c' },
  study: { label: 'Study', weight: 12, zone: 'quiet', color: '#b7a8c6' },
  utility: { label: 'Utility', weight: 7, zone: 'service', color: '#8da39c' },
  parking: { label: 'Covered parking', weight: 24, zone: 'front', color: '#7c8582' },
  lounge: { label: 'Family lounge', weight: 17, zone: 'middle', color: '#c8a98d' },
  balcony: { label: 'Balcony', weight: 9, zone: 'front', color: '#789b8d' },
};

const round = (value, places = 2) => Number(value.toFixed(places));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const soilFactors = { soft: 1.35, medium: 1, rocky: 0.78, expansive: 1.45 };
const seismicFactors = { II: 0.1, III: 0.16, IV: 0.24, V: 0.36 };

export function polygonArea(points) {
  let area = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    area += point.x * next.z - next.x * point.z;
  });
  return Math.abs(area) / 2;
}

export function polygonPerimeter(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + Math.hypot(next.x - point.x, next.z - point.z);
  }, 0);
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects = ((a.z > point.z) !== (b.z > point.z))
      && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function boundsOf(points) {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), zMin: Math.min(...zs), zMax: Math.max(...zs) };
}

function createPlotPolygon(input) {
  const x0 = -input.plotWidth / 2;
  const x1 = input.plotWidth / 2;
  const z0 = -input.plotDepth / 2;
  const z1 = input.plotDepth / 2;

  if (input.plotShape === 'l-shape') {
    const cutX = x0 + input.plotWidth * 0.66;
    const cutZ = z0 + input.plotDepth * 0.64;
    return [
      { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: cutZ },
      { x: cutX, z: cutZ }, { x: cutX, z: z1 }, { x: x0, z: z1 },
    ];
  }

  if (input.plotShape === 'chamfer') {
    const cut = Math.min(input.plotWidth, input.plotDepth) * 0.22;
    return [
      { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 - cut },
      { x: x1 - cut, z: z1 }, { x: x0, z: z1 },
    ];
  }

  return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
}

function buildableBounds(input) {
  let xMin = -input.plotWidth / 2;
  let xMax = input.plotWidth / 2;
  let zMin = -input.plotDepth / 2;
  let zMax = input.plotDepth / 2;

  if (input.roadSide === 'south') {
    zMin += input.frontSetback; zMax -= input.rearSetback;
    xMin += input.leftSetback; xMax -= input.rightSetback;
  } else if (input.roadSide === 'north') {
    zMax -= input.frontSetback; zMin += input.rearSetback;
    xMin += input.rightSetback; xMax -= input.leftSetback;
  } else if (input.roadSide === 'east') {
    xMax -= input.frontSetback; xMin += input.rearSetback;
    zMin += input.leftSetback; zMax -= input.rightSetback;
  } else {
    xMin += input.frontSetback; xMax -= input.rearSetback;
    zMax -= input.leftSetback; zMin += input.rightSetback;
  }

  return { xMin, xMax, zMin, zMax };
}

function footprintFromEnvelope(input, bounds, plotArea) {
  const { xMin, xMax, zMin, zMax } = bounds;
  const width = xMax - xMin;
  const depth = zMax - zMin;
  let polygon;

  if (input.plotShape === 'l-shape') {
    const cutX = xMin + width * 0.67;
    const cutZ = zMin + depth * 0.62;
    polygon = [
      { x: xMin, z: zMin }, { x: xMax, z: zMin }, { x: xMax, z: cutZ },
      { x: cutX, z: cutZ }, { x: cutX, z: zMax }, { x: xMin, z: zMax },
    ];
  } else if (input.plotShape === 'chamfer') {
    const cut = Math.min(width, depth) * 0.18;
    polygon = [
      { x: xMin, z: zMin }, { x: xMax, z: zMin }, { x: xMax, z: zMax - cut },
      { x: xMax - cut, z: zMax }, { x: xMin, z: zMax },
    ];
  } else {
    polygon = [{ x: xMin, z: zMin }, { x: xMax, z: zMin }, { x: xMax, z: zMax }, { x: xMin, z: zMax }];
  }

  const allowedArea = plotArea * (input.maxCoverage / 100) * 0.94;
  const currentArea = polygonArea(polygon);
  if (currentArea <= allowedArea) return polygon;

  const scale = Math.sqrt(allowedArea / currentArea);
  const center = { x: (xMin + xMax) / 2, z: (zMin + zMax) / 2 };
  return polygon.map((point) => ({
    x: center.x + (point.x - center.x) * scale,
    z: center.z + (point.z - center.z) * scale,
  }));
}

function footprintZones(shape, polygon) {
  const bounds = boundsOf(polygon);
  const width = bounds.xMax - bounds.xMin;
  const depth = bounds.zMax - bounds.zMin;
  if (shape === 'l-shape') {
    const splitX = bounds.xMin + width * 0.67;
    const splitZ = bounds.zMin + depth * 0.62;
    return [
      { x: bounds.xMin, z: bounds.zMin, w: splitX - bounds.xMin, d: depth },
      { x: splitX, z: bounds.zMin, w: bounds.xMax - splitX, d: splitZ - bounds.zMin },
    ];
  }
  if (shape === 'chamfer') {
    const splitZ = bounds.zMin + depth * 0.76;
    const upperWidth = width * 0.78;
    return [
      { x: bounds.xMin, z: bounds.zMin, w: width, d: splitZ - bounds.zMin },
      { x: bounds.xMin, z: splitZ, w: upperWidth, d: bounds.zMax - splitZ },
    ];
  }
  return [{ x: bounds.xMin, z: bounds.zMin, w: width, d: depth }];
}

function makeRoom(type, sequence = 1) {
  const library = ROOM_LIBRARY[type];
  const numbered = ['bedroom', 'toilet'].includes(type);
  return { ...library, type, name: numbered ? `${library.label} ${sequence}` : library.label };
}

function distributeProgramme(input) {
  const floors = Array.from({ length: input.floors }, () => []);
  const ground = floors[0];
  ground.push(makeRoom('entry'), makeRoom('living'), makeRoom('dining'), makeRoom('kitchen'), makeRoom('stair'));
  if (input.parking > 0) ground.push(makeRoom('parking'));
  if (input.study) ground.push(makeRoom('study'));
  if (input.utility) ground.push(makeRoom('utility'));

  const groundBedrooms = input.floors === 1 ? input.bedrooms : Math.min(1, input.bedrooms);
  for (let index = 0; index < groundBedrooms; index += 1) ground.push(makeRoom('bedroom', index + 1));
  ground.push(makeRoom('toilet', 1));

  let bedroomNumber = groundBedrooms + 1;
  let toiletNumber = 2;
  for (let floor = 1; floor < input.floors; floor += 1) {
    floors[floor].push(makeRoom('stair'), makeRoom('lounge'), makeRoom('balcony'));
    const remainingBedrooms = input.bedrooms - bedroomNumber + 1;
    const remainingFloors = input.floors - floor;
    const onThisFloor = Math.max(0, Math.ceil(remainingBedrooms / remainingFloors));
    for (let index = 0; index < onThisFloor; index += 1) floors[floor].push(makeRoom('bedroom', bedroomNumber++));
    const remainingToilets = input.toilets - toiletNumber + 1;
    const toiletsHere = Math.max(0, Math.ceil(remainingToilets / remainingFloors));
    for (let index = 0; index < toiletsHere; index += 1) floors[floor].push(makeRoom('toilet', toiletNumber++));
  }

  while (toiletNumber <= input.toilets) ground.push(makeRoom('toilet', toiletNumber++));
  return floors;
}

function splitRectangle(rect, rooms, output = []) {
  if (rooms.length === 0) return output;
  if (rooms.length === 1) {
    output.push({ ...rooms[0], ...rect });
    return output;
  }

  const total = rooms.reduce((sum, room) => sum + room.weight, 0);
  let running = 0;
  let splitIndex = 1;
  let bestDifference = Infinity;
  rooms.slice(0, -1).forEach((room, index) => {
    running += room.weight;
    const difference = Math.abs(total / 2 - running);
    if (difference < bestDifference) { bestDifference = difference; splitIndex = index + 1; }
  });

  const first = rooms.slice(0, splitIndex);
  const second = rooms.slice(splitIndex);
  const firstWeight = first.reduce((sum, room) => sum + room.weight, 0);
  const ratio = clamp(firstWeight / total, 0.25, 0.75);

  if (rect.w >= rect.d) {
    const firstWidth = rect.w * ratio;
    splitRectangle({ ...rect, w: firstWidth }, first, output);
    splitRectangle({ ...rect, x: rect.x + firstWidth, w: rect.w - firstWidth }, second, output);
  } else {
    const firstDepth = rect.d * ratio;
    splitRectangle({ ...rect, d: firstDepth }, first, output);
    splitRectangle({ ...rect, z: rect.z + firstDepth, d: rect.d - firstDepth }, second, output);
  }
  return output;
}

function layoutRooms(programme, zones, floor) {
  const totalZoneArea = zones.reduce((sum, zone) => sum + zone.w * zone.d, 0);
  const remaining = [...programme];
  const rooms = [];
  zones.forEach((zone, zoneIndex) => {
    const last = zoneIndex === zones.length - 1;
    const targetCount = last
      ? remaining.length
      : Math.max(1, Math.round(programme.length * ((zone.w * zone.d) / totalZoneArea)));
    const allocated = remaining.splice(0, Math.min(targetCount, remaining.length));
    splitRectangle(zone, allocated, rooms);
  });

  return rooms.map((room, index) => ({
    ...room,
    id: `F${floor + 1}-R${String(index + 1).padStart(2, '0')}`,
    floor,
    area: room.w * room.d,
    center: { x: room.x + room.w / 2, z: room.z + room.d / 2 },
  }));
}

function axisPositions(min, max, targetSpan) {
  const count = Math.max(2, Math.ceil((max - min) / targetSpan) + 1);
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function createGrid(input, footprint) {
  const bounds = boundsOf(footprint);
  const xs = axisPositions(bounds.xMin, bounds.xMax, input.gridSpan);
  const zs = axisPositions(bounds.zMin, bounds.zMax, input.gridSpan);
  const columns = [];
  xs.forEach((x) => zs.forEach((z) => {
    const insetPoint = { x: clamp(x, bounds.xMin + 0.02, bounds.xMax - 0.02), z: clamp(z, bounds.zMin + 0.02, bounds.zMax - 0.02) };
    if (pointInPolygon(insetPoint, footprint)) columns.push({ x, z });
  }));
  return {
    xs, zs, columns,
    maxSpanX: xs.length > 1 ? xs[1] - xs[0] : 0,
    maxSpanZ: zs.length > 1 ? zs[1] - zs[0] : 0,
  };
}

function createChecks(input, requestedInput, metrics, rooms, grid, adjustments) {
  const minimumRoomDimension = Math.min(...rooms.filter((room) => !['toilet', 'utility', 'balcony'].includes(room.type)).map((room) => Math.min(room.w, room.d)));
  const checks = [
    { label: 'Ground coverage', value: `${metrics.coverage}% / ${input.maxCoverage}%`, status: metrics.coverage <= input.maxCoverage ? 'pass' : 'fail', note: 'Compared with the project development-control input.' },
    { label: 'Floor area ratio', value: `${metrics.far} / ${input.maxFar}`, status: metrics.far <= input.maxFar ? 'pass' : 'fail', note: 'Concept gross floor area divided by recorded plot area.' },
    { label: 'Overall height', value: `${metrics.height} m / ${input.maxHeight} m`, status: metrics.height <= input.maxHeight ? 'pass' : 'fail', note: 'Parapet and service structures require separate local verification.' },
    { label: 'Primary grid span', value: `${round(Math.max(grid.maxSpanX, grid.maxSpanZ))} m`, status: Math.max(grid.maxSpanX, grid.maxSpanZ) <= input.gridSpan * 1.1 ? 'pass' : 'warn', note: 'Geometric coordination check only; no member analysis performed.' },
    { label: 'Usable room width', value: `${round(minimumRoomDimension)} m minimum`, status: minimumRoomDimension >= 2.4 ? 'pass' : 'warn', note: 'Confirm room-specific minimums under the applicable local rules.' },
    { label: 'Authority inputs', value: input.authorityVerified ? 'Recorded as verified' : 'Unverified defaults', status: input.authorityVerified ? 'pass' : 'warn', note: 'Setbacks, FAR, coverage and height must come from the approving authority.' },
    { label: 'Fire access', value: `${input.fireAccessWidth} m recorded`, status: input.fireAccessWidth >= 6 ? 'pass' : 'warn', note: 'Approach road and appliance access require local fire authority confirmation.' },
    { label: 'Exit stair width', value: `${input.stairWidth} m`, status: input.stairWidth >= 1.2 ? 'pass' : 'warn', note: 'Occupancy, travel distance and fire strategy may require wider or additional stairs.' },
    { label: 'Drainage slope', value: `${input.siteSlope}% site slope`, status: input.siteSlope <= 8 ? 'pass' : 'warn', note: 'Higher slopes require contour-led grading, retaining walls and erosion control.' },
    { label: 'Ground water', value: `${input.waterTable} m below GL`, status: input.waterTable >= 2.5 ? 'pass' : 'warn', note: 'Shallow water table affects excavation, waterproofing and foundation selection.' },
    { label: 'Structural safety', value: 'Analysis required', status: 'mandatory', note: `Design loads, ${input.seismicZone === 'V' ? 'high seismic demand, ' : ''}member sizing, ductile detailing and foundation design are outside concept generation.` },
    { label: 'Geotechnical basis', value: `${input.sbc} kN/m² assumed`, status: 'mandatory', note: 'Replace the assumed SBC with a site investigation and foundation recommendation.' },
  ];
  if (adjustments.length) {
    checks.splice(3, 0, {
      label: 'Storey resolution',
      value: `${requestedInput.floors} requested → ${input.floors} generated`,
      status: 'warn',
      note: adjustments[0].reason,
    });
  }
  return checks;
}

function createStructuralAnalysis(input, footprint, grid, roomsByFloor) {
  const floorArea = polygonArea(footprint);
  const slabDead = (input.slabThickness / 1000) * 25;
  const finishLoad = 1.0;
  const wallLoad = (input.externalWall / 1000) * 20 * Math.min(input.floorHeight, 3.4) * 0.22;
  const serviceLoad = input.occupants > 12 ? 0.45 : 0.25;
  const gravityLoad = slabDead + finishLoad + input.liveLoad + wallLoad + serviceLoad;
  const totalGravity = floorArea * input.floors * gravityLoad;
  const seismicBaseShear = totalGravity * (seismicFactors[input.seismicZone] || 0.16) * soilFactors[input.soilClass || 'medium'];
  const columnTributary = totalGravity / Math.max(grid.columns.length, 1);
  const span = Math.max(grid.maxSpanX, grid.maxSpanZ);
  const momentDemand = (gravityLoad * span * span) / 8;
  const foundationPressure = columnTributary / Math.max((input.columnSize / 1000 + 1.1) ** 2, 1);
  const utilization = clamp(foundationPressure / Math.max(input.sbc, 1), 0, 2.4);
  const hotspots = grid.columns.map((column) => {
    const edgeFactor = (Math.abs(column.x - grid.xs[0]) < 0.05 || Math.abs(column.x - grid.xs.at(-1)) < 0.05 || Math.abs(column.z - grid.zs[0]) < 0.05 || Math.abs(column.z - grid.zs.at(-1)) < 0.05) ? 0.82 : 1.16;
    const stairRoom = roomsByFloor.flat().find((room) => room.type === 'stair');
    const coreFactor = stairRoom && Math.hypot(column.x - stairRoom.center.x, column.z - stairRoom.center.z) < span * 0.85 ? 1.18 : 1;
    const demand = clamp((utilization * edgeFactor * coreFactor) / 1.35, 0.15, 1);
    return { ...column, demand: round(demand, 2), axialLoad: round(columnTributary * edgeFactor * coreFactor, 1) };
  });
  const components = [
    { type: 'slab', label: 'Slab system', demand: round(clamp(span / 5.2 + input.liveLoad / 8, 0.2, 1), 2), note: `${input.slabThickness} mm ${input.concreteGrade} slab, conceptual two-way panel action.` },
    { type: 'beam', label: 'Beam grid', demand: round(clamp(momentDemand / 55, 0.2, 1), 2), note: `${input.beamDepth} mm nominal beam depth; bending moment proxy ${round(momentDemand, 1)} kNm/m.` },
    { type: 'column', label: 'Column line', demand: round(clamp(utilization, 0.2, 1), 2), note: `${input.columnSize} mm columns; peak conceptual axial load ${round(Math.max(...hotspots.map((h) => h.axialLoad)), 0)} kN.` },
    { type: 'stair', label: 'Stair core', demand: round(input.stairWidth < 1.2 ? 0.78 : 0.48, 2), note: `${input.stairWidth} m clear stair basis; check waist slab, landing beam and fire egress.` },
    { type: 'wall', label: 'Wall/envelope', demand: round(clamp(input.windowRatio / 70 + input.externalWall / 900, 0.2, 1), 2), note: `${input.externalWall} mm external wall, ${input.windowRatio}% window-wall ratio.` },
  ];
  return {
    gravityLoad: round(gravityLoad, 2),
    totalGravity: round(totalGravity, 0),
    seismicBaseShear: round(seismicBaseShear, 0),
    foundationPressure: round(foundationPressure, 1),
    utilization: round(utilization, 2),
    hotspots,
    components,
    disclaimer: 'X-ray is a conceptual load-path visualization, not FEM/ETABS/STAAD certified analysis.',
  };
}

function createCostModel(input, quantities, metrics) {
  const cementBags = quantities.concrete * 6.4;
  const concreteCost = cementBags * input.cementRate * 2.85;
  const steelCost = quantities.reinforcement * input.steelRate;
  const masonryCost = quantities.masonry * input.masonryRate;
  const envelopeCost = metrics.builtUpArea * (input.windowRatio / 100) * 2800;
  const servicesCost = metrics.builtUpArea * (input.occupants > 10 ? 2400 : 1900);
  const subtotal = (concreteCost + steelCost + masonryCost + envelopeCost + servicesCost) * input.locationCostIndex;
  return {
    concreteCost: round(concreteCost, 0),
    steelCost: round(steelCost, 0),
    masonryCost: round(masonryCost, 0),
    envelopeCost: round(envelopeCost, 0),
    servicesCost: round(servicesCost, 0),
    total: round(subtotal, 0),
    costPerSqm: round(subtotal / Math.max(metrics.builtUpArea, 1), 0),
    note: 'Rates are editable project inputs. Connect a supplier/material API later for true live procurement pricing.',
  };
}

function createSpecificationRegister(input) {
  const foundation = input.soilClass === 'soft' || input.soilClass === 'expansive' ? 'raft / pile study required' : input.sbc < 120 ? 'combined footing study' : 'isolated footing concept';
  return [
    { category: 'Survey', item: 'Total station coordinates, contour map, utility trace, adjoining structure record', status: input.contourInterval <= 0.5 ? 'detailed' : 'needs denser levels' },
    { category: 'Geotech', item: `${input.soilClass} soil, ${input.sbc} kN/m2 SBC, ${input.waterTable} m water table`, status: foundation },
    { category: 'Structure', item: `${input.structuralSystem}, ${input.concreteGrade} concrete, ${input.steelGrade} reinforcement`, status: 'concept basis only' },
    { category: 'Envelope', item: `${input.facadeSystem}, ${input.windowRatio}% WWR, ${input.externalWall} mm external wall`, status: 'energy/daylight review' },
    { category: 'Fire/life safety', item: `${input.fireAccessWidth} m access, ${input.stairWidth} m stair, occupancy ${input.occupants}`, status: 'authority verification' },
    { category: 'Water', item: `${input.rainIntensity} mm/hr rainfall basis, ${input.softscape}% softscape`, status: 'stormwater sizing required' },
    { category: 'Market', item: `Location index ${input.locationCostIndex}, cement ${input.cementRate}/bag, steel ${input.steelRate}/kg`, status: 'editable market watch' },
  ];
}

function createDecisions(input, requestedInput, footprint, roomsByFloor, grid, adjustments) {
  const shapeText = input.plotShape === 'rectangle' ? 'orthogonal' : input.plotShape === 'l-shape' ? 'two-wing L-shaped' : 'chamfer-responsive';
  const serviceRooms = roomsByFloor.flat().filter((room) => ['kitchen', 'toilet', 'utility'].includes(room.type)).length;
  const decisions = [
    { title: 'Buildable envelope', category: 'PLANNING', text: `The ${shapeText} footprint is contained inside the four recorded setback planes and remains below the entered coverage ceiling.` },
    { title: 'Frontage response', category: 'ACCESS', text: `The principal approach and public rooms are organized from the ${input.roadSide} road edge to make arrival legible and preserve quieter rooms deeper in the plan.` },
    { title: 'Structural regularity', category: 'STRUCTURE', text: `${grid.columns.length} conceptual column positions follow a near-${input.gridSpan} m planning grid. Vertical continuity is retained across ${input.floors} storey${input.floors > 1 ? 's' : ''}.` },
    { title: 'Wet-service coordination', category: 'SERVICES', text: `${serviceRooms} wet or service spaces are identified as a coordination group so future plumbing stacks can be consolidated during detailed design.` },
    { title: 'Climate strategy', category: 'ENVIRONMENT', text: `${input.climate.replace('-', ' ')} assumptions drive shaded openings, cross-ventilation intent and the selected ${input.style.replaceAll('-', ' ')} massing language.` },
    { title: 'Geotechnical and drainage basis', category: 'SITE', text: `${input.soilClass} soil, ${input.sbc} kN/m² assumed SBC, ${input.waterTable} m water table and ${input.siteSlope}% slope are used to flag foundation and grading risk.` },
    { title: 'Market intelligence placeholder', category: 'COST', text: `Material rates and the ${input.locationCostIndex} location index drive a live-editable cost model. True supplier availability requires a procurement data connection.` },
    { title: 'Future-proofing', category: 'LIFECYCLE', text: input.futureExpansion ? 'The regular primary grid and stacked stair core preserve a rational path for later adaptation, subject to structural design.' : 'The proposal is optimized for the current programme without reserving an expansion zone.' },
  ];
  if (adjustments.length) {
    decisions.unshift({
      title: 'Regulatory storey resolution',
      category: 'COMPLIANCE',
      text: `${requestedInput.floors} storeys were requested. The generated scheme uses ${input.floors} because the entered FAR and height controls permit no more than ${input.floors} at this footprint area.`,
    });
  }
  return decisions;
}

function createQuantities(input, footprint, grid, roomsByFloor) {
  const floorArea = polygonArea(footprint);
  const externalWallVolume = polygonPerimeter(footprint) * input.floorHeight * (input.externalWall / 1000) * input.floors * 0.82;
  const roomCount = roomsByFloor.reduce((sum, rooms) => sum + rooms.length, 0);
  const partitionLength = roomCount * Math.sqrt(floorArea / Math.max(roomCount, 1)) * 1.35;
  const partitionVolume = partitionLength * input.floorHeight * (input.internalWall / 1000) * 0.86;
  const slabVolume = floorArea * 0.125 * (input.floors + 1);
  const columnVolume = grid.columns.length * 0.3 * 0.3 * input.floorHeight * input.floors;
  const beamVolume = (grid.xs.length * (grid.zs.at(-1) - grid.zs[0]) + grid.zs.length * (grid.xs.at(-1) - grid.xs[0])) * 0.3 * 0.45 * input.floors;
  const concrete = slabVolume + columnVolume + beamVolume;
  return {
    concrete: round(concrete, 1),
    masonry: round(externalWallVolume + partitionVolume, 1),
    reinforcement: round(concrete * 105, 0),
    disclaimer: 'Preliminary geometric quantities only; deductions, laps, waste, finishes and services are excluded.',
  };
}

export function generateDesign(input) {
  const requestedInput = { ...input };
  const plotPolygon = createPlotPolygon(input);
  const plotArea = polygonArea(plotPolygon);
  const envelope = buildableBounds(input);
  if (envelope.xMax - envelope.xMin < 5 || envelope.zMax - envelope.zMin < 5) {
    throw new Error('The recorded setbacks leave less than 5 m of buildable width or depth. Revise the site controls.');
  }

  const footprint = footprintFromEnvelope(input, envelope, plotArea);
  const floorPlateArea = polygonArea(footprint);
  const maxFloorsByFar = Math.max(1, Math.floor((input.maxFar * plotArea + 0.001) / floorPlateArea));
  const maxFloorsByHeight = Math.max(1, Math.floor((input.maxHeight - 1.05 + 0.001) / input.floorHeight));
  const permittedFloors = Math.max(1, Math.min(maxFloorsByFar, maxFloorsByHeight));
  const effectiveFloors = Math.min(input.floors, permittedFloors);
  const adjustments = [];
  if (effectiveFloors < input.floors) {
    adjustments.push({
      type: 'storeys',
      requested: input.floors,
      applied: effectiveFloors,
      reason: `FAR permits ${maxFloorsByFar} storey${maxFloorsByFar === 1 ? '' : 's'} and the entered height permits ${maxFloorsByHeight}; the stricter limit governs.`,
    });
  }
  const resolvedInput = { ...input, floors: effectiveFloors };
  const zones = footprintZones(resolvedInput.plotShape, footprint);
  const programme = distributeProgramme(resolvedInput);
  const roomsByFloor = programme.map((rooms, floor) => layoutRooms(rooms, zones, floor));
  const rooms = roomsByFloor.flat();
  const grid = createGrid(resolvedInput, footprint);
  const builtUpArea = floorPlateArea * resolvedInput.floors;
  const metrics = {
    plotArea: round(plotArea, 1),
    footprintArea: round(floorPlateArea, 1),
    builtUpArea: round(builtUpArea, 1),
    coverage: round((floorPlateArea / plotArea) * 100, 1),
    far: round(builtUpArea / plotArea, 2),
    height: round(resolvedInput.floorHeight * resolvedInput.floors + 1.05, 2),
    requestedFar: round((floorPlateArea * requestedInput.floors) / plotArea, 2),
    requestedHeight: round(requestedInput.floorHeight * requestedInput.floors + 1.05, 2),
  };
  const checks = createChecks(resolvedInput, requestedInput, metrics, rooms, grid, adjustments);
  const quantities = createQuantities(resolvedInput, footprint, grid, roomsByFloor);
  const structural = createStructuralAnalysis(resolvedInput, footprint, grid, roomsByFloor);

  return {
    input: resolvedInput,
    requestedInput,
    adjustments,
    plotPolygon,
    footprint,
    footprintBounds: boundsOf(footprint),
    zones,
    roomsByFloor,
    grid,
    metrics,
    checks,
    decisions: createDecisions(resolvedInput, requestedInput, footprint, roomsByFloor, grid, adjustments),
    quantities,
    structural,
    cost: createCostModel(resolvedInput, quantities, metrics),
    specifications: createSpecificationRegister(resolvedInput),
    generatedAt: new Date(),
  };
}
