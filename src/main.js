import './style.css';
import { generateDesign } from './domain.js';
import { EngineeringScene } from './scene.js';
import { DraftingCanvas } from './drafting.js';

const form = document.querySelector('#engineering-form');
const scene = new EngineeringScene(document.querySelector('#model-canvas'));
const drafting = new DraftingCanvas(document.querySelector('#plan-canvas'));
const statusText = document.querySelector('#project-status');
const viewport = document.querySelector('.viewport-shell');
const analysisPanel = document.querySelector('#analysis-panel');
const analysisContent = document.querySelector('#analysis-content');
const previousButton = document.querySelector('#previous-step');
const nextButton = document.querySelector('#next-step');
const generateButton = document.querySelector('#generate-design');
const planLevelSelect = document.querySelector('#plan-level');
const constraintBanner = document.querySelector('#constraint-banner');
const componentFocus = document.querySelector('#component-focus');
const roofButton = document.querySelector('#toggle-roof');

let currentStep = 0;
let currentMode = '3d';
let currentAnalysis = 'decisions';
let currentPlanFloor = 0;
let design = null;

function numberValue(data, name) {
  return Number(data.get(name));
}

function readEngineeringInput() {
  const data = new FormData(form);
  return {
    projectName: data.get('projectName').trim(),
    location: data.get('location').trim(),
    plotShape: data.get('plotShape'),
    roadSide: data.get('roadSide'),
    plotWidth: numberValue(data, 'plotWidth'),
    plotDepth: numberValue(data, 'plotDepth'),
    roadWidth: numberValue(data, 'roadWidth'),
    northRotation: numberValue(data, 'northRotation'),
    contourInterval: numberValue(data, 'contourInterval'),
    siteSlope: numberValue(data, 'siteSlope'),
    waterTable: numberValue(data, 'waterTable'),
    soilClass: data.get('soilClass'),
    frontSetback: numberValue(data, 'frontSetback'),
    rearSetback: numberValue(data, 'rearSetback'),
    leftSetback: numberValue(data, 'leftSetback'),
    rightSetback: numberValue(data, 'rightSetback'),
    maxCoverage: numberValue(data, 'maxCoverage'),
    maxFar: numberValue(data, 'maxFar'),
    floors: numberValue(data, 'floors'),
    maxHeight: numberValue(data, 'maxHeight'),
    fireAccessWidth: numberValue(data, 'fireAccessWidth'),
    stairWidth: numberValue(data, 'stairWidth'),
    softscape: numberValue(data, 'softscape'),
    rainIntensity: numberValue(data, 'rainIntensity'),
    authorityVerified: data.has('authorityVerified'),
    bedrooms: numberValue(data, 'bedrooms'),
    toilets: numberValue(data, 'toilets'),
    occupants: numberValue(data, 'occupants'),
    parking: numberValue(data, 'parking'),
    style: data.get('style'),
    climate: data.get('climate'),
    facadeSystem: data.get('facadeSystem'),
    windowRatio: numberValue(data, 'windowRatio'),
    study: data.has('study'),
    utility: data.has('utility'),
    accessible: data.has('accessible'),
    futureExpansion: data.has('futureExpansion'),
    structuralSystem: data.get('structuralSystem'),
    floorHeight: numberValue(data, 'floorHeight'),
    gridSpan: numberValue(data, 'gridSpan'),
    externalWall: numberValue(data, 'externalWall'),
    internalWall: numberValue(data, 'internalWall'),
    sbc: numberValue(data, 'sbc'),
    seismicZone: data.get('seismicZone'),
    concreteGrade: data.get('concreteGrade'),
    steelGrade: data.get('steelGrade'),
    liveLoad: numberValue(data, 'liveLoad'),
    slabThickness: numberValue(data, 'slabThickness'),
    beamDepth: numberValue(data, 'beamDepth'),
    columnSize: numberValue(data, 'columnSize'),
    cementRate: numberValue(data, 'cementRate'),
    steelRate: numberValue(data, 'steelRate'),
    masonryRate: numberValue(data, 'masonryRate'),
    locationCostIndex: numberValue(data, 'locationCostIndex'),
  };
}

function setStep(step) {
  currentStep = Math.max(0, Math.min(3, step));
  document.querySelectorAll('.form-step').forEach((element) => element.classList.toggle('active', Number(element.dataset.step) === currentStep));
  document.querySelectorAll('.step-tab').forEach((element) => {
    const index = Number(element.dataset.step);
    element.classList.toggle('active', index === currentStep);
    element.classList.toggle('complete', index < currentStep);
  });
  previousButton.disabled = currentStep === 0;
  nextButton.hidden = currentStep === 3;
  generateButton.classList.toggle('visible', currentStep === 3);
  document.querySelector('.input-panel').scrollTo({ top: 0, behavior: 'auto' });
}

function validateCurrentStep() {
  const fields = [...document.querySelector(`.form-step[data-step="${currentStep}"]`).querySelectorAll('input, select')];
  const invalid = fields.find((field) => !field.checkValidity());
  if (invalid) { invalid.reportValidity(); return false; }
  return true;
}

function setMode(mode) {
  currentMode = mode;
  viewport.dataset.mode = mode;
  document.querySelectorAll('.mode-btn').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  if (mode === 'plan' && design) requestAnimationFrame(() => drafting.render(design, currentPlanFloor));
  if (mode === 'plan' && currentAnalysis === 'xray') {
    currentAnalysis = 'schedule';
    document.querySelectorAll('[data-analysis]').forEach((item) => item.classList.toggle('active', item.dataset.analysis === currentAnalysis));
    renderAnalysis();
  }
  if (mode === 'xray' && design) {
    scene.setXray(true, componentFocus.value);
    currentAnalysis = 'xray';
    document.querySelectorAll('[data-analysis]').forEach((item) => item.classList.toggle('active', item.dataset.analysis === 'xray'));
    renderAnalysis();
  } else if (design) {
    scene.setXray(false, componentFocus.value);
  }
}

function updateMetrics() {
  const failing = design.checks.filter((check) => check.status === 'fail').length;
  document.querySelector('#metric-coverage').textContent = `${design.metrics.coverage.toFixed(1)}%`;
  document.querySelector('#metric-far').textContent = design.metrics.far.toFixed(2);
  document.querySelector('#metric-area').textContent = `${design.metrics.builtUpArea.toFixed(1)} m²`;
  document.querySelector('#metric-status').textContent = failing ? `${failing} FAILED` : design.adjustments.length ? 'ADJUSTED' : 'PRELIMINARY';
  document.querySelector('#metric-status').classList.toggle('danger', failing > 0);
}

function updateConstraintResolution() {
  const adjustment = design.adjustments[0];
  constraintBanner.hidden = !adjustment;
  if (!adjustment) return;
  document.querySelector('#constraint-message').textContent = `${adjustment.requested} storeys requested; ${adjustment.applied} generated. ${adjustment.reason}`;
}

function updatePlanLevels() {
  currentPlanFloor = Math.min(currentPlanFloor, design.roomsByFloor.length - 1);
  planLevelSelect.innerHTML = design.roomsByFloor.map((_, floor) => {
    const label = floor === 0 ? 'GROUND FLOOR' : `LEVEL ${String(floor + 1).padStart(2, '0')}`;
    return `<option value="${floor}">${label}</option>`;
  }).join('');
  planLevelSelect.value = String(currentPlanFloor);
}

function statusBadge(status) {
  const labels = { pass: 'PASS', warn: 'REVIEW', fail: 'FAIL', mandatory: 'REQUIRED' };
  return `<span class="check-status ${status}">${labels[status]}</span>`;
}

function renderAnalysis() {
  if (!design) return;
  if (currentAnalysis === 'decisions') {
    analysisContent.innerHTML = `
      <div class="analysis-list">
        ${design.decisions.map((decision, index) => `
          <article class="decision-card">
            <div class="decision-index">${String(index + 1).padStart(2, '0')}</div>
            <div><span>${decision.category}</span><h3>${decision.title}</h3><p>${decision.text}</p></div>
          </article>
        `).join('')}
        <article class="quantity-card">
          <span>PRELIMINARY GEOMETRIC QUANTITIES</span>
          <div><strong>${design.quantities.concrete}</strong><small>m³ concrete</small></div>
          <div><strong>${design.quantities.masonry}</strong><small>m³ masonry</small></div>
          <div><strong>${design.quantities.reinforcement}</strong><small>kg indicative steel</small></div>
          <p>${design.quantities.disclaimer}</p>
        </article>
      </div>`;
  } else if (currentAnalysis === 'checks') {
    analysisContent.innerHTML = `
      <div class="checks-list">
        ${design.checks.map((check) => `
          <article class="check-card">
            <div>${statusBadge(check.status)}<h3>${check.label}</h3></div>
            <strong>${check.value}</strong>
            <p>${check.note}</p>
          </article>
        `).join('')}
      </div>`;
  } else if (currentAnalysis === 'xray') {
    analysisContent.innerHTML = `
      <div class="analysis-list">
        <article class="quantity-card xray-card">
          <span>CONCEPTUAL STRUCTURAL X-RAY</span>
          <div><strong>${design.structural.gravityLoad}</strong><small>kN/m² service gravity load</small></div>
          <div><strong>${design.structural.seismicBaseShear}</strong><small>kN seismic base shear proxy</small></div>
          <div><strong>${design.structural.foundationPressure}</strong><small>kN/m² footing pressure proxy</small></div>
          <p>${design.structural.disclaimer}</p>
        </article>
        ${design.structural.components.map((component) => `
          <article class="check-card component-card">
            <div><span class="demand-chip" style="--demand:${component.demand}">${Math.round(component.demand * 100)}%</span><h3>${component.label}</h3></div>
            <strong>${component.type.toUpperCase()} ANALYSIS LAYER</strong>
            <p>${component.note}</p>
          </article>
        `).join('')}
      </div>`;
  } else if (currentAnalysis === 'cost') {
    analysisContent.innerHTML = `
      <div class="analysis-list">
        <article class="quantity-card">
          <span>LOCATION MATERIAL COST MODEL</span>
          <div><strong>₹${design.cost.total.toLocaleString('en-IN')}</strong><small>concept package</small></div>
          <div><strong>₹${design.cost.costPerSqm.toLocaleString('en-IN')}</strong><small>per m² built-up</small></div>
          <div><strong>${design.input.locationCostIndex}</strong><small>location index</small></div>
          <p>${design.cost.note}</p>
        </article>
        ${[
          ['Concrete package', design.cost.concreteCost],
          ['Reinforcement steel', design.cost.steelCost],
          ['Masonry/blockwork', design.cost.masonryCost],
          ['Facade/openings', design.cost.envelopeCost],
          ['MEP/services allowance', design.cost.servicesCost],
        ].map(([label, value]) => `<article class="check-card"><div><h3>${label}</h3></div><strong>₹${value.toLocaleString('en-IN')}</strong><p>Calculated from generated quantities and editable local market rates.</p></article>`).join('')}
      </div>`;
  } else if (currentAnalysis === 'spec') {
    analysisContent.innerHTML = `
      <div class="checks-list">
        ${design.specifications.map((item) => `
          <article class="check-card">
            <div><span class="check-status mandatory">${item.category}</span><h3>${item.status}</h3></div>
            <strong>${item.item}</strong>
            <p>Required project information for professional design coordination and later approvals.</p>
          </article>
        `).join('')}
      </div>`;
  } else {
    analysisContent.innerHTML = design.roomsByFloor.map((rooms, floor) => `
      <section class="room-floor">
        <h3>LEVEL ${String(floor + 1).padStart(2, '0')} <span>${rooms.reduce((sum, room) => sum + room.area, 0).toFixed(1)} m² allocated</span></h3>
        <div class="room-table">
          ${rooms.map((room) => `<div><span>${room.id}</span><strong>${room.name}</strong><em>${room.w.toFixed(2)} × ${room.d.toFixed(2)} m</em><b>${room.area.toFixed(1)} m²</b></div>`).join('')}
        </div>
      </section>
    `).join('');
  }
}

function generate() {
  try {
    statusText.textContent = 'Generating coordinated concept…';
    design = generateDesign(readEngineeringInput());
    scene.renderDesign(design);
    scene.setXray(false, componentFocus.value);
    roofButton.textContent = `ROOF: ${scene.roofVisible ? 'ON' : 'OFF'}`;
    currentPlanFloor = 0;
    updatePlanLevels();
    drafting.render(design, currentPlanFloor);
    updateMetrics();
    updateConstraintResolution();
    currentAnalysis = design.adjustments.length ? 'checks' : 'decisions';
    document.querySelectorAll('[data-analysis]').forEach((item) => item.classList.toggle('active', item.dataset.analysis === currentAnalysis));
    renderAnalysis();
    viewport.classList.add('has-design');
    document.querySelector('#decision-count').textContent = design.decisions.length;
    statusText.textContent = design.adjustments.length
      ? `${design.input.projectName} / adjusted to ${design.input.floors} compliant storeys`
      : `${design.input.projectName} / Revision P01 generated`;
    document.querySelector('#viewport-empty').hidden = true;
    setMode('3d');
    analysisPanel.classList.add('open');
    document.querySelector('#open-analysis').classList.add('panel-open');
  } catch (error) {
    statusText.textContent = error.message;
    viewport.classList.add('generation-error');
    window.setTimeout(() => viewport.classList.remove('generation-error'), 1000);
  }
}

nextButton.addEventListener('click', () => {
  if (validateCurrentStep()) setStep(currentStep + 1);
});
previousButton.addEventListener('click', () => setStep(currentStep - 1));
document.querySelectorAll('.step-tab').forEach((button) => button.addEventListener('click', () => {
  const target = Number(button.dataset.step);
  if (target <= currentStep || validateCurrentStep()) setStep(target);
}));

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (form.reportValidity()) generate();
});

document.querySelectorAll('.mode-btn').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-view]').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  scene.setView(button.dataset.view);
}));

roofButton.addEventListener('click', (event) => {
  const visible = scene.toggleRoof();
  event.currentTarget.textContent = `ROOF: ${visible ? 'ON' : 'OFF'}`;
});
document.querySelector('#toggle-xray').addEventListener('click', (event) => {
  if (!design) return;
  setMode(currentMode === 'xray' ? '3d' : 'xray');
  event.currentTarget.textContent = `XRAY: ${currentMode === 'xray' ? componentFocus.value.toUpperCase() : 'LOAD'}`;
});
componentFocus.addEventListener('change', () => {
  if (!design) return;
  scene.setXray(currentMode === 'xray', componentFocus.value);
  if (currentMode !== 'xray') setMode('xray');
  document.querySelector('#toggle-xray').textContent = `XRAY: ${componentFocus.value.toUpperCase()}`;
});
document.querySelector('#download-plan').addEventListener('click', () => {
  if (!design) return;
  drafting.render(design, currentPlanFloor);
  drafting.download(`${design.input.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-level-${currentPlanFloor + 1}-concept-plan.png`);
});
planLevelSelect.addEventListener('change', () => {
  currentPlanFloor = Number(planLevelSelect.value);
  if (design) drafting.render(design, currentPlanFloor);
});

document.querySelector('#open-constraint-checks').addEventListener('click', () => {
  currentAnalysis = 'checks';
  document.querySelectorAll('[data-analysis]').forEach((item) => item.classList.toggle('active', item.dataset.analysis === 'checks'));
  renderAnalysis();
  analysisPanel.classList.add('open');
  document.querySelector('#open-analysis').classList.add('panel-open');
});

document.querySelector('#open-analysis').addEventListener('click', () => {
  analysisPanel.classList.toggle('open');
  document.querySelector('#open-analysis').classList.toggle('panel-open', analysisPanel.classList.contains('open'));
});
document.querySelector('#close-analysis').addEventListener('click', () => {
  analysisPanel.classList.remove('open');
  document.querySelector('#open-analysis').classList.remove('panel-open');
});
document.querySelectorAll('[data-analysis]').forEach((button) => button.addEventListener('click', () => {
  currentAnalysis = button.dataset.analysis;
  document.querySelectorAll('[data-analysis]').forEach((item) => item.classList.toggle('active', item === button));
  renderAnalysis();
}));

setStep(0);
