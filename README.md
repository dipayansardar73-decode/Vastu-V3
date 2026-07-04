# VASTU Engineering Studio V4

VASTU Engineering Studio is an early-stage civil-engineering concept design platform for generating a coordinated residential building proposal from a structured engineering brief.

The idea behind VASTU is simple: in civil engineering education and practice, a large amount of time is still spent converting problem-sheet data, site constraints, development rules, and room requirements into preliminary building plans by hand. Existing professional tools such as AutoCAD, Revit, Bentley products, Blender, and structural-analysis packages are powerful, but they still expect the engineer or designer to perform many manual modelling and drafting steps.

VASTU explores a different workflow. Instead of starting with blank geometry, the engineer first enters detailed project information: site data, setbacks, FAR, height limits, occupancy, rooms, structural system, geotechnical assumptions, fire access, material grades, local cost inputs, and performance intent. The software then generates a coordinated concept model, a 2D plan, quantities, checks, a decision register, and a conceptual X-ray/load-path view.

This is not intended to make building design "easy for anyone." The goal is the opposite: VASTU is designed around engineering terminology, professional assumptions, and traceable decision logic. It should help civil engineers move faster while still respecting the complexity of real buildings.

## Current Status

This repository contains VASTU Engineering Studio V4, a browser-based prototype built with Vite, JavaScript, Canvas 2D, and Three.js.

The current version can:

- Take a structured engineering brief.
- Generate a site-aware building footprint.
- Create a room layout across multiple storeys.
- Produce a 3D building model.
- Produce a 2D concept plan.
- Place doors, service doors, windows, and ventilators from room and exterior-wall logic.
- Generate a terrace roof with parapet, stair headroom, water tank, and service/solar equipment.
- Show preliminary planning checks.
- Show conceptual structural X-ray/load-path visualization.
- Estimate preliminary quantities and editable cost values.
- Explain major design decisions.

It is still a prototype. It is not certified design software and must not be used directly for construction.

## Why This Project Exists

In civil engineering classes, students are often given a problem sheet containing data such as:

- Plot dimensions
- Road direction
- Setbacks
- Number of rooms
- Required floors
- Wall thickness
- Structural system
- Local planning limits

Students then spend hours drawing the building plan manually using scale, pencil, sheets, and drawing instruments. This manual work is important for learning, but in the age of AI and automation, the repetitive drafting portion can be reduced.

VASTU is an attempt to automate the first concept stage:

1. Ask the engineer for detailed inputs.
2. Generate a practical building concept.
3. Show the 3D model.
4. Generate a 2D drawing from the same model.
5. Explain why the software made each major decision.
6. Provide preliminary checks, quantities, cost, and X-ray style structural visualization.

The long-term vision is not just a drawing tool. The vision is an engineering automation system that can reason through constraints, generate multiple options, and help professionals reach a better design faster.

## Important Disclaimer

VASTU Engineering Studio is currently for academic, research, and concept coordination only.

It does not replace:

- Licensed architect approval
- Licensed structural engineer design
- Local authority approval
- Geotechnical investigation
- Fire and life-safety design
- MEP engineering
- Detailed RCC/steel design
- Construction drawings
- Site supervision
- Legal building permission

The X-ray and load-path tools are conceptual visualizations, not finite element analysis. They are not ETABS, STAAD, SAP2000, SAFE, Robot Structural Analysis, or any other certified structural analysis package.

Any real building must be checked, designed, approved, and signed by qualified professionals according to the applicable local codes and laws.

## Main Features

### 1. Professional Engineering Brief

The software asks for information in four stages:

#### Site

- Project name
- Location/jurisdiction
- Plot shape
- Road/frontage direction
- Plot width and depth
- Road width
- North rotation
- Contour interval
- Site slope
- Ground water depth
- Soil class

Supported plot shapes:

- Rectangular
- Corner chamfer
- L-shaped

The purpose of this stage is to define the real site before any geometry is generated.

#### Development Controls

- Front setback
- Rear setback
- Left setback
- Right setback
- Maximum ground coverage
- Permissible FAR
- Proposed storeys
- Permitted height
- Fire tender access width
- Exit stair width
- Landscape/open area percentage
- Rainfall intensity
- Authority-verification flag

These are the planning and approval constraints that control what can legally fit on the site.

#### Space Programme

- Bedrooms
- Toilets
- Occupants
- Car bays
- Design character
- Climate response
- Facade system
- Window-wall ratio
- Study/work room option
- Utility/wash option
- Accessible planning option
- Future expansion option

This stage describes how the building should function, not just its outer shape.

#### Structural Basis

- Primary structural system
- Floor-to-floor height
- Target grid span
- External wall thickness
- Internal wall thickness
- Allowable soil bearing capacity
- Seismic zone
- Concrete grade
- Steel grade
- Live load
- Slab thickness
- Beam depth
- Column size
- Cement rate
- Steel rate
- Masonry rate
- Location cost index

These values drive preliminary structural assumptions, quantities, and the conceptual X-ray mode.

## Generated Outputs

After the engineering brief is complete, VASTU generates:

- A 3D model
- A 2D plan
- Planning metrics
- Room schedule
- Decision register
- Checks register
- Conceptual quantities
- Cost model
- Specification register
- X-ray structural visualization

## 3D Model

The 3D model includes:

- Site boundary
- Road/frontage zone
- Setback/buildable envelope
- Building footprint
- Storey slabs
- Internal room layout
- Exterior walls
- Internal partitions
- RCC/steel column grid
- Stair core
- Balconies
- Doors
- Service doors
- Windows
- Toilet/service ventilators
- Shading projections
- Terrace slab
- Parapet boundary wall
- Stair headroom
- Roof water tank
- Roof service/solar element

The model is interactive and supports:

- Perspective view
- Top view
- Front view
- Roof toggle
- X-ray mode

## Room-Aware Door and Window Logic

Earlier versions placed façade openings too generically. V4 improves this by generating openings from room and wall logic.

The current rules are:

- Main door is placed on the road-facing exterior edge where the entry/living zone meets the frontage.
- Service door is placed for kitchen/utility where an exterior edge is available.
- Habitable rooms receive windows only when they touch an exterior wall.
- Toilets and service rooms receive smaller ventilators.
- The same opening schedule is used in both the 3D model and 2D drawing.

This means the 2D and 3D outputs now describe the same building instead of being separate visual guesses.

## 2D Concept Plan

The 2D plan is generated on an engineering-sheet style canvas.

It includes:

- Plot boundary
- Road
- Footprint/building line
- Room divisions
- Room labels
- Room dimensions/areas where space permits
- Column grid
- Grid references
- Door/window/ventilator symbols
- Main entry label
- North arrow
- Building dimensions
- Title block
- Design basis
- Preliminary quantities
- Concept status note

The plan can be exported as a PNG.

The plan is still a concept drawing. It is not a complete construction drawing set. It does not yet include every dimension string, section, elevation, plumbing line, electrical line, reinforcement detail, or authority-format sheet.

## X-Ray Mode

X-ray mode is a conceptual structural visualization tool.

It helps the engineer see:

- Approximate gravity load intensity
- Seismic base shear proxy
- Foundation pressure proxy
- Column hotspot demand
- Beam demand layer
- Slab demand layer
- Wall/envelope demand layer
- Stair core demand layer

The X-ray mode includes component focus options:

- All systems
- Slabs
- Beams
- Columns
- Stair core
- Walls

The color logic is:

- Green: lower conceptual demand
- Yellow/orange: medium conceptual demand
- Red: higher conceptual demand

This is useful for education, early-stage coordination, and visual explanation. It is not a substitute for structural analysis software.

## Checks Register

The checks register currently includes:

- Ground coverage check
- FAR check
- Height check
- Storey adjustment warning when needed
- Grid span review
- Usable room width warning
- Authority input warning
- Fire access review
- Exit stair width review
- Drainage/slope review
- Ground water warning
- Structural safety requirement
- Geotechnical basis requirement

If the requested storey count violates FAR or height limits, VASTU automatically reduces the generated storeys to the stricter permitted value and records the reason.

Example:

If 6 storeys are requested but FAR and height allow only 3, the model is generated as 3 storeys and the decision register explains why.

## Cost Model

The current cost model is editable and preliminary.

It uses:

- Concrete quantity
- Reinforcement quantity
- Masonry quantity
- Window-wall ratio
- Services allowance
- Cement rate
- Steel rate
- Masonry rate
- Location cost index

It produces:

- Concrete package cost
- Steel cost
- Masonry cost
- Facade/opening cost
- MEP/services allowance
- Total preliminary cost
- Cost per square metre

This is not live market pricing yet. The current version uses user-entered rates. A future version can connect to real supplier, location, and material-availability APIs.

## Specification Register

The specification register summarizes important project basis items:

- Survey information
- Geotechnical assumptions
- Structural material grades
- Envelope assumptions
- Fire/life-safety assumptions
- Water/rainfall basis
- Market-rate basis

This helps communicate what information has been assumed and what must still be verified.

## Architecture

The project is intentionally small and understandable.

```text
.
├── index.html
├── package.json
├── src
│   ├── domain.js
│   ├── scene.js
│   ├── drafting.js
│   ├── main.js
│   └── style.css
└── README.md
```

### `src/domain.js`

This is the engineering and generation layer.

It handles:

- Plot geometry
- Buildable envelope
- Footprint generation
- Room programme distribution
- Room layout
- Column grid generation
- Door/window/ventilator schedule
- Development checks
- Storey resolution
- Quantities
- Structural X-ray data
- Cost model
- Specification register
- Decision register

### `src/scene.js`

This is the 3D visualization layer.

It uses Three.js to render:

- Site
- Road
- Building mass
- Rooms
- Walls
- Columns
- Slabs
- Doors/windows
- Stair
- Balcony
- Roof/parapet/headroom
- X-ray overlays

### `src/drafting.js`

This is the 2D drawing layer.

It uses the HTML canvas to draw:

- Plan sheet
- Plot
- Road
- Rooms
- Grid
- Openings
- Dimensions
- North arrow
- Title block

### `src/main.js`

This is the application controller.

It handles:

- Reading form inputs
- Step navigation
- Calling the generator
- Switching between 3D, 2D, and X-ray modes
- Rendering analysis tabs
- Updating metrics
- Exporting plans

### `src/style.css`

This controls the interface:

- Top software-style menu
- Engineering form panel
- Viewport controls
- Analysis panel
- Plan and X-ray states
- Responsive behavior

## Technology Used

- JavaScript
- Vite
- Three.js
- HTML Canvas 2D
- CSS

No backend is required for the current prototype.

## How To Run Locally

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

The app will usually run at:

```text
http://127.0.0.1:5173/
```

In this project workflow, it has also been run on:

```text
http://127.0.0.1:8765/
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## What Has Been Done So Far

The project began as a simpler concept generator. The current V4 version includes several major improvements:

1. A structured civil-engineering input workflow.
2. Support for rectangular, chamfered, and L-shaped plots.
3. Automatic buildable-envelope and footprint generation.
4. Storey reduction when FAR/height limits are exceeded.
5. Multi-storey room allocation.
6. 3D model generation.
7. 2D plan generation.
8. Room-aware opening schedule.
9. Realistic terrace roof elements.
10. Preliminary quantity estimation.
11. Editable cost model.
12. Specification register.
13. Conceptual X-ray structural visualization.
14. Component focus for slabs, beams, columns, stair, and walls.
15. Cleaner software-style interface with a top command menu.
16. Improved 2D plan scaling and annotation.
17. GitHub repository publishing.

## What This Project Does Well Today

VASTU currently works well for:

- Demonstrating an AI/automation-driven civil-engineering concept workflow.
- Generating early residential building concepts from inputs.
- Showing a linked 3D and 2D output.
- Explaining why the generator made certain choices.
- Teaching students how constraints affect planning.
- Demonstrating how FAR, coverage, storeys, height, structure, and room programme interact.
- Showing conceptual load-path thinking visually.

## Current Limitations

VASTU is still not a full professional BIM/CAD/structural package.

Current limitations include:

- No real structural analysis engine.
- No finite element model.
- No reinforcement design.
- No footing sizing calculations beyond conceptual pressure proxy.
- No full plumbing/electrical/HVAC routing.
- No full authority drawing set.
- No automatic sections/elevations.
- No real-time supplier/material API.
- No real GIS/geological data integration yet.
- No multi-option optimization engine yet.
- No user account/project database.
- No DXF/DWG/IFC export yet.

These are future development targets.

## Future Roadmap

Possible future upgrades:

- Real location lookup
- Local by-law database
- GIS and terrain import
- Survey coordinate import
- Geotechnical report input
- Foundation recommendation engine
- Multiple plan alternatives
- AI design critique
- Structural-analysis export
- ETABS/STAAD/SAP2000 data export
- IFC/OpenBIM export
- DXF/DWG plan export
- MEP routing
- Staircase code checks
- Fire escape/travel distance analysis
- Daylight and ventilation scoring
- Cost API integration
- Material availability by location
- Project save/load system
- Collaboration mode for engineers
- Professional report generation

## Standards and Engineering Basis

The workflow structure follows common building-planning categories found in professional practice:

- Site/survey basis
- Development-control rules
- Space planning
- Fire/life-safety review
- Structural concept
- Geotechnical assumptions
- Services coordination
- Quantities and cost
- Drawings and reports

The project references the general organization of the National Building Code of India 2016, but it does not ship with a complete legal by-law database. Actual values must always be obtained from the local authority and verified by qualified professionals.

## Intended Users

VASTU is intended for:

- Civil engineering students
- Architecture and civil project learners
- Early-stage concept designers
- Engineers exploring automation workflows
- Researchers working on AI-assisted building design
- Demonstrations of engineering automation

It is not intended for unverified direct construction use.

## Project Vision

The long-term vision is to create a professional engineering automation platform where the manual drafting part becomes much faster, while engineering reasoning becomes more transparent.

The software should not just draw boxes. It should:

- Ask the right engineering questions.
- Understand planning constraints.
- Respect site conditions.
- Generate practical spaces.
- Explain its logic.
- Show risk and load zones.
- Create 2D and 3D outputs from one model.
- Help engineers make better early decisions.

VASTU V4 is an early step toward that larger vision.
