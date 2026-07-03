# VASTU Engineering Studio V3

VASTU is a constraint-aware concept-design environment for civil-engineering workflows. It converts a structured engineering brief into one coordinated spatial model, an interactive 3D proposal, a dimensioned 2D concept plan, preliminary geometric quantities, and an explainable decision register.

## Current scope

- Rectangular, chamfered, and L-shaped sites
- Road orientation and four project setbacks
- Ground coverage, FAR, storey, and height checks with automatic storey adjustment
- Residential room programme distributed across multiple storeys
- RCC frame, load-bearing masonry, and steel-frame concept modes
- Preliminary planning grid and vertical column continuity
- Interactive perspective, top, and front views
- One-click level-by-level 2D plan and PNG export
- Design rationale, room schedule, assumptions, and mandatory professional checks

This release is for academic and professional **concept coordination**. It does not replace local authority approval, architectural services, structural analysis, geotechnical design, fire and life-safety design, MEP engineering, or construction drawings.

## Run locally

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run build
```

## Architecture

- `src/domain.js` - input schema, footprint logic, programme allocation, checks, quantities, and design rationale
- `src/scene.js` - Three.js site and building model
- `src/drafting.js` - generated 2D engineering drawing
- `src/main.js` - workflow and interface orchestration
- `src/style.css` - professional engineering-studio interface

## Standards basis

The workflow structure follows the integrated design categories described by the National Building Code of India 2016. Actual numeric requirements must be supplied from the applicable local development authority and verified by qualified professionals.
