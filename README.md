# DND Site Selector — Take-home Assignment

A working prototype of a "drag a pin off the map into a cart" selector for
Times OOH's DND corridor inventory (122 real sites: unipoles, gantries,
kiosks, flyover panels, MUPIs, etc.).

**Stack:** plain HTML / CSS / JS + [Leaflet](https://leafletjs.com/) for the
map and native HTML5 drag-and-drop — no build step, no backend, no database.

## Run it

No install needed — it's static files.

```bash
# from inside this folder
python3 -m http.server 8000
# then open http://localhost:8000
```
Or just double-click `index.html` (works in any modern browser; a local
server avoids occasional CORS quirks with some browsers' file:// handling).

To host it: drag the folder onto [Netlify Drop](https://app.netlify.com/drop),
or push it to a GitHub repo and enable **GitHub Pages** on the `main` branch
— it's already a static site, no config required.

## Core interaction (matches the reference spec)

- Every site is a **teardrop "picture" pin** on the map, colour-coded by
  status (green = available, amber = reserved, red = owned, grey = already
  in cart).
- **Drag a pin straight off the map and drop it on the cart panel** to
  select it — no click required. Site cards in the left list are draggable
  too, as a second entry point to the same action.
- The cart shows each selected site's **name (location) and coordinates**,
  plus its site code, with a **Remove** button that drops it back out and
  puts its pin back on the map.
- Dropping outside the cart, or on a Reserved/Owned site, does nothing
  destructive and gives a clear toast explaining why.

## Assumptions made

- "Site's name" in the spec = the descriptive `Location` column from the
  sheet (e.g. *"DELHI TO MAYUR VIHAR - LHS"*), shown alongside the site
  code, since sites don't have a separate human-readable name field.
- No login/backend was asked for, so cart contents and site status are
  kept in-memory and mirrored to `localStorage` purely so a reviewer's
  progress survives an accidental refresh — this is a convenience, not a
  requirement, and resets instantly via **"Reset All."**
- The reference spec's "cart" is treated as a *selection* step, not a
  purchase. I layered a **Reserve / Pay & Own** checkout flow on top as an
  extra, since a real self-serve platform would need to do something with
  a completed selection — but the required drag → cart → remove loop is
  fully independent of it and works without ever opening checkout.
- "Picture pins on a map" → styled SVG pins rather than photographic
  thumbnails, since the sheet has no site photography to source images from.
- Where several kiosks/gantries sit within a few metres of each other
  (flagged in the brief), their pins are nudged apart visually in a small
  radius so each is still individually grabbable — the coordinates shown
  in the cart and Google Maps links always use the **real** lat/lng, the
  offset is display-only.

## What I'd build next with more time

- Marker clustering at low zoom levels (the corridor is short enough that
  122 pins overlap heavily until you zoom in).
- Server-side persistence and multi-user locking, so two people can't both
  "own" the same site — right now status is per-browser only.
- A proper touch/pointer-based drag (using Pointer Events) instead of
  relying on HTML5 DnD, which some mobile browsers still handle poorly;
  the current tap-to-add fallback covers this but isn't as satisfying as
  a real drag gesture on a phone.
- Real thumbnail photos per site instead of generic pins, and a panel
  showing panel dimensions (width × height), media status, and last-updated
  date from the sheet — the data's already there, just not surfaced yet.
- Undo for "Remove," and a lightweight animation of the pin flying between
  map and cart on drop, to make the shopping-basket feel more tactile.

## AI tools

Used an AI assistant to help scaffold the initial Leaflet + drag-and-drop
structure and to convert the site-list spreadsheet into the in-memory
`data.js` array. I rejected its first pass at drag-and-drop because it only
made the **sidebar list cards** draggable, not the **map pins themselves**
— which is the actual interaction the spec asks for — so that was rebuilt
to attach native drag events directly to each Leaflet marker's DOM element,
plus the near-duplicate-coordinate handling, search, and mobile fallback,
none of which were in the original generated draft.
