// Measurement kernels, NOT the game's engine or a legal 7-bag/SRS replay.
// Event format: unsigned LEB128 delta tick followed by one action byte.
export function encode(events) {
  const bytes = [];
  let previous = 0;
  for (const [tick, action] of events) {
    let delta = tick - previous;
    if (!Number.isSafeInteger(delta) || delta < 0) throw new Error('Unordered events');
    do {
      let byte = delta % 128;
      delta = Math.floor(delta / 128);
      if (delta) byte |= 128;
      bytes.push(byte);
    } while (delta);
    bytes.push(action);
    previous = tick;
  }
  return Uint8Array.from(bytes);
}

export function decode(bytes) {
  let tick = 0;
  const events = [];
  for (let i = 0; i < bytes.length;) {
    let delta = 0, scale = 1, byte;
    do {
      if (i >= bytes.length || scale > 2 ** 28) throw new Error('Invalid varint');
      byte = bytes[i++];
      delta += (byte & 127) * scale;
      scale *= 128;
    } while (byte & 128);
    if (i >= bytes.length) throw new Error('Missing action');
    tick += delta;
    events.push([tick, bytes[i++]]);
  }
  return events;
}

// Synthetic input traces only: 3,750 placements over 216,000 active ticks.
// No claim that they are legal/completable Marathon games.
export function trace(eventsPerPlacement, placements = 3750, totalTicks = 216000) {
  const events = [];
  for (let p = 0; p < placements; p++) {
    const start = Math.floor(p * totalTicks / placements);
    for (let j = 0; j < eventsPerPlacement; j++) {
      events.push([start + j, j % 12]);
    }
  }
  return events;
}

// Deterministic bitboard collision + hard drop + line clear + PRNG kernel.
// Place five O pieces across the empty board, clear two lines, repeat.
// Deliberately excludes 7-bag, SRS, T-spin, hold, DAS and lock delay.
export function boardKernel(placements = 3750, rounds = 1) {
  let hash = 0x12345678;
  let totalLines = 0;
  for (let round = 0; round < rounds; round++) {
    const board = new Uint16Array(22);
    let lines = 0;
    for (let p = 0; p < placements; p++) {
      hash ^= hash << 13; hash ^= hash >>> 17; hash ^= hash << 5;
      const mask = 3 << ((p % 5) * 2);
      let y = 0;
      while (y + 2 < 22 && !(board[y + 1] & mask) && !(board[y + 2] & mask)) y++;
      if (board[y] & mask || board[y + 1] & mask) throw new Error('Unexpected overlap');
      board[y] |= mask;
      board[y + 1] |= mask;
      let write = 21;
      for (let read = 21; read >= 0; read--) {
        if (board[read] === 1023) lines++;
        else board[write--] = board[read];
      }
      while (write >= 0) board[write--] = 0;
      hash = Math.imul(hash ^ (y + lines), 16777619);
    }
    totalLines += lines;
    hash ^= board.reduce((a, b) => a ^ b, 0);
  }
  return {hash: hash >>> 0, lines: totalLines};
}

// Independent fixed-step and event-leap TIMER kernels, not full Tetris.
// Compare handling of periodic gravity, DAS, lock and simultaneous input.
export function timerKernel(events, endTick, optimized) {
  let time = 0, gravity = 60, das = Infinity, lock = 30;
  let input = 0, direction = 0, hash = 0;
  let gravityCount = 0, dasCount = 0, lockCount = 0, iterations = 0;
  while (time <= endTick) {
    iterations++;
    while (input < events.length && events[input][0] === time) {
      const action = events[input++][1];
      if (action === 0 || action === 2) { direction = action === 0 ? -1 : 1; das = time + 8; }
      if (action === 1 || action === 3) { direction = 0; das = Infinity; }
      hash = Math.imul(hash ^ action, 16777619);
    }
    if (gravity === time) { gravityCount++; gravity += 60; hash = Math.imul(hash ^ 17, 16777619); }
    if (das === time) { dasCount += direction !== 0 ? 1 : 0; das++; hash = Math.imul(hash ^ 19, 16777619); }
    if (lock === time) { lockCount++; lock += 30; hash = Math.imul(hash ^ 23, 16777619); }
    time = optimized ? Math.min(events[input]?.[0] ?? Infinity, gravity, das, lock, endTick + 1) : time + 1;
  }
  return {hash: hash >>> 0, gravityCount, dasCount, lockCount, iterations};
}

export function burn(iterations) {
  let hash = 0x12345678;
  for (let i = 0; i < iterations; i++) {
    hash = Math.imul(hash ^ i, 1664525) + 1013904223 | 0;
  }
  return hash >>> 0;
}
