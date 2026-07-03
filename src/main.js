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
    frontSetback: numberValue(data, 'frontSetback'),
    rearSetback: numberValue(data, 'rearSetback'),
    leftSetback: numberValue(data, 'leftSetback'),
    rightSetback: numberValue(data, 'rightSetback'),
    maxCoverage: numberValue(data, 'maxCoverage'),
    maxFar: numberValue(data, 'maxFar'),
    floors: numberValue(data, 'floors'),
    maxHeight: numberValue(data, 'maxHeight'),
    authorityVerified: data.has('authorityVerified'),
    bedrooms: numberValue(data, 'bedrooms'),
    toilets: numberValue(data, 'toilets'),
    occupants: numberValue(data, 'occupants'),
    parking: numberValue(data, 'parking'),
    style: data.get('style'),
    climate: data.get('climate'),
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

document.querySelector('#toggle-roof').addEventListener('click', (event) => {
  const visible = scene.toggleRoof();
  event.currentTarget.textContent = `ROOF: ${visible ? 'ON' : 'OFF'}`;
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
