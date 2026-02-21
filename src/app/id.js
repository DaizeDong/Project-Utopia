let seq = 1;

export function nextId(prefix = "id") {
  const id = `${prefix}_${seq}`;
  seq += 1;
  return id;
}

export function resetIdsForTest() {
  seq = 1;
}
