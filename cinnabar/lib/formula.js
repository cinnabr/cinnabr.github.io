/* Cinnabar Sheets formula engine: tokenizer → parser → evaluator.
   Values: number | string | boolean | null (empty) | CErr | Range (2-D array). Dates are serial numbers (days since 1899-12-30). */
"use strict";
class CErr { constructor(code) { this.code = code; } toString() { return this.code; } }
const FX = (() => {
  const colName = c => { let s = ""; c++; while (c) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
  const colIndex = s => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const addr = (r, c) => colName(c) + (r + 1);
  const parseAddr = s => { const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(s); return m ? { r: +m[2] - 1, c: colIndex(m[1]) } : null; };

  /* tokens */
  const TOK = /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+)|("(?:[^"]|"")*")|((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)(?![\w(])|([A-Za-z_][\w.]*)|(<>|<=|>=|[-+*/^&=<>%(),;:{}]))/y;
  function tokenize(src) {
    const out = []; TOK.lastIndex = 0;
    while (TOK.lastIndex < src.length) {
      if (/^\s*$/.test(src.slice(TOK.lastIndex))) break;
      const at = TOK.lastIndex, m = TOK.exec(src);
      if (!m) throw new CErr("#ERROR!");
      if (m[1] != null) out.push({ t: "num", v: parseFloat(m[1]) });
      else if (m[2] != null) out.push({ t: "str", v: m[2].slice(1, -1).replace(/""/g, '"') });
      else if (m[4] != null) out.push({ t: "ref", sheet: m[3] ? m[3].slice(0, -1).replace(/^'|'$/g, "").replace(/''/g, "'") : null, v: m[4] });
      else if (m[5] != null) out.push({ t: "id", v: m[5] });
      else out.push({ t: "op", v: m[6] === ";" ? "," : m[6] });
      if (TOK.lastIndex === at) throw new CErr("#ERROR!");
    }
    return out;
  }

  /* parser: comparison < concat < additive < multiplicative < power < unary < percent < primary */
  function parse(src) {
    const toks = tokenize(src); let i = 0;
    const peek = () => toks[i], isOp = v => toks[i]?.t === "op" && toks[i].v === v;
    const eat = v => { if (!isOp(v)) throw new CErr("#ERROR!"); i++; };
    const bin = (next, ops) => () => { let a = next(); while (toks[i]?.t === "op" && ops.includes(toks[i].v)) { const op = toks[i++].v; a = { t: "bin", op, a, b: next() }; } return a; };
    const primary = () => {
      const k = toks[i++];
      if (!k) throw new CErr("#ERROR!");
      if (k.t === "num") return { t: "num", v: k.v };
      if (k.t === "str") return { t: "str", v: k.v };
      if (k.t === "ref") {
        const [a, b] = k.v.split(":").map(parseAddr);
        return b ? { t: "range", sheet: k.sheet, r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) } : { t: "ref", sheet: k.sheet, r: a.r, c: a.c };
      }
      if (k.t === "id") {
        const name = k.v.toUpperCase();
        if (isOp("(")) {
          i++; const args = [];
          if (!isOp(")")) { do { args.push(isOp(",") || isOp(")") ? { t: "empty" } : expr()); } while (isOp(",") && ++i); }
          eat(")"); return { t: "fn", name, args };
        }
        if (name === "TRUE" || name === "FALSE") return { t: "bool", v: name === "TRUE" };
        throw new CErr("#NAME?");
      }
      if (k.v === "(") { const e = expr(); eat(")"); return e; }
      if (k.v === "{") { const row = []; do { row.push(expr()); } while (isOp(",") && ++i); eat("}"); return { t: "arr", items: row }; }
      throw new CErr("#ERROR!");
    };
    const pct = () => { let a = primary(); while (isOp("%")) { i++; a = { t: "pct", a }; } return a; };
    const unary = () => { if (isOp("-") || isOp("+")) { const op = toks[i++].v; return { t: "un", op, a: unary() }; } return pct(); };
    const power = () => { const a = unary(); if (isOp("^")) { i++; return { t: "bin", op: "^", a, b: power() }; } return a; };
    const mul = bin(power, ["*", "/"]), add = bin(mul, ["+", "-"]), cat = bin(add, ["&"]), cmp = bin(cat, ["=", "<>", "<", ">", "<=", ">="]);
    const expr = cmp;
    const e = expr();
    if (i < toks.length) throw new CErr("#ERROR!");
    return e;
  }

  /* coercion helpers */
  const isErr = v => v instanceof CErr;
  const num = v => {
    if (isErr(v)) throw v;
    if (v == null || v === "") return 0;
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return +v;
    if (Array.isArray(v)) return num(v[0]?.[0]);
    const n = Number(String(v).replace(/,/g, "").trim());
    if (String(v).trim() !== "" && !isNaN(n)) return n;
    throw new CErr("#VALUE!");
  };
  const str = v => { if (isErr(v)) throw v; if (v == null) return ""; if (typeof v === "boolean") return v ? "TRUE" : "FALSE"; if (Array.isArray(v)) return str(v[0]?.[0]); if (typeof v === "number") return String(+v.toPrecision(15)); return String(v); };
  const bool = v => { if (isErr(v)) throw v; if (typeof v === "string") { const u = v.toUpperCase(); if (u === "TRUE") return true; if (u === "FALSE") return false; throw new CErr("#VALUE!"); } if (Array.isArray(v)) return bool(v[0]?.[0]); return !!num(v); };
  const flat = args => { const out = []; for (const a of args) { if (Array.isArray(a)) for (const row of a) for (const x of row) out.push({ v: x, ref: true }); else out.push({ v: a, ref: false }); } return out; };
  const nums = args => { const out = []; for (const { v, ref } of flat(args)) { if (isErr(v)) throw v; if (ref) { if (typeof v === "number") out.push(v); } else if (v != null) out.push(num(v)); } return out; };
  const scalar = v => (Array.isArray(v) ? v[0]?.[0] ?? null : v);
  const toSerial = d => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 864e5;
  const fromSerial = s => { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(s) * 864e5); return d; };
  function crit(c) {
    if (typeof c === "number" || typeof c === "boolean") return v => v === c || (typeof v === "string" && v !== "" && Number(v) === c);
    const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(String(c ?? "")); const op = m[1] || "="; const rhs = m[2]; const n = rhs.trim() !== "" && !isNaN(Number(rhs)) ? Number(rhs) : null;
    const wild = rhs.includes("*") || rhs.includes("?") ? new RegExp("^" + rhs.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i") : null;
    return v => {
      if (n != null && typeof v === "number") return { "=": v === n, "<>": v !== n, "<": v < n, ">": v > n, "<=": v <= n, ">=": v >= n }[op];
      const s = v == null ? "" : String(v);
      if (op === "=") return wild ? wild.test(s) : s.toLowerCase() === rhs.toLowerCase();
      if (op === "<>") return wild ? !wild.test(s) : s.toLowerCase() !== rhs.toLowerCase();
      if (n != null) return false;
      return { "<": s < rhs, ">": s > rhs, "<=": s <= rhs, ">=": s >= rhs }[op];
    };
  }
  const round = (x, d) => { const f = 10 ** d; return Math.round((x + Math.sign(x) * Number.EPSILON) * f) / f; };
  const stdev = (a, pop) => { if (a.length < (pop ? 1 : 2)) throw new CErr("#DIV/0!"); const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - (pop ? 0 : 1))); };

  /* functions; L = lazily evaluated args */
  const F = {
    SUM: a => nums(a).reduce((s, x) => s + x, 0),
    AVERAGE: a => { const n = nums(a); if (!n.length) throw new CErr("#DIV/0!"); return n.reduce((s, x) => s + x, 0) / n.length; },
    MIN: a => { const n = nums(a); return n.length ? Math.min(...n) : 0; },
    MAX: a => { const n = nums(a); return n.length ? Math.max(...n) : 0; },
    COUNT: a => flat(a).filter(({ v, ref }) => typeof v === "number" || (!ref && v != null && !isNaN(Number(v)) && v !== "")).length,
    COUNTA: a => flat(a).filter(({ v }) => v != null && v !== "").length,
    COUNTBLANK: a => flat(a).filter(({ v }) => v == null || v === "").length,
    PRODUCT: a => nums(a).reduce((s, x) => s * x, 1),
    MEDIAN: a => { const n = nums(a).sort((x, y) => x - y); if (!n.length) throw new CErr("#NUM!"); const h = n.length >> 1; return n.length % 2 ? n[h] : (n[h - 1] + n[h]) / 2; },
    STDEV: a => stdev(nums(a), false), STDEVP: a => stdev(nums(a), true), VAR: a => stdev(nums(a), false) ** 2,
    ROUND: ([x, d]) => round(num(x), num(d ?? 0)), ROUNDUP: ([x, d]) => { const f = 10 ** num(d ?? 0), v = num(x); return Math.sign(v) * Math.ceil(Math.abs(v) * f) / f; },
    ROUNDDOWN: ([x, d]) => { const f = 10 ** num(d ?? 0), v = num(x); return Math.sign(v) * Math.floor(Math.abs(v) * f) / f; },
    INT: ([x]) => Math.floor(num(x)), ABS: ([x]) => Math.abs(num(x)), SIGN: ([x]) => Math.sign(num(x)),
    SQRT: ([x]) => { const v = num(x); if (v < 0) throw new CErr("#NUM!"); return Math.sqrt(v); },
    POWER: ([x, y]) => num(x) ** num(y), EXP: ([x]) => Math.exp(num(x)), LN: ([x]) => { const v = num(x); if (v <= 0) throw new CErr("#NUM!"); return Math.log(v); },
    LOG10: ([x]) => Math.log10(num(x)), LOG: ([x, b]) => Math.log(num(x)) / Math.log(b == null ? 10 : num(b)),
    MOD: ([x, y]) => { const d = num(y); if (!d) throw new CErr("#DIV/0!"); const v = num(x); return v - d * Math.floor(v / d); },
    PI: () => Math.PI, RAND: () => Math.random(), RANDBETWEEN: ([a, b]) => Math.floor(num(a) + Math.random() * (num(b) - num(a) + 1)),
    CEILING: ([x, s]) => { const f = num(s ?? 1); return f ? Math.ceil(num(x) / f) * f : 0; }, FLOOR: ([x, s]) => { const f = num(s ?? 1); return f ? Math.floor(num(x) / f) * f : 0; },
    AND: a => flat(a).filter(({ v }) => v != null && v !== "").every(({ v }) => bool(v)), OR: a => flat(a).filter(({ v }) => v != null && v !== "").some(({ v }) => bool(v)),
    NOT: ([x]) => !bool(x), XOR: a => flat(a).filter(({ v }) => v != null && v !== "" && bool(v)).length % 2 === 1,
    CONCAT: a => flat(a).map(({ v }) => str(v)).join(""), CONCATENATE: a => flat(a).map(({ v }) => str(v)).join(""),
    TEXTJOIN: ([d, skip, ...rest]) => flat(rest).map(({ v }) => str(v)).filter(s => !bool(skip) || s !== "").join(str(d)),
    LEN: ([x]) => str(x).length, UPPER: ([x]) => str(x).toUpperCase(), LOWER: ([x]) => str(x).toLowerCase(),
    PROPER: ([x]) => str(x).toLowerCase().replace(/(^|[^a-z'])([a-z])/g, (m, p, c) => p + c.toUpperCase()), TRIM: ([x]) => str(x).trim().replace(/\s+/g, " "),
    LEFT: ([x, n]) => str(x).slice(0, n == null ? 1 : num(n)), RIGHT: ([x, n]) => { const s = str(x), k = n == null ? 1 : num(n); return k ? s.slice(-k) : ""; },
    MID: ([x, s, n]) => str(x).substr(num(s) - 1, num(n)), REPT: ([x, n]) => str(x).repeat(Math.max(0, num(n))),
    SUBSTITUTE: ([x, a, b]) => str(x).split(str(a)).join(str(b)),
    FIND: ([a, x, s]) => { const i = str(x).indexOf(str(a), (s == null ? 1 : num(s)) - 1); if (i < 0) throw new CErr("#VALUE!"); return i + 1; },
    SEARCH: ([a, x, s]) => { const i = str(x).toLowerCase().indexOf(str(a).toLowerCase(), (s == null ? 1 : num(s)) - 1); if (i < 0) throw new CErr("#VALUE!"); return i + 1; },
    VALUE: ([x]) => num(x), TEXT: ([x, f]) => FX.format(num(x), { "0": "int", "0.00": "num", "$0.00": "cur", "0%": "pct", "0.00%": "pct" }[str(f)] || (/[dmy]/i.test(str(f)) ? "date" : "num")),
    NOW: () => (Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5 + 25569, TODAY: () => toSerial(new Date()),
    DATE: ([y, m, d]) => toSerial(new Date(num(y), num(m) - 1, num(d))),
    YEAR: ([x]) => fromSerial(num(x)).getUTCFullYear(), MONTH: ([x]) => fromSerial(num(x)).getUTCMonth() + 1, DAY: ([x]) => fromSerial(num(x)).getUTCDate(),
    WEEKDAY: ([x]) => fromSerial(num(x)).getUTCDay() + 1, DAYS: ([a, b]) => Math.floor(num(a)) - Math.floor(num(b)),
    SUMIF: ([r, c, s]) => { const f = crit(scalar(c)), R = r || [[]], S = Array.isArray(s) ? s : R; let t = 0; R.forEach((row, i) => row.forEach((v, j) => { if (f(v)) { const x = S[i]?.[j]; if (typeof x === "number") t += x; } })); return t; },
    COUNTIF: ([r, c]) => { const f = crit(scalar(c)); return flat([r]).filter(({ v }) => f(v)).length; },
    AVERAGEIF: ([r, c, s]) => { const f = crit(scalar(c)), R = r || [[]], S = Array.isArray(s) ? s : R; const vals = []; R.forEach((row, i) => row.forEach((v, j) => { if (f(v)) { const x = S[i]?.[j]; if (typeof x === "number") vals.push(x); } })); if (!vals.length) throw new CErr("#DIV/0!"); return vals.reduce((a, b) => a + b, 0) / vals.length; },
    VLOOKUP: ([k, r, ci, approx]) => {
      const key = scalar(k), col = num(ci) - 1, rows = Array.isArray(r) ? r : [[r]];
      if (col < 0 || col >= (rows[0]?.length || 0)) throw new CErr("#REF!");
      const exact = approx != null && !bool(approx);
      if (exact) { const row = rows.find(rw => eq(rw[0], key)); if (!row) throw new CErr("#N/A"); return row[col]; }
      let best = null; for (const rw of rows) { if (rw[0] == null) continue; if (cmp(rw[0], key) <= 0) best = rw; else break; }
      if (!best) throw new CErr("#N/A"); return best[col];
    },
    HLOOKUP: ([k, r, ri, approx]) => { const t = (Array.isArray(r) ? r : [[r]]); const tr = t[0].map((_, j) => t.map(row => row[j])); return F.VLOOKUP([k, tr, ri, approx]); },
    INDEX: ([r, ri, ci]) => { const rows = Array.isArray(r) ? r : [[r]]; const i = num(ri ?? 1) - 1, j = num(ci ?? 1) - 1; const row = rows.length === 1 && ci == null ? rows[0] : rows[i]; const v = rows.length === 1 && ci == null ? row?.[i] : row?.[j]; if (v === undefined) throw new CErr("#REF!"); return v; },
    MATCH: ([k, r, t]) => { const key = scalar(k), list = flat([r]).map(x => x.v), type = t == null ? 1 : num(t); if (type === 0) { const i = list.findIndex(v => eq(v, key)); if (i < 0) throw new CErr("#N/A"); return i + 1; } let b = -1; list.forEach((v, i) => { if (v != null && (type > 0 ? cmp(v, key) <= 0 : cmp(v, key) >= 0)) b = i; }); if (b < 0) throw new CErr("#N/A"); return b + 1; },
    ISBLANK: ([x]) => scalar(x) == null || scalar(x) === "", ISNUMBER: ([x]) => typeof scalar(x) === "number", ISTEXT: ([x]) => typeof scalar(x) === "string" && scalar(x) !== "",
    ISERROR: ([x]) => isErr(x), N: ([x]) => (typeof scalar(x) === "number" ? scalar(x) : 0), ROWS: ([r]) => (Array.isArray(r) ? r.length : 1), COLUMNS: ([r]) => (Array.isArray(r) ? r[0].length : 1),
    CHOOSE: ([i, ...opts]) => { const k = num(i); if (k < 1 || k > opts.length) throw new CErr("#VALUE!"); return opts[k - 1]; },
    SUMPRODUCT: a => { const arrs = a.map(x => flat([x]).map(y => (typeof y.v === "number" ? y.v : 0))); const n = arrs[0]?.length || 0; if (arrs.some(x => x.length !== n)) throw new CErr("#VALUE!"); let t = 0; for (let i = 0; i < n; i++) t += arrs.reduce((p, x) => p * x[i], 1); return t; },
  };
  const LAZY = new Set(["IF", "IFERROR", "IFNA", "IFS", "ISERROR", "SWITCH"]);
  const cmp = (a, b) => { if (typeof a === "number" && typeof b === "number") return a - b; if (typeof a === "number") return -1; if (typeof b === "number") return 1; const x = str(a).toLowerCase(), y = str(b).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; };
  const eq = (a, b) => { if (a == null) a = ""; if (b == null) b = ""; if (typeof a === "number" && typeof b === "number") return a === b; if (typeof a === "boolean" || typeof b === "boolean") return a === b; return str(a).toLowerCase() === str(b).toLowerCase(); };

  /* evaluation; env = { get(sheet, r, c), range(sheet, r1, c1, r2, c2) } */
  function ev(n, env) {
    switch (n.t) {
      case "num": case "str": case "bool": return n.v;
      case "empty": return null;
      case "ref": return env.get(n.sheet, n.r, n.c);
      case "range": return env.range(n.sheet, n.r1, n.c1, n.r2, n.c2);
      case "arr": return [n.items.map(x => scalar(ev(x, env)))];
      case "pct": return num(scalar(ev(n.a, env))) / 100;
      case "un": { const v = num(scalar(ev(n.a, env))); return n.op === "-" ? -v : v; }
      case "bin": {
        const a = scalar(ev(n.a, env)), b = scalar(ev(n.b, env));
        if (isErr(a)) throw a; if (isErr(b)) throw b;
        switch (n.op) {
          case "+": return num(a) + num(b); case "-": return num(a) - num(b); case "*": return num(a) * num(b);
          case "/": { const d = num(b); if (d === 0) throw new CErr("#DIV/0!"); return num(a) / d; }
          case "^": return num(a) ** num(b); case "&": return str(a) + str(b);
          case "=": return eq(a, b); case "<>": return !eq(a, b);
          case "<": return cmp(a ?? 0, b ?? 0) < 0; case ">": return cmp(a ?? 0, b ?? 0) > 0; case "<=": return cmp(a ?? 0, b ?? 0) <= 0; case ">=": return cmp(a ?? 0, b ?? 0) >= 0;
        }
      }
      case "fn": {
        const name = n.name;
        if (LAZY.has(name)) {
          const val = x => { try { const v = ev(x, env); return v; } catch (e) { if (isErr(e)) return e; throw e; } };
          if (name === "IF") return bool(scalar(ev(n.args[0], env))) ? (n.args[1] ? ev(n.args[1], env) : true) : (n.args[2] ? ev(n.args[2], env) : false);
          if (name === "IFERROR") { const v = val(n.args[0]); return isErr(v) ? ev(n.args[1], env) : v; }
          if (name === "IFNA") { const v = val(n.args[0]); return isErr(v) && v.code === "#N/A" ? ev(n.args[1], env) : v; }
          if (name === "ISERROR") return isErr(val(n.args[0]));
          if (name === "IFS") { for (let i = 0; i + 1 < n.args.length; i += 2) if (bool(scalar(ev(n.args[i], env)))) return ev(n.args[i + 1], env); throw new CErr("#N/A"); }
          if (name === "SWITCH") { const k = scalar(ev(n.args[0], env)); let i = 1; for (; i + 1 < n.args.length; i += 2) if (eq(scalar(ev(n.args[i], env)), k)) return ev(n.args[i + 1], env); if (i < n.args.length) return ev(n.args[i], env); throw new CErr("#N/A"); }
        }
        const f = F[name];
        if (!f) throw new CErr("#NAME?");
        return f(n.args.map(a => ev(a, env)));
      }
    }
    throw new CErr("#ERROR!");
  }

  /* public: evaluate a formula string (without "=") */
  const cache = new Map();
  function evaluate(src, env) {
    try {
      let ast = cache.get(src);
      if (!ast) { ast = parse(src); if (cache.size > 5000) cache.clear(); cache.set(src, ast); }
      let v = ev(ast, env);
      if (Array.isArray(v)) v = v[0]?.[0] ?? null;
      if (typeof v === "number" && !isFinite(v)) return new CErr("#NUM!");
      return v;
    } catch (e) { if (isErr(e)) return e; if (e instanceof RangeError) return new CErr("#CYCLE!"); console.error(e); return new CErr("#ERROR!"); }
  }
  function literal(s) {
    if (s == null || s === "") return null;
    const t = s.trim();
    if (/^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][-+]?\d+)?$/.test(t) && /\d/.test(t)) return Number(t.replace(/,/g, ""));
    if (/^[-+]?\d+(\.\d+)?%$/.test(t)) return Number(t.slice(0, -1)) / 100;
    if (/^\$-?\d+(\.\d+)?$/.test(t)) return Number(t.slice(1));
    if (/^(true|false)$/i.test(t)) return t.toUpperCase() === "TRUE";
    return s.startsWith("'") ? s.slice(1) : s;
  }
  function format(v, fmt) {
    if (v == null) return "";
    if (isErr(v)) return v.code;
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") {
      switch (fmt) {
        case "num": return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        case "int": return Math.round(v).toLocaleString();
        case "cur": return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        case "pct": return (v * 100).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "%";
        case "date": return fromSerial(v).toLocaleDateString(undefined, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
        case "text": return String(v);
        default: return Number.isInteger(v) ? String(v) : String(+v.toPrecision(10));
      }
    }
    return String(v);
  }
  /* rewrite every A1 reference in a formula via fn(r, c, absR, absC) → [r, c] | null (→ #REF!) */
  const REF_RE = /((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![\w(])/g;
  function mapRefs(f, fn) {
    return f.split(/("(?:[^"]|"")*")/).map((part, i) => (i % 2 ? part : part.replace(REF_RE, (m, sh, ac, col, ar, row, off, all) => {
      if (off > 0 && /[A-Za-z_\d.$]/.test(all[off - 1])) return m;
      const r = +row - 1, c = colIndex(col);
      const res = fn(r, c, !!ar, !!ac, sh ? sh.slice(0, -1) : null);
      if (!res) return (sh || "") + "#REF!";
      return (sh || "") + ac + colName(res[1]) + ar + (res[0] + 1);
    }))).join("");
  }
  const shift = (f, dr, dc) => mapRefs(f, (r, c, ar, ac) => { const nr = ar ? r : r + dr, nc = ac ? c : c + dc; return nr < 0 || nc < 0 ? null : [nr, nc]; });
  return { parse, evaluate, literal, format, colName, colIndex, addr, parseAddr, mapRefs, shift, functions: Object.keys(F).concat([...LAZY]).sort() };
})();
