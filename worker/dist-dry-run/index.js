var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance, key, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// src/index.ts
var PROTECTED_METHODS = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH", "DELETE"]);
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
function runObjectKey(runId) {
  return `index-runs/${runId}.json`;
}
__name(runObjectKey, "runObjectKey");
async function readIndexRun(bucket, runId) {
  const object = await bucket.get(runObjectKey(runId));
  return object ? await object.json() : null;
}
__name(readIndexRun, "readIndexRun");
async function writeIndexRun(bucket, run) {
  await bucket.put(runObjectKey(run.run_id), JSON.stringify(run), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });
}
__name(writeIndexRun, "writeIndexRun");
function runStatus(succeeded, failed) {
  if (failed === 0) return "completed";
  return succeeded === 0 ? "failed" : "partial";
}
__name(runStatus, "runStatus");
function jsonResponse(payload, init = {}, corsHeaders) {
  return Response.json(payload, {
    ...init,
    headers: {
      ...corsHeaders,
      ...init.headers || {}
    }
  });
}
__name(jsonResponse, "jsonResponse");
function requireAuth(request, env2, corsHeaders) {
  if (!PROTECTED_METHODS.has(request.method)) {
    return null;
  }
  if (!env2.GATEWAY_TOKEN) {
    return jsonResponse(
      { error: "Memory worker auth is not configured" },
      { status: 503 },
      corsHeaders
    );
  }
  const authHeader = request.headers.get("Authorization") || "";
  const supplied = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!supplied || supplied !== env2.GATEWAY_TOKEN) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 }, corsHeaders);
  }
  return null;
}
__name(requireAuth, "requireAuth");
function parseAgentFilePath(path) {
  const match = path.match(/^\/agents\/([^/]+)\/files\/(.+)$/);
  if (!match) return null;
  const agent = decodeURIComponent(match[1]);
  const file = match[2].split("/").map((part) => decodeURIComponent(part)).join("/");
  if (!agent || !file || file.includes("..") || file.startsWith("/")) {
    return null;
  }
  return { agent, file };
}
__name(parseAgentFilePath, "parseAgentFilePath");
function contentTypeForPath(path) {
  if (path.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}
__name(contentTypeForPath, "contentTypeForPath");
function generateId(agent, source, text) {
  const hash = Array.from(text).reduce((h, c) => (h << 5) - h + c.charCodeAt(0) | 0, 0).toString(16);
  return `${agent}:${source}:${hash}`;
}
__name(generateId, "generateId");
function chunkText(text, maxChunkSize = 500) {
  const chunks = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = "";
  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}
__name(chunkText, "chunkText");
var index_default = {
  async fetch(request, env2, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Hermes-File-Sha256"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      const fileRoute = parseAgentFilePath(path);
      if (fileRoute && request.method === "GET") {
        const objectKey = `${fileRoute.agent}/${fileRoute.file}`;
        const obj = await env2.R2_MEMORY.get(objectKey);
        if (!obj) {
          return jsonResponse({ error: `File not found: ${fileRoute.file}` }, { status: 404 }, corsHeaders);
        }
        return new Response(obj.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": obj.httpMetadata?.contentType || contentTypeForPath(fileRoute.file),
            "ETag": obj.httpEtag,
            "X-Hermes-Memory-Agent": fileRoute.agent,
            "X-Hermes-Memory-File": fileRoute.file
          }
        });
      }
      if (fileRoute && request.method === "PUT") {
        const authError = requireAuth(request, env2, corsHeaders);
        if (authError) return authError;
        const objectKey = `${fileRoute.agent}/${fileRoute.file}`;
        const contentType = request.headers.get("Content-Type") || contentTypeForPath(fileRoute.file);
        await env2.R2_MEMORY.put(objectKey, request.body, {
          httpMetadata: { contentType },
          customMetadata: {
            agent: fileRoute.agent,
            file: fileRoute.file,
            sha256: request.headers.get("X-Hermes-File-Sha256") || "",
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          }
        });
        return jsonResponse({ stored: true, agent: fileRoute.agent, file: fileRoute.file, key: objectKey }, { status: 201 }, corsHeaders);
      }
      if (fileRoute) {
        return jsonResponse({ error: "Method not allowed" }, { status: 405 }, corsHeaders);
      }
      if (path === "/query" && request.method === "POST") {
        const authError = requireAuth(request, env2, corsHeaders);
        if (authError) return authError;
        const body = await request.json();
        if (!body.query) {
          return jsonResponse({ error: "query is required" }, { status: 400 }, corsHeaders);
        }
        const embeddingResp = await env2.AI.run(
          env2.EMBEDDING_MODEL,
          { text: [body.query] }
        );
        const filter = {};
        if (body.agent) filter.agent = { $eq: body.agent };
        if (body.type) filter.type = { $eq: body.type };
        const results = await env2.VECTORIZE.query(embeddingResp.data[0], {
          topK: body.topK || 5,
          filter: Object.keys(filter).length > 0 ? filter : void 0,
          returnMetadata: "all"
        });
        const minScore = body.minScore || 0.7;
        const filtered = results.matches.filter((m) => m.score >= minScore);
        return jsonResponse({
          query: body.query,
          count: filtered.length,
          matches: filtered.map((m) => ({
            id: m.id,
            score: m.score,
            metadata: m.metadata
          }))
        }, {}, corsHeaders);
      }
      if (path === "/index" && request.method === "POST") {
        const authError = requireAuth(request, env2, corsHeaders);
        if (authError) return authError;
        const body = await request.json();
        if (!body.agent || !body.text) {
          return jsonResponse({ error: "agent and text are required" }, { status: 400 }, corsHeaders);
        }
        const chunks = chunkText(body.text);
        const vectors = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embeddingResp = await env2.AI.run(
            env2.EMBEDDING_MODEL,
            { text: [chunk] }
          );
          const id = generateId(body.agent, body.source_file || "manual", chunk);
          vectors.push({
            id,
            values: embeddingResp.data[0],
            metadata: {
              agent: body.agent,
              type: body.type || "context",
              source_file: body.source_file || "manual",
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              chunk_index: body.chunk_index ?? i,
              raw_text: chunk
            }
          });
        }
        const result = await env2.VECTORIZE.upsert(vectors);
        return jsonResponse({
          indexed: vectors.length,
          ids: vectors.map((v) => v.id),
          result
        }, {}, corsHeaders);
      }
      if (path === "/capture" && request.method === "POST") {
        const authError = requireAuth(request, env2, corsHeaders);
        if (authError) return authError;
        const body = await request.json();
        if (!body.agent || !body.content) {
          return jsonResponse({ error: "agent and content are required" }, { status: 400 }, corsHeaders);
        }
        let memoryType = "context";
        const contentLower = body.content.toLowerCase();
        if (body.classification) {
          memoryType = body.classification;
        } else if (contentLower.includes("decided") || contentLower.includes("decision")) {
          memoryType = "decision";
        } else if (contentLower.includes("actually") || contentLower.includes("no,") || contentLower.includes("that's wrong")) {
          memoryType = "correction";
        } else if (contentLower.includes("learned") || contentLower.includes("realized")) {
          memoryType = "learning";
        } else if (contentLower.includes("prefer") || contentLower.includes("like") || contentLower.includes("want")) {
          memoryType = "preference";
        }
        if (memoryType === "context") {
          return jsonResponse({ captured: false, reason: "Not a capture-worthy turn" }, {}, corsHeaders);
        }
        const embeddingResp = await env2.AI.run(
          env2.EMBEDDING_MODEL,
          { text: [body.content] }
        );
        const id = generateId(body.agent, "capture", body.content);
        const vector = {
          id,
          values: embeddingResp.data[0],
          metadata: {
            agent: body.agent,
            type: memoryType,
            source_file: "auto-capture",
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            chunk_index: 0,
            raw_text: body.content.slice(0, 1e3)
            // Truncate for metadata
          }
        };
        await env2.VECTORIZE.upsert([vector]);
        return jsonResponse({
          captured: true,
          type: memoryType,
          id
        }, {}, corsHeaders);
      }
      if (path === "/index-file" && request.method === "POST") {
        const authError = requireAuth(request, env2, corsHeaders);
        if (authError) return authError;
        const body = await request.json();
        if (!body.agent || !body.file) {
          return jsonResponse({ error: "agent and file are required" }, { status: 400 }, corsHeaders);
        }
        const bucket = env2.R2_MEMORY;
        const obj = await bucket.get(`${body.agent}/${body.file}`);
        if (!obj) {
          return jsonResponse({ error: `File not found: ${body.file}` }, { status: 404 }, corsHeaders);
        }
        const text = await obj.text();
        const chunks = chunkText(text);
        const runId = (await sha256Hex(`${body.agent}
${body.file}
${text}`)).slice(0, 32);
        const previous = await readIndexRun(bucket, runId);
        const run = previous || {
          run_id: runId,
          agent: body.agent,
          file: body.file,
          status: "running",
          total: chunks.length,
          succeeded: 0,
          failed: chunks.length,
          retryable: chunks.length,
          attempts: 0,
          updated_at: (/* @__PURE__ */ new Date()).toISOString(),
          chunks: chunks.map((chunk, index) => ({
            index,
            id: generateId(body.agent, body.file, chunk),
            status: "failed",
            retryable: true
          }))
        };
        run.total = chunks.length;
        run.attempts += 1;
        run.updated_at = (/* @__PURE__ */ new Date()).toISOString();
        await writeIndexRun(bucket, run);
        for (let i = 0; i < chunks.length; i += 100) {
          const pending = run.chunks.filter((chunk) => chunk.index >= i && chunk.index < i + 100 && chunk.status !== "succeeded");
          if (!pending.length) continue;
          const vectors = [];
          for (const item of pending) {
            const embeddingResp = await env2.AI.run(
              env2.EMBEDDING_MODEL,
              { text: [chunks[item.index]] }
            );
            vectors.push({
              id: item.id,
              values: embeddingResp.data[0],
              metadata: {
                agent: body.agent,
                type: "context",
                source_file: body.file,
                timestamp: (/* @__PURE__ */ new Date()).toISOString(),
                chunk_index: item.index,
                raw_text: chunks[item.index]
              }
            });
          }
          try {
            await env2.VECTORIZE.upsert(vectors);
            for (const item of pending) {
              item.status = "succeeded";
              item.retryable = false;
              delete item.error;
            }
          } catch (error3) {
            const message = error3 instanceof Error ? error3.message : "Vectorize upsert failed";
            for (const item of pending) {
              item.status = "failed";
              item.retryable = true;
              item.error = message.slice(0, 200);
            }
          }
          run.succeeded = run.chunks.filter((chunk) => chunk.status === "succeeded").length;
          run.failed = run.total - run.succeeded;
          run.retryable = run.chunks.filter((chunk) => chunk.retryable).length;
          run.status = runStatus(run.succeeded, run.failed);
          run.updated_at = (/* @__PURE__ */ new Date()).toISOString();
          await writeIndexRun(bucket, run);
        }
        const responseStatus = run.failed ? 207 : 200;
        return jsonResponse({
          run_id: run.run_id,
          file: run.file,
          status: run.status,
          total: run.total,
          succeeded: run.succeeded,
          failed: run.failed,
          retryable: run.retryable,
          attempts: run.attempts,
          chunks: run.chunks
        }, { status: responseStatus }, corsHeaders);
      }
      const runMatch = path.match(/^\/index-runs\/([a-f0-9]{32})$/);
      if (runMatch && request.method === "GET") {
        const run = await readIndexRun(env2.R2_MEMORY, runMatch[1]);
        return run ? jsonResponse(run, {}, corsHeaders) : jsonResponse({ error: "Index run not found" }, { status: 404 }, corsHeaders);
      }
      if (path === "/stats" && request.method === "GET") {
        const dummyEmbedding = new Array(768).fill(0);
        const results = await env2.VECTORIZE.query(dummyEmbedding, {
          topK: 1,
          returnMetadata: "none"
        });
        return jsonResponse({
          index: "agent-memories",
          dimensions: 768,
          metric: "cosine",
          model: env2.EMBEDDING_MODEL,
          // Vectorize doesn't expose total count directly
          status: "healthy"
        }, {}, corsHeaders);
      }
      if (path === "/health" || path === "/") {
        return jsonResponse({
          status: "ok",
          service: "openclaw-memory-worker",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }, {}, corsHeaders);
      }
      return jsonResponse({ error: "Not found" }, { status: 404 }, corsHeaders);
    } catch (err) {
      console.error("Error:", err);
      return jsonResponse({
        error: "Internal server error",
        details: err instanceof Error ? err.message : String(err)
      }, { status: 500 }, corsHeaders);
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
