// Static 2D colliders (circles + wall segments with a height range) on an 80 m grid.
export const COLL_CELL = 80;

export class Colliders {
  constructor() {
    this.cells = new Map();
  }
  key(cx, cz) {
    return cx * 100003 + cz;
  }
  bucket(x, z) {
    const k = this.key(Math.floor(x / COLL_CELL), Math.floor(z / COLL_CELL));
    let b = this.cells.get(k);
    if (!b) this.cells.set(k, (b = { circles: [], segs: [], dyn: new Map() }));
    return b;
  }
  addCircle(x, z, r, y0, y1, kind = 'tree') {
    this.bucket(x, z).circles.push({ x, z, r, y0, y1, kind });
  }
  addSegment(x0, z0, x1, z1, y0, y1, kind = 'wall') {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    this.bucket(mx, mz).segs.push({ x0, z0, x1, z1, y0, y1, kind });
  }
  /** Colliders owned by a streamed vegetation cell, replaced wholesale. */
  setDynamic(owner, x, z, circles) {
    this.bucket(x, z).dyn.set(owner, circles);
  }
  clearDynamic(owner, x, z) {
    this.bucket(x, z).dyn.delete(owner);
  }
  forEachNear(x, z, fn) {
    const cx = Math.floor(x / COLL_CELL), cz = Math.floor(z / COLL_CELL);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const b = this.cells.get(this.key(cx + dx, cz + dz));
        if (b) fn(b);
      }
  }
}
