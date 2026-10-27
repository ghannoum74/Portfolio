import vm from 'node:vm';

// Execute the real Three.js/Basis worker program on the CPU. Only Worker message
// transport is simulated; this fixture does not render or measure a browser/GPU.
export function installKtx2WorkerFixture() {
  const saved = Object.fromEntries(['Worker', 'self', 'ProgressEvent'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const workers = new Set();
  let peakWorkers = 0;
  class WorkerFixture {
    constructor(url) {
      this.listeners = []; this.messages = []; this.closed = false; workers.add(this);
      peakWorkers = Math.max(peakWorkers, workers.size);
      this.ready = fetch(url).then(response => response.text()).then(source => {
        const context = vm.createContext({ console, WebAssembly, TextDecoder, TextEncoder,
          Uint8Array, Uint32Array, ArrayBuffer, setTimeout, clearTimeout,
          location: { href: url }, importScripts() { throw new Error('Unexpected extra worker script'); },
          addEventListener: (type, callback) => { if (type === 'message') this.messages.push(callback); },
          postMessage: (data, transfer = []) => {
            const copy = structuredClone(data, { transfer });
            queueMicrotask(() => { if (!this.closed) for (const callback of this.listeners) callback({ data: copy }); });
          },
        });
        context.self = context;
        vm.runInContext(source, context);
      });
    }
    addEventListener(type, callback) { if (type === 'message') this.listeners.push(callback); }
    postMessage(message, transfer = []) {
      const data = structuredClone(message, { transfer });
      this.ready.then(() => { if (!this.closed) for (const callback of this.messages) callback({ data }); });
    }
    terminate() { this.closed = true; workers.delete(this); }
  }
  globalThis.Worker = WorkerFixture;
  globalThis.self = globalThis;
  globalThis.ProgressEvent ??= class ProgressEvent extends Event {
    constructor(type, values) { super(type); Object.assign(this, values); }
  };
  return {
    get activeWorkers() { return workers.size; },
    get peakWorkers() { return peakWorkers; },
    cleanup() {
      for (const worker of workers) worker.terminate();
      for (const [key, descriptor] of Object.entries(saved)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
      }
    },
  };
}
