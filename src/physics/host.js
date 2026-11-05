/**
 * The page's side of physics: a worker that runs the boards' worlds (physics.worker.js), or the same code in
 * the page when a worker cannot start (a page opened from disk). One request at a time per board: while a
 * frame is being made, a newer time replaces the waiting one, so a slow world never falls behind the clock.
 *
 *   const host = createPhysicsHost({ onFrame(board, frame), onError(message) })
 *   host.load(board, scene) · host.to(board, t) · host.motor(board, id, speed) · host.drop(board)
 */
import { createCore } from './core.js';

/** What the worker (or the page) does with a message. */
export function handle(R, cores, msg, post) {
  const { board } = msg;
  if (msg.type === 'load') {
    cores.get(board)?.core.free();
    const core = createCore(R, msg.scene);
    cores.set(board, { core, key: msg.scene.key });
    post({ type: 'loaded', board, key: msg.scene.key, moving: core.moving });
  } else if (msg.type === 'to') {
    const c = cores.get(board);
    if (!c) return;
    const f = c.core.to(msg.t);
    post({ type: 'frame', board, seq: msg.seq, key: c.key, n: f.n, t: f.t, poses: f.poses, events: f.events }, [f.poses.buffer]);
  } else if (msg.type === 'motor') cores.get(board)?.core.motor(msg.id, msg.speed, msg.torque);
  else if (msg.type === 'impulse') cores.get(board)?.core.impulse(msg.id, msg.v);
  else if (msg.type === 'drop') { cores.get(board)?.core.free(); cores.delete(board); }
}

export function createPhysicsHost({ onFrame = () => {}, onLoaded = () => {}, onError = () => {} } = {}) {
  let worker = null, local = null, seq = 0;
  const busy = new Map(), waiting = new Map(), scenes = new Map();

  const receive = msg => {
    if (msg.type === 'loaded') onLoaded(msg.board, msg);
    else if (msg.type === 'error') onError(msg.message);
    else if (msg.type === 'frame') {
      busy.delete(msg.board);
      onFrame(msg.board, msg);
      if (waiting.has(msg.board)) { const t = waiting.get(msg.board); waiting.delete(msg.board); send({ type: 'to', board: msg.board, t, seq: ++seq }); busy.set(msg.board, true); }
    }
  };

  // In the page: Rapier and the core loaded on the first message, the same handling as the worker's.
  const inPage = () => {
    if (local) return local;
    const cores = new Map();
    let chain = import('@dimforge/rapier2d-deterministic-compat').then(async ({ default: R }) => { await R.init({}); return R; });
    local = {
      post(msg) { chain = chain.then(R => { try { handle(R, cores, msg, receive); } catch (e) { receive({ type: 'error', board: msg.board, message: e.message }); } return R; }); }
    };
    return local;
  };

  const start = () => {
    if (worker !== null || local) return;
    try {
      worker = typeof Worker !== 'undefined' && typeof window !== 'undefined' ? new Worker(new URL('./physics.worker.js', import.meta.url), { type: 'module' }) : false;
    } catch { worker = false; }
    if (worker) {
      worker.onmessage = e => receive(e.data);
      worker.onerror = () => {
        // A worker that cannot start: the same in the page, with what it had been given.
        worker?.terminate?.(); worker = false; busy.clear();
        for (const [board, scene] of scenes) inPage().post({ type: 'load', board, scene });
      };
    }
  };

  const send = msg => {
    start();
    if (worker) worker.postMessage(msg); else inPage().post(msg);
  };

  return {
    get inWorker() { return Boolean(worker); },
    load(board, scene) { scenes.set(board, scene); busy.delete(board); waiting.delete(board); send({ type: 'load', board, scene }); },
    to(board, t) {
      if (busy.get(board)) { waiting.set(board, t); return; }
      busy.set(board, true);
      send({ type: 'to', board, t, seq: ++seq });
    },
    motor(board, id, speed, torque) { send({ type: 'motor', board, id, speed, torque }); },
    impulse(board, id, v) { send({ type: 'impulse', board, id, v }); },
    drop(board) { scenes.delete(board); busy.delete(board); waiting.delete(board); send({ type: 'drop', board }); }
  };
}
