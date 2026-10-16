---
name: 3d-print-preparation
description: >
  FDM print-preparation guidance. Use for topics related to preparing STL,
  STEP/STP, or 3MF geometry: inspection, orientation, supports, material,
  adhesion, slicer profiles and settings, and pre-print validation.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# 3D Print Preparation Skill

## Purpose

Prepare digital geometry for FDM printing with traceable, reversible decisions. Produce evidence
for geometry health, scale, orientation, material, supports, adhesion, and sliced toolpaths without
changing the source model or authorizing printer operation.

## Out of Scope

- Operating, calibrating, maintaining, or monitoring physical printers.
- Redesigning source CAD, changing intended scale, or destructively repairing geometry without
  explicit human approval.
- Inventing machine limits, firmware flavor, start/end G-code, or process temperatures without an
  exact compatible vendor preset or material guidance.
- Treating generated G-code as approved for printer execution.

## Decisive Inputs

Ask only for missing inputs that can change the recommendation:

| Input | Required detail |
| --- | --- |
| Geometry intent | Intended dimensions and units; function/load; critical surfaces and tolerances |
| Service | Indoor/outdoor environment, heat, UV, moisture, chemicals, and expected loading |
| Machine | Exact printer, build volume, extruder/hotend/bed, and nozzle |
| Process | Material/filament, exact slicer and version, and compatible vendor presets |
| Trade-offs | Strength, finish, dimensional fit, support effort, time, or material priority |

No universal clearance fits every printer, material, orientation, and feature. Recommend a fit
coupon for critical tolerances.

## Workflow

1. **Preserve the source** — Keep the original untouched. Work on a named copy and record file hash
   when practical.
2. **Inspect the environment** — Discover available local/offline tools before choosing a method.
   Do not claim a tool is available or require its installation.
3. **Confirm format and scale** — Record measured bounds and intended dimensions. STL generally has
   no units, so confirm its scale. 3MF carries explicit units. Keep STEP B-rep as the authority and
   record explicit tessellation tolerances when producing a mesh.
4. **Inspect geometry** — For meshes, check manifold edges, winding/outward normals, degeneracy,
   disconnected shells, self-intersections, holes, bounds, and approximate thin regions. For STEP,
   validate the B-rep before controlled tessellation. Never silently repair defects.
5. **Separate validity from printability** — Watertight means every edge appears twice; a valid
   volume also requires consistent winding/outward normals. Neither proves freedom from
   self-intersections or manufacturability. Manifold/watertight does not prove printability, and
   thickness checks remain approximate until toolpaths are inspected.
6. **Rank orientations** — Treat auto-orient and stable-pose tools as starting points. Compare at
   least three candidates using layer-direction strength, support burden and removability, bed
   contact and stability, critical-surface finish, bridging, height/time, and build-envelope fit.
7. **Choose process inputs** — Derive material and settings from service conditions. Start from the
   exact vendor machine/nozzle/material preset for the stated slicer/version, then record only
   necessary overrides. Do not synthesize unsupported temperatures or machine controls.
8. **Plan support and adhesion** — Identify supported faces, inaccessible support, interface
   concerns, first-layer contact, brim/raft need, and any surface sacrificed to the bed or support.
9. **Slice and inspect** — Use the target slicer/CLI for authoritative toolpaths. Review layer
   preview for missing thin features, floating islands, supports, seams, first layer, bridges,
   perimeters, infill, travel, and envelope violations. Successful slicing does not prove printer
   safety.
10. **Request approval** — Require human approval before generating final G-code or using any G-code
    on a printer.

## Orientation Comparison

Report the top three or Pareto candidates rather than one opaque answer:

| Rank | Transform | Strength | Supports/removal | Bed/finish/bridging | Height/time/envelope | Rationale |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Recorded rotation | Evidence | Evidence | Evidence | Evidence | Best trade-off |
| 2 | Recorded rotation | Evidence | Evidence | Evidence | Evidence | Alternative priority |
| 3 | Recorded rotation | Evidence | Evidence | Evidence | Evidence | Alternative priority |

## Tool Guidance

- Use FreeCAD or FreeCADCmd when available for STEP/B-rep inspection and controlled tessellation;
  Check Geometry validates B-rep but does not reliably auto-repair it.
- Use trimesh or an equivalent local tool when available for mesh diagnostics and stable-pose
  candidates.
- Use the exact target slicer/version and its layer preview as the authority for final toolpaths.

## Validation Checklist

- [ ] Original file remains untouched; all repairs and transforms are explicit copies.
- [ ] Units, dimensions, envelope fit, assumptions, and unresolved geometry warnings are recorded.
- [ ] At least three orientations were ranked against every required criterion.
- [ ] Material and overrides trace to service conditions and an exact compatible base preset.
- [ ] Support, adhesion, critical surfaces, clearances, and fit-coupon needs are documented.
- [ ] Layer preview was inspected; thin features, islands, seams, first layer, and toolpaths remain.
- [ ] Final G-code generation/use is still awaiting explicit human approval.

## Safety

Treat model and project files as untrusted input. Use local/offline inspection, do not upload
proprietary geometry, and do not execute embedded scripts or macros. Prefer reversible outputs and
retain an audit trail: source identity, derived filename, repairs, orientation transform,
dimensions/units, tool versions, slicer/version/base preset, overrides, assumptions, and warnings.

## Output

Return a concise geometry report; clearly labeled assumptions and risks; a top-three orientation
table with rationale; selected material/process overrides; support and adhesion plan; completed
validation checklist; and only the requested derived artifacts (profile, 3MF project, or G-code as
appropriate). Keep measured facts, assumptions, recommendations, and approvals still required
distinct.
