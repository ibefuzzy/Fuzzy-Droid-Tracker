'use strict';
/* ---------------------------------------------------------------------------
   overlay-snap.js — where a dragged or resized overlay lands when it comes
   close to another overlay or to its monitor's edge (v1.11.1). Pure math on
   {x, y, width, height} rectangles in screen px, no Electron, so
   test/overlay-snap.test.js covers it; main.js feeds it window bounds.

   Only overlays beside a window count for its left/right edges (their
   vertical spans overlap or nearly touch), and only ones above/below it count
   for its top/bottom edges, so a far-away overlay never tugs on a drag.
--------------------------------------------------------------------------- */

const SNAP_PX = 12;

function near(a0, a1, b0, b1, px){ return a0 <= b1 + px && b0 <= a1 + px; }

// The offset (within px) that puts one of `edges` exactly on one of `targets`, else 0.
function nearestOffset(edges, targets, px){
  let best = 0, bestAbs = px + 1;
  for(const e of edges){
    for(const t of targets){
      const d = t - e;
      if(Math.abs(d) < bestAbs){ best = d; bestAbs = Math.abs(d); }
    }
  }
  return bestAbs <= px ? best : 0;
}

// Moving: shift b so an edge meets another overlay's edge (side by side or
// lined up with it) or the work area's edge. Size never changes.
function snapMove(b, others, wa, px = SNAP_PX){
  const xs = [wa.x, wa.x + wa.width];
  const ys = [wa.y, wa.y + wa.height];
  for(const o of others){
    if(near(b.y, b.y + b.height, o.y, o.y + o.height, px)) xs.push(o.x, o.x + o.width);
    if(near(b.x, b.x + b.width, o.x, o.x + o.width, px)) ys.push(o.y, o.y + o.height);
  }
  return {
    x: b.x + nearestOffset([b.x, b.x + b.width], xs, px),
    y: b.y + nearestOffset([b.y, b.y + b.height], ys, px),
    width: b.width, height: b.height
  };
}

// Resizing from the bottom-right corner: the right/bottom edge snaps to other
// overlays' edges and the work area's, and (when `sizes` is given) the width/
// height snaps to another overlay's, so two lists can be made the same size.
function snapResize(b, others, sizes, wa, px = SNAP_PX){
  const rights = [wa.x + wa.width];
  const bottoms = [wa.y + wa.height];
  for(const o of others){
    if(near(b.y, b.y + b.height, o.y, o.y + o.height, px)) rights.push(o.x, o.x + o.width);
    if(near(b.x, b.x + b.width, o.x, o.x + o.width, px)) bottoms.push(o.y, o.y + o.height);
  }
  for(const s of sizes){
    rights.push(b.x + s.width);
    bottoms.push(b.y + s.height);
  }
  return {
    x: b.x, y: b.y,
    width: b.width + nearestOffset([b.x + b.width], rights, px),
    height: b.height + nearestOffset([b.y + b.height], bottoms, px)
  };
}

module.exports = { SNAP_PX, snapMove, snapResize };
