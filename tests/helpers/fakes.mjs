// Test doubles for the DOM-free unit tests.

// A manual clock with the setTimeout/setInterval API. tick(ms) runs every
// timer that falls due, in time order.
export function createFakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map(); // id -> { at, fn, every }

  const schedule = (fn, ms, every) => {
    const id = nextId++;
    timers.set(id, { at: now + Math.max(0, ms), fn, every });
    return id;
  };

  return {
    setTimeout: (fn, ms) => schedule(fn, ms, null),
    clearTimeout: (id) => { timers.delete(id); },
    setInterval: (fn, ms) => schedule(fn, ms, Math.max(1, ms)),
    clearInterval: (id) => { timers.delete(id); },
    get now() { return now; },
    get pending() { return timers.size; },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        let dueId = null;
        for (const [id, timer] of timers) {
          if (timer.at <= end && (dueId === null || timer.at < timers.get(dueId).at)) dueId = id;
        }
        if (dueId === null) break;
        const timer = timers.get(dueId);
        now = timer.at;
        if (timer.every) timer.at += timer.every;
        else timers.delete(dueId);
        timer.fn();
      }
      now = end;
    },
  };
}

// localStorage stand-in. `failReads` / `failWrites` make the calls throw.
export function createMemoryStorage(entries = {}, { failReads = false, failWrites = false } = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem(key) {
      if (failReads) throw new Error('SecurityError');
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      if (failWrites) throw new Error('QuotaExceededError');
      map.set(key, String(value));
    },
  };
}

// Records what the session asks the view to draw.
export function createFakeView() {
  const view = {
    board: Array(9).fill(null),
    highlighted: null,
    turn: null,
    scores: null,
    result: null, // { outcome, winner } while the modal is open
    resultsShown: [],
    clearBoard() { view.board = Array(9).fill(null); view.highlighted = null; },
    placePiece(index, symbol) { view.board[index] = symbol; },
    highlight(line) { view.highlighted = line; },
    matchInfo: null,
    showMatchInfo(info) { view.matchInfo = { ...info }; },
    showTurn(mode, isPlayer1, symbol) { view.turn = { mode, isPlayer1, symbol }; },
    finalTurn: null,
    showFinalTurn(outcome, winner) { view.finalTurn = { outcome, winner }; },
    showScores(mode, scores) { view.scores = { ...scores }; },
    showResult(outcome, winner) { view.result = { outcome, winner }; view.resultsShown.push(outcome); },
    hideResult() { view.result = null; },
    get pieces() { return view.board.filter(Boolean).length; },
  };
  return view;
}

// Records audio calls in order, e.g. ['sfx:victory-sound', 'music:stop'].
export function createFakeAudio() {
  const calls = [];
  return {
    calls,
    playSfx: (id) => calls.push(`sfx:${id}`),
    stopSfx: (id) => calls.push(`stop:${id}`),
    startMusic: () => calls.push('music:start'),
    stopMusic: () => calls.push('music:stop'),
  };
}

// An <audio>-like element for audio.js tests.
export function createFakeAudioElement() {
  return {
    paused: true,
    volume: 1,
    loop: false,
    currentTime: 0,
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  };
}
