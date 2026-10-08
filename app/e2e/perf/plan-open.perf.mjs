#!/usr/bin/env node
/**
 * Plan-view performance check (web). Seeds a realistic state into localStorage, then measures,
 * under CDP CPU throttling:
 *   (a) tap a trip in the Trips list → plan view rendered (first day card, and the whole screen),
 *       first open and repeat opens, for each seeded trip;
 *   (b) scroll jank on the longest plan (frame gaps + long tasks during a programmatic scroll);
 *   (c) the `useNow` 30 s tick while idle on the plan view: React commits, components re-rendered,
 *       and time from the interval callback to the end of the commit;
 *   (d) navigating back to the Trips list.
 * Optionally records a CPU profile of one plan open and prints the top self-time functions.
 *
 * Usage (from app/):
 *   # production build: export first, the script serves dist/ with an SPA fallback
 *   npx expo export --platform web && node e2e/perf/plan-open.perf.mjs --target prod
 *   # dev server: start it yourself (npx expo start --web --port 8081), wait for it, then
 *   node e2e/perf/plan-open.perf.mjs --target dev --url http://localhost:8081
 * Options:
 *   --cpu 4            CPU throttling rate (default 4)
 *   --opens 3          opens per trip (first + repeats)
 *   --idle 65          seconds idle on the plan view for (c); 0 skips it
 *   --profile out.json write a CPU profile of the first open of the long trip and print hotspots
 *   --profile-trip id  profile the second open of this seeded trip instead (perf-syd, perf-tyo, perf-lhr)
 *   --json out.json    write all numbers as JSON
 *   --tick 30          seconds per app clock tick during (c) (default 30 = real; e.g. 5 for more samples)
 *   --dist dir         serve this export instead of app/dist (e.g. a build of another commit)
 * Env: PLAYWRIGHT_MODULE (default /opt/node-tools/node_modules/playwright),
 *      CHROMIUM (default /opt/pw-browsers/chromium-1194/chrome-linux/chrome).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []),
);
const TARGET = args.target || 'prod';
const CPU = Number(args.cpu ?? 4);
const OPENS = Number(args.opens ?? 3);
const IDLE_S = Number(args.idle ?? 65);
const TICK_S = Number(args.tick ?? 30);
const DIST = path.resolve(args.dist || path.resolve(here, '../../dist'));

// ---------------------------------------------------------------------------------------------
// Seed: onboarding done, three trips around "now" (one active, so the now marker shows).
// ---------------------------------------------------------------------------------------------
const H = 3600e3;
const D = 24 * H;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const local = (ms, tz) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(ms)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
const sleep = { usualBedtime: '23:00', usualWake: '07:00', chronotype: 'intermediate' };
const prefs = { useMelatonin: false, useCaffeine: true, preAdapt: true, maxPreDays: 3 };
function trip(id, name, legs, stayDays, p = prefs) {
  const input = {
    legs: legs.map(([from, fromLabel, to, toLabel, dep, arr]) => ({
      from: { tz: from, label: fromLabel },
      to: { tz: to, label: toLabel },
      departUtc: iso(dep),
      arriveUtc: iso(arr),
    })),
    sleep,
    prefs: p,
    stayDays,
  };
  const legsLocal = legs.map(([from, fromLabel, to, toLabel, dep, arr]) => {
    const a = local(dep, from);
    const b = local(arr, to);
    return { fromTz: from, fromLabel, toTz: to, toLabel, departDate: a.date, departTime: a.time, arriveDate: b.date, arriveTime: b.time };
  });
  return { id, name, createdAt: iso(Date.now() - D), input, legsLocal, profileAtSave: { sleep, prefs: p } };
}
function seed() {
  const day0 = Math.floor(Date.now() / D) * D; // today 00:00 UTC
  return {
    profile: { sleep, prefs },
    settings: { notificationsEnabled: true, leadMinutes: 10 },
    trips: [
      // Long, multi-leg, starts in 2 days: 3 pre-flight days, travel, 14-day stay.
      trip('perf-syd', 'Paris to Sydney', [
        ['Europe/Paris', 'Paris (CDG)', 'Asia/Singapore', 'Singapore (SIN)', day0 + 2 * D + 19.5 * H, day0 + 3 * D + 8 * H],
        ['Asia/Singapore', 'Singapore (SIN)', 'Australia/Sydney', 'Sydney (SYD)', day0 + 3 * D + 12 * H, day0 + 3 * D + 20 * H],
      ], 14),
      // Melatonin on, departed yesterday: active now, so the plan shows the now marker.
      trip('perf-tyo', 'Toronto to Tokyo', [
        ['America/Toronto', 'Toronto (YYZ)', 'Asia/Tokyo', 'Tokyo (HND)', day0 - 1 * D + 17 * H, day0 + 6.5 * H],
      ], 10, { ...prefs, useMelatonin: true }),
      // Short eastbound hop.
      trip('perf-lhr', 'New York to London', [
        ['America/New_York', 'New York (JFK)', 'Europe/London', 'London (LHR)', day0 + 6 * D + 22 * H, day0 + 7 * D + 9 * H],
      ], 5),
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Static server for dist/ with SPA fallback.
// ---------------------------------------------------------------------------------------------
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.ttf': 'font/ttf', '.map': 'application/json' };
function serveDist() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      let f = path.join(DIST, p);
      if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        f = fs.existsSync(f + '.html') ? f + '.html' : path.join(DIST, 'index.html');
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, () => resolve({ srv, url: `http://localhost:${srv.address().port}` }));
  });
}

// ---------------------------------------------------------------------------------------------
// In-page instrumentation (runs before the app): long tasks, React commits via the devtools hook.
// ---------------------------------------------------------------------------------------------
function instrument(tickMs) {
  const w = window;
  w.__perf = { longtasks: [], commits: [], ticks: [] };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__perf.longtasks.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  // Count function components that rendered in each commit (React's PerformedWork flag), walking
  // only subtrees that were reconciled in this commit (as React DevTools does).
  const countRendered = (root) => {
    let n = 0;
    const stack = [root.current];
    while (stack.length) {
      const f = stack.pop();
      if ((f.tag === 0 || f.tag === 11 || f.tag === 14 || f.tag === 15) && (f.flags & 1) === 1) n++;
      const a = f.alternate;
      if (f.child && (!a || a.child !== f.child)) {
        for (let c = f.child; c; c = c.sibling) stack.push(c);
      }
    }
    return n;
  };
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(r) {
      const id = this.renderers.size + 1;
      this.renderers.set(id, r);
      return id;
    },
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      const t = performance.now();
      w.__perf.commits.push({ t, rendered: w.__perf.countFibers ? countRendered(root) : -1 });
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
  // Time each interval callback (the useNow tick) so (c) can pair it with its commit.
  // --tick: run the app's 30 s clock faster, to sample more ticks in the same idle time.
  const si = w.setInterval.bind(w);
  w.setInterval = (fn, ms, ...rest) =>
    si(
      (...a) => {
        if (ms >= 10000) w.__perf.ticks.push({ t: performance.now(), ms });
        return fn(...a);
      },
      ms === 30000 ? tickMs : ms,
      ...rest,
    );
}

// ---------------------------------------------------------------------------------------------
const stats = (xs) => {
  if (!xs.length) return { n: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, min: +s[0].toFixed(1), median: +q(0.5).toFixed(1), max: +s[s.length - 1].toFixed(1) };
};

async function main() {
  let server = null;
  let base = args.url;
  if (TARGET === 'prod' && !base) {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('No dist/: run npx expo export --platform web first');
    server = await serveDist();
    base = server.url;
  }
  if (!base) throw new Error('--url is required for --target dev');

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    timezoneId: 'America/Toronto',
  });
  await ctx.addInitScript(instrument, TICK_S * 1000);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const cdp = await ctx.newCDPSession(page);

  // Seed storage, then load the Trips list. Dev: the first load bundles, so allow a long wait.
  const s = seed();
  await page.goto(base + '/trips', { timeout: 300000 });
  await page.evaluate((st) => {
    localStorage.clear();
    localStorage.setItem('jetlag.profile.v1', JSON.stringify(st.profile));
    localStorage.setItem('jetlag.settings.v1', JSON.stringify(st.settings));
    localStorage.setItem('jetlag.trips.v1', JSON.stringify(st.trips));
  }, s);
  // Start on Today (as the app does), so its screen stays mounted under the plan, then use the tab.
  await page.goto(base + '/', { timeout: 300000 });
  await page.getByRole('tab', { name: /Trips/ }).waitFor({ timeout: 300000 });
  await page.waitForTimeout(1500);
  const todayText = await page.evaluate(() => document.body.innerText.slice(0, 200).replace(/\s+/g, ' '));
  if (!/Paris to Sydney|Toronto to Tokyo/.test(todayText)) console.error('warning: Today does not show the active trip:', todayText);
  await page.getByRole('tab', { name: /Trips/ }).click();
  await page.getByText('Paris to Sydney', { exact: true }).first().waitFor({ timeout: 300000 });
  await page.waitForTimeout(1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

  /**
   * Tap a trip and sample every frame for 3 s: how many day timelines are on screen, and whether
   * the screen's last control is there. first = first frame with a day card; full = first frame
   * with every day card (as many as at the end) and the screen complete.
   */
  async function openTrip(name, { profile } = {}) {
    await page.evaluate(() => {
      const w = window;
      w.__open = { t0: null, samples: [], done: false };
      w.__perf.longtasks.length = 0;
      w.__perf.commits.length = 0;
      addEventListener(
        'pointerdown',
        () => {
          const t0 = (w.__open.t0 = performance.now());
          const frame = () => {
            const now = performance.now();
            let cards = 0;
            for (const e of document.querySelectorAll('[aria-label^="Timeline for"]')) if (e.offsetParent) cards++;
            const del = !!Array.from(document.querySelectorAll('[role="button"]')).find(
              (e) => e.textContent === 'Delete trip' && e.offsetParent,
            );
            w.__open.samples.push({ t: now - t0, cards, del });
            if (now - t0 < 3000) requestAnimationFrame(frame);
            else w.__open.done = true;
          };
          requestAnimationFrame(frame);
        },
        { once: true, capture: true },
      );
    });
    if (profile) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
    }
    // The Today tab stays mounted (behind), so take the Trips screen's copy (later in the DOM).
    await page.getByText(name, { exact: true }).last().click();
    await page.waitForFunction(() => window.__open.done, null, { polling: 100, timeout: 120000 });
    let prof = null;
    if (profile) {
      prof = (await cdp.send('Profiler.stop')).profile;
      await cdp.send('Profiler.disable');
    }
    const r = await page.evaluate(() => {
      const w = window;
      const t0 = w.__open.t0;
      const ss = w.__open.samples;
      const final = ss[ss.length - 1].cards;
      const first = ss.find((x) => x.cards > 0);
      const full = ss.find((x) => x.cards === final && x.del);
      const lt = w.__perf.longtasks.filter((x) => x.start >= t0 - 5);
      return {
        firstMs: first ? first.t : NaN,
        fullMs: full ? full.t : NaN,
        timelines: final,
        longTasks: lt.length,
        maxLongTaskMs: lt.reduce((m, x) => Math.max(m, x.dur), 0),
        totalLongTaskMs: lt.reduce((m, x) => m + x.dur, 0),
        commits: w.__perf.commits.length,
      };
    });
    return { ...r, prof };
  }

  async function goBack() {
    await page.evaluate(() => {
      window.__perf.longtasks.length = 0;
      window.__back = performance.now();
    });
    await page.goBack();
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll('[role="button"]')).find((e) => e.textContent === 'Delete trip' && e.offsetParent) &&
        !!Array.from(document.querySelectorAll('[role="button"]')).find((e) => e.textContent === 'New trip' && e.offsetParent),
      null,
      { polling: 'raf', timeout: 60000 },
    );
    const r = await page.evaluate(() => ({
      backMs: performance.now() - window.__back,
      maxLongTaskMs: window.__perf.longtasks.reduce((m, x) => Math.max(m, x.dur), 0),
    }));
    await page.waitForTimeout(800);
    return r;
  }

  const out = { target: TARGET, cpu: CPU, base, opens: {}, back: [], scroll: null, idle: null, hotspots: null };

  // (a) + (d)
  for (const t of s.trips) {
    out.opens[t.name] = [];
    for (let i = 0; i < OPENS; i++) {
      const doProfile = args.profile && t.id === (args['profile-trip'] || 'perf-syd') && i === (args['profile-trip'] ? 1 : 0);
      const r = await openTrip(t.name, { profile: doProfile });
      if (r.prof) {
        fs.writeFileSync(args.profile, JSON.stringify(r.prof));
        out.hotspots = hotspots(r.prof);
      }
      delete r.prof;
      out.opens[t.name].push(r);
      out.back.push(await goBack());
    }
  }

  // (b) scroll jank on the long plan.
  await openTrip('Paris to Sydney');
  out.scroll = await page.evaluate(async () => {
    const w = window;
    // The plan's ScrollView: the visible scrollable element with the most content.
    const cands = Array.from(document.querySelectorAll('div')).filter((d) => {
      const cs = getComputedStyle(d);
      return d.offsetParent && /(auto|scroll)/.test(cs.overflowY) && d.scrollHeight > d.clientHeight + 100;
    });
    cands.sort((a, b) => b.scrollHeight - a.scrollHeight);
    const sc = cands[0];
    if (!sc) return { error: 'no scroller' };
    sc.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 300));
    w.__perf.longtasks.length = 0;
    const gaps = [];
    let last = performance.now();
    const t0 = last;
    const total = sc.scrollHeight - sc.clientHeight;
    const step = 60; // px per frame (a brisk fling)
    await new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        gaps.push(now - last);
        last = now;
        if (sc.scrollTop >= total - 1) return resolve();
        sc.scrollTop = Math.min(total, sc.scrollTop + step);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // and back up
    await new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        gaps.push(now - last);
        last = now;
        if (sc.scrollTop <= 0) return resolve();
        sc.scrollTop = Math.max(0, sc.scrollTop - step);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const lt = w.__perf.longtasks.filter((x) => x.start >= t0);
    gaps.shift();
    const sorted = [...gaps].sort((a, b) => a - b);
    return {
      scrollHeight: sc.scrollHeight,
      frames: gaps.length,
      medianFrameMs: +sorted[Math.floor(sorted.length / 2)].toFixed(1),
      p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
      maxFrameMs: +sorted[sorted.length - 1].toFixed(1),
      framesOver50: gaps.filter((g) => g > 50).length,
      longTasks: lt.length,
      maxLongTaskMs: lt.reduce((m, x) => Math.max(m, x.dur), 0),
    };
  });

  // (c) idle on the plan view: what does each useNow tick cost?
  if (IDLE_S > 0) {
    await page.evaluate(() => {
      window.__perf.countFibers = true;
      window.__perf.ticks.length = 0;
      window.__perf.commits.length = 0;
      window.__perf.longtasks.length = 0;
    });
    if (args.profile) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
    }
    await page.waitForTimeout(IDLE_S * 1000);
    if (args.profile) {
      const prof = (await cdp.send('Profiler.stop')).profile;
      await cdp.send('Profiler.disable');
      fs.writeFileSync(args.profile.replace(/(\.\w+)?$/, '.idle$1'), JSON.stringify(prof));
      out.idleHotspots = hotspots(prof);
    }
    out.idle = await page.evaluate(() => {
      const p = window.__perf;
      // Pair each tick with the commits that follow it within 1 s.
      const ticks = p.ticks.map((t) => {
        const cs = p.commits.filter((c) => c.t >= t.t && c.t < t.t + 1000);
        return {
          commits: cs.length,
          componentsRendered: cs.reduce((m, c) => m + Math.max(0, c.rendered), 0),
          tickToCommitMs: cs.length ? +(cs[cs.length - 1].t - t.t).toFixed(1) : null,
        };
      });
      const durs = ticks.map((t) => t.tickToCommitMs).filter((x) => x != null);
      const sorted = [...durs].sort((a, b) => a - b);
      return {
        tickToCommitMs: durs.length
          ? { n: durs.length, min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1] }
          : null,
        componentsPerTick: ticks.length ? Math.max(...ticks.map((t) => t.componentsRendered)) : 0,
        seconds: null,
        intervalCallbacks: p.ticks.length,
        commits: p.commits.length,
        ticks,
        longTasks: p.longtasks.length,
        maxLongTaskMs: p.longtasks.reduce((m, x) => Math.max(m, x.dur), 0),
      };
    });
    out.idle.seconds = IDLE_S;
  }

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await browser.close();
  server?.srv.close();

  // Summary
  const summary = {};
  for (const [name, rs] of Object.entries(out.opens)) {
    summary[name] = {
      firstOpen: { firstContentMs: +rs[0].firstMs.toFixed(0), fullMs: +rs[0].fullMs.toFixed(0), maxLongTaskMs: +rs[0].maxLongTaskMs.toFixed(0) },
      timelines: rs[0].timelines,
      repeat: { firstContentMs: stats(rs.slice(1).map((r) => r.firstMs)), fullMs: stats(rs.slice(1).map((r) => r.fullMs)), maxLongTaskMs: stats(rs.slice(1).map((r) => r.maxLongTaskMs)) },
      commitsPerOpen: rs.map((r) => r.commits),
    };
  }
  out.summary = summary;
  out.backSummary = { backMs: stats(out.back.map((b) => b.backMs)), maxLongTaskMs: stats(out.back.map((b) => b.maxLongTaskMs)) };
  out.errors = errors.slice(0, 10);
  console.log(JSON.stringify({ target: TARGET, cpu: CPU, summary, back: out.backSummary, scroll: out.scroll, idle: out.idle, hotspots: out.hotspots, idleHotspots: out.idleHotspots, errors: out.errors }, null, 2));
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(out, null, 2));
}

/**
 * Top self-time and inclusive-time functions of a CDP CPU profile. When the bundle has a source
 * map (export with --source-maps), frames are mapped back to the original file and line.
 */
function hotspots(profile, top = 25) {
  let mapFor = () => null;
  try {
    const { TraceMap, originalPositionFor } = require(path.resolve(here, '../../node_modules/@jridgewell/trace-mapping'));
    const maps = new Map();
    mapFor = (url, line, col) => {
      if (!/\.js(\?|$)/.test(url)) return null;
      const rel = new URL(url).pathname;
      if (!maps.has(rel)) {
        const f = path.join(DIST, rel + '.map');
        maps.set(rel, fs.existsSync(f) ? new TraceMap(fs.readFileSync(f, 'utf8')) : null);
      }
      const m = maps.get(rel);
      if (!m) return null;
      const o = originalPositionFor(m, { line: line + 1, column: col });
      return o.source ? `${o.name ?? ''} ${o.source.replace(/^.*?(node_modules\/|src\/)/, '$1')}:${o.line}` : null;
    };
  } catch {}
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const keyOf = (n) => {
    const cf = n.callFrame;
    const mapped = cf.url && TARGET === 'prod' ? mapFor(cf.url, cf.lineNumber, cf.columnNumber) : null;
    return mapped ?? `${cf.functionName || '(anonymous)'} ${cf.url.split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`;
  };
  const selfById = new Map();
  const dt = profile.timeDeltas;
  const total = dt.reduce((a, b) => a + b, 0);
  profile.samples.forEach((id, i) => selfById.set(id, (selfById.get(id) || 0) + (dt[i] || 0)));
  const self = new Map();
  for (const [id, v] of selfById) {
    const k = keyOf(byId.get(id));
    self.set(k, (self.get(k) || 0) + v);
  }
  // Inclusive time per function, counting each function once per stack (recursion-safe).
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const incl = new Map();
  for (const [id, v] of selfById) {
    const seen = new Set();
    for (let cur = id; cur != null; cur = parent.get(cur)) {
      const k = keyOf(byId.get(cur));
      if (seen.has(k)) continue;
      seen.add(k);
      incl.set(k, (incl.get(k) || 0) + v);
    }
  }
  const fmt = (m) =>
    [...m.entries()]
      .filter(([k]) => !/^\((root|idle|program|garbage collector)\)/.test(k))
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([k, v]) => `${(v / 1000).toFixed(1)}ms ${k}`);
  return {
    totalMs: +(total / 1000).toFixed(0),
    idleMs: +((self.get('(idle) :0') || 0) / 1000).toFixed(0),
    programMs: +((self.get('(program) :0') || 0) / 1000).toFixed(0),
    gcMs: +((self.get('(garbage collector) :0') || 0) / 1000).toFixed(0),
    self: fmt(self),
    inclusive: fmt(incl),
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
