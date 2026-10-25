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
    removeItem(key) {
      if (failWrites) throw new Error('SecurityError');
      map.delete(key);
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
    boardState: null,
    boardStates: [],
    moves: [], // [index, symbol, actor]
    clearBoard() { view.board = Array(9).fill(null); view.highlighted = null; },
    setBoardState(state) { view.boardState = state; view.boardStates.push(state); },
    placePiece(index, symbol, actor) { view.board[index] = symbol; view.moves.push([index, symbol, actor]); },
    highlight(line) { view.highlighted = line; },
    matchInfo: null,
    showMatchInfo(info) { view.matchInfo = { ...info }; },
    showTurn(mode, isPlayer1, symbol) { view.turn = { mode, isPlayer1, symbol }; },
    finalTurn: null,
    showFinalTurn(outcome, winner, line) { view.finalTurn = { outcome, winner, line }; },
    showScores(mode, scores) { view.scores = { ...scores }; },
    resultAchievements: null, // the achievements the last result dialog listed
    showResult(outcome, winner, achievements = []) {
      view.result = { outcome, winner };
      view.resultsShown.push(outcome);
      view.resultAchievements = achievements;
    },
    hideResult() { view.result = null; },
    get pieces() { return view.board.filter(Boolean).length; },
  };
  return view;
}

// Records what the Acorns & Leaves session asks its view to draw and say.
export function createFakeCheckersView() {
  const view = {
    model: null, // the latest render(model)
    models: [],
    announcements: [],
    result: null, // { outcome, title, message } while the dialog is open
    results: [],
    orientation: null,
    matchInfo: null,
    setOrientation(side) { view.orientation = side; },
    showMatchInfo(info) { view.matchInfo = { ...info }; },
    render(model) { view.model = model; view.models.push(model); },
    announce(text) { view.announcements.push(text); },
    resultAchievements: null, // the achievements the last result dialog listed
    showResult(result, achievements = []) {
      view.result = result;
      view.results.push(result);
      view.resultAchievements = achievements;
    },
    hideResult() { view.result = null; },
    handoff: null, // { title, text, button } while the handoff screen is up
    handoffs: [],
    showHandoff(text) { view.handoff = text; view.handoffs.push(text.title); },
    hideHandoff() { view.handoff = null; },
    focusBoard() {},
    get said() { return view.announcements[view.announcements.length - 1]; },
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
    stopEffects: () => calls.push('stop:effects'),
  };
}

// An <audio>-like element for audio.js tests. Like a real one, setting the
// volume outside 0–1 throws. `refuse(name)` makes the next play() reject with
// that error (as browsers do before a user gesture: NotAllowedError);
// `hold()` makes it return a promise that settles only when the test calls
// the returned { resolve, reject }.
export function createFakeAudioElement() {
  let volume = 1;
  let next = null;
  return {
    paused: true,
    loop: false,
    currentTime: 0,
    plays: 0,
    get volume() { return volume; },
    set volume(v) {
      if (!(v >= 0 && v <= 1)) throw new RangeError(`IndexSizeError: volume ${v}`);
      volume = v;
    },
    refuse(name) { next = { refuse: name }; },
    hold() {
      const handle = {};
      next = { hold: handle };
      return handle;
    },
    play() {
      this.plays++;
      const how = next;
      next = null;
      if (how?.refuse) {
        const err = Object.assign(new Error(how.refuse), { name: how.refuse });
        return Promise.reject(err);
      }
      this.paused = false;
      if (how?.hold) {
        return new Promise((resolve, reject) => {
          how.hold.resolve = resolve;
          how.hold.reject = (name) => reject(Object.assign(new Error(name), { name }));
        });
      }
      return Promise.resolve();
    },
    pause() { this.paused = true; },
  };
}
