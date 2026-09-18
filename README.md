
# DND Site Selector
A production-ready, zero-dependency prototype for selecting Times OOH DND corridor inventory (`122 real sites: Unipoles, Gantries, Kiosks, Flyover Panels, MUPIs, etc.`) via native HTML5 drag-and-drop and bi-directional map interactions.

## Stack
```markdown
Plain HTML5, CSS3, ES6 JavaScript + [Leaflet.js](https://leafletjs.com/) — no build tools, no backend, no framework overhead.
```

## Project Structure

```text
.
├── index.html       # Sidebar layout, map container, modals & cart overlay
├── styles.css       # Responsive UI layout, active/in-cart pin styles, animations
├── app.js          # Leaflet map setup, bi-directional sync, DnD, search & state engine
└── data.js         # In-memory inventory array (122 DND sites with specs & coordinates)

```

---

## How to Run

No installation required — runs entirely as static files:

```bash
# Serve locally via Python
python3 -m http.server 8000
# Open http://localhost:8000

```

*Or double-click `index.html` to open directly in any modern web browser.*

---

## Core Features & Interaction Design

### Bi-Directional Map & Sidebar Synchronization

* **Map Focus on Card Click:** Clicking any non-`+` area of a sidebar card automatically zooms in and centers the map directly on that site's pin while applying active card focus styling.
* **Rich Pin Popups:** Clicking a map pin opens a card displaying the site code, location name, status, direct **"Add to Cart"** button, and an external **"Open in Google Maps ↗"** shortcut.
* **Persistent Muted Pin State:** Adding a site to the cart retains a semi-transparent "In Cart" pin on the map. Clicking it reveals its updated **"In Cart"** status while keeping it clickable for inspection.
* **Coordinate Nudging (Jittering):** Dense site clusters (overlapping kiosks/gantries) use visual offset nudges so each pin remains individually grabbable, preserving exact GPS coordinates in cart payloads.

### Seamless Cart & State Management

* **Dual-Entry Drag & Drop:** Drag available map pins or sidebar cards directly into the floating cart dock, or tap the `+` button on any sidebar card as a quick touch fallback.
* **Real-time Dual Sync:** Adding or removing an item via map popup, drag gesture, or sidebar button instantly updates all UI components, cart aggregations, and pin visibilities in real time.
* **Dynamic Totals:** Live calculation of total selected site count and total aggregated area in **sq.ft**.

### Search, Filtering & Checkout Pipeline

* **Parametric Filters:** Filter inventory by **Zone** (*All*, *Delhi*, *Noida*), **Display Type** (*Unipole*, *Gantry*, *Kiosk*, etc.), and **Status** (*Available*, *Reserved*, *Owned*).
* **Instant Site ID Search:** Live search bar matches against Site IDs and location strings as you type.
* **Complete Checkout Flow:** Process cart selections directly into **Reserved** or **Owned** statuses. Updated statuses persist instantly in `localStorage` and can be audited using the status filter.
* **One-Click Reset:** A **"Reset All"** action clears saved `localStorage` state and returns inventory to baseline.

---

## Assumptions & Trade-offs

* **Site Identifiers:** The descriptive `Location` column (e.g., *"DELHI TO MAYUR VIHAR - LHS"*) is combined with the site code as the main display title in place of photographic assets.
* **Client-side Persistence:** `localStorage` is used to preserve user status updates and cart state across page reloads without requiring database infrastructure.
* **Selection-First Architecture:** The cart operates primarily as a selection step, with the Reserve/Pay checkout acting as the final state transition to demonstrate a real-world inventory lifecycle.

---

## What I'd Build Next (Production Roadmap)

* **Marker Clustering:** Group dense pin clusters at low zoom levels using `Leaflet.markercluster` before zooming in.
* **Touch & Pointer Events:** Expand standard HTML5 drag-and-drop to use `PointerEvents` for smoother touch-dragging on mobile and tablet devices.
* **Multi-User State Concurrency:** Integrate a WebSocket server to broadcast real-time site locks across concurrent active sessions.
* **Fly-to-Cart Animations:** Add UI micro-interactions and smooth bezier trajectories for pins flying into the cart dock upon drop.

---

## AI Tool Usage

An AI assistant was used to help convert the raw site spreadsheet into `data.js` and scaffold initial Leaflet map layers.

*Note on implementation:*
The initial AI draft attempted to use Leaflet's coordinate-dragging, which moved actual pin locations across the map. I refactored the marker layer to bind native HTML5 `dragstart` handlers directly to marker DOM elements, built the bi-directional sidebar map centering logic, implemented the semi-transparent "In Cart" pin states, and wrote the coordinate jittering for overlapping sites.