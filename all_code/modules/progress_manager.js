// Simple in-memory progress lock manager to coordinate console progress output
let current = null;

export function tryAcquire(id) {
  if (!current) {
    current = id;
    return true;
  }
  return current === id;
}

export function release(id) {
  if (current === id) current = null;
}

export function currentOwner() {
  return current;
}

export default { tryAcquire, release, currentOwner };
