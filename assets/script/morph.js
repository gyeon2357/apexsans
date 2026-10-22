(function (global) {
  "use strict";

  var DEFAULTS = {
    samples: 96,
    duration: 900,

    pairing: "nearest",
    mode: "morph",
    stagger: 0,
    staggerBy: "x",
    fit: "none",
    align: "none",
    viewBox: null,
    easing: function (t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    fill: "currentColor",
    maxSegmentLength: 2,
  useFlubber: false,
  alikeRatio: 2,
    loopDelay: 0,
  cycle: true,
    stepHold: 0,
    onUpdate: null,
    onComplete: null,
  };

  var SVG_NS = "http://www.w3.org/2000/svg";
  var stagingEl = null;

  function staging() {
    if (stagingEl) return stagingEl;
    stagingEl = document.createElement("div");
    stagingEl.setAttribute("aria-hidden", "true");
    stagingEl.style.cssText =
      "position:absolute;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;left:-9999px;top:0";
    document.body.appendChild(stagingEl);
    return stagingEl;
  }

  var svgCache = {};

  function isUrl(src) {
    if (typeof src !== "string") return false;
    return !/^\s*(?:[#<\[]|\.[A-Za-z_-])/.test(src);
  }

  function fetchSvg(url) {
    if (svgCache[url]) return svgCache[url];
    if (typeof fetch !== "function") {
      svgCache[url] = Promise.reject(
        new Error("이 환경에는 fetch가 없습니다: " + url)
      );
      return svgCache[url];
    }
    svgCache[url] = fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error(res.status + " " + res.statusText);
        return res.text();
      })
      .then(function (text) {
        var wrap = document.createElement("div");
        wrap.innerHTML = text.trim();
        var svg = wrap.querySelector("svg");
        if (!svg) throw new Error("파일 안에서 <svg>를 찾지 못했습니다");
        staging().appendChild(svg);
        return svg;
      });
    return svgCache[url];
  }

  function withSources(list, cb) {
    if (!list.some(isUrl)) return cb(list);
    Promise.all(
      list.map(function (src) {
        return isUrl(src) ? fetchSvg(src) : src;
      })
    )
      .then(cb)
      .catch(function (err) {
        console.warn(
          "[ApexMorph] SVG 파일을 불러오지 못했습니다. " +
            "file://로 열면 fetch가 막히니 로컬 서버(python3 serve.py)로 열어주세요.",
          err
        );
      });
  }

  function resolve(target) {
    if (!target) return null;
    if (typeof target === "string") {
      var el = document.querySelector(target);
      return el || null;
    }
    return target;
  }

  function toSvgElement(src) {
    if (typeof src === "string" && src.trim().charAt(0) === "<") {
      var wrap = document.createElement("div");
      wrap.innerHTML = src.trim();
      var found = wrap.querySelector("svg");
      if (!found) return null;
      staging().appendChild(found);
      return found;
    }
    var el = resolve(src);
    if (!el) return null;
    if (el.tagName && el.tagName.toLowerCase() !== "svg") {
      el = el.querySelector("svg");
    }
    if (!el) return null;
    var clone = el.cloneNode(true);
    clone.removeAttribute("id");
    staging().appendChild(clone);
    return clone;
  }

  function viewBoxOf(svg) {
    var vb = svg.getAttribute("viewBox");
    if (vb) {
      var n = vb.trim().split(/[\s,]+/).map(Number);
      if (n.length === 4 && n.every(function (v) { return isFinite(v); })) {
        return { x: n[0], y: n[1], w: n[2], h: n[3] };
      }
    }
    var b;
    try {
      b = svg.getBBox();
    } catch (e) {
      b = { x: 0, y: 0, width: 100, height: 100 };
    }
    return { x: b.x, y: b.y, w: b.width || 100, h: b.height || 100 };
  }

  function splitSubpaths(d) {
    if (!d) return null;
    var body = d.trim();
    var moves = body.slice(1).match(/[Mm]/g);
    if (!moves || !moves.length) return [body];
    if (moves.indexOf("m") !== -1) return [body];
    var parts = [];
    var last = 0;
    for (var i = 1; i < body.length; i++) {
      if (body.charAt(i) === "M") {
        parts.push(body.slice(last, i));
        last = i;
      }
    }
    parts.push(body.slice(last));
    return parts.filter(function (x) {
      return x.trim().length > 1;
    });
  }

  function collectShapes(svg) {
    var nodes = svg.querySelectorAll(
      "path:not([data-morph-tmp]),rect,circle,ellipse,polygon,polyline,line"
    );
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (typeof el.getTotalLength !== "function") continue;

      var rings = [];
      var isPath = el.tagName.toLowerCase() === "path";
      var rawD = rawPathData(el);
      var d = isPath ? (el.getAttribute("d") || "") : rawD;
      var parts = d ? splitSubpaths(d) : null;

      if (parts && (parts.length > 1 || !isPath)) {
        for (var k = 0; k < parts.length; k++) {
          var seg = document.createElementNS(SVG_NS, "path");
          seg.setAttribute("d", parts[k]);
          seg.setAttribute("data-morph-tmp", "1");
          el.parentNode.appendChild(seg);
          try {
            if (seg.getTotalLength() > 0) rings.push(seg);
          } catch (e) {
          }
        }
      }
      if (!rings.length) {
        try {
          if (el.getTotalLength() > 0) rings.push(el);
        } catch (e) {
        }
      }
      if (!rings.length) continue;

      out.push({
        el: el,
        rings: rings,
        rawD: rawD,
        fillRule: (el.getAttribute && el.getAttribute("fill-rule")) || "nonzero",
      });
    }
    return out;
  }

  function collectRaw(svg) {
    var nodes = svg.querySelectorAll(
      "path:not([data-morph-tmp]),rect,circle,ellipse,polygon,polyline,line"
    );
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var d = rawPathData(nodes[i]);
      if (!d) continue;
      out.push({
        d: d,
        fillRule: nodes[i].getAttribute("fill-rule") || "nonzero",
      });
    }
    return out;
  }

  function rawPathData(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === "path") return el.getAttribute("d") || null;
    var n = function (a) {
      return parseFloat(el.getAttribute(a) || "0");
    };
    if (tag === "rect") {
      if (el.getAttribute("rx") || el.getAttribute("ry")) return null;
      var x = n("x"), y = n("y"), w = n("width"), h = n("height");
      return "M" + x + "," + y + "H" + (x + w) + "V" + (y + h) + "H" + x + "Z";
    }
    if (tag === "polygon" || tag === "polyline") {
      return pointsToPath(el.getAttribute("points"), tag === "polygon");
    }
    if (tag === "circle" || tag === "ellipse") {
      var cx = n("cx"), cy = n("cy");
      var rx2 = tag === "circle" ? n("r") : n("rx");
      var ry2 = tag === "circle" ? n("r") : n("ry");
      if (!(rx2 > 0) || !(ry2 > 0)) return null;
      return (
        "M" + (cx - rx2) + "," + cy +
        "a" + rx2 + "," + ry2 + " 0 1,0 " + rx2 * 2 + ",0" +
        "a" + rx2 + "," + ry2 + " 0 1,0 " + -rx2 * 2 + ",0Z"
      );
    }
    if (tag === "line") {
      return "M" + n("x1") + "," + n("y1") + "L" + n("x2") + "," + n("y2");
    }
    return null;
  }

  function pointsToPath(points, close) {
    var n = (points || "")
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter(function (v) {
        return isFinite(v);
      });
    if (n.length < 4) return null;
    var d = "M" + n[0] + "," + n[1];
    for (var i = 2; i + 1 < n.length; i += 2) {
      d += "L" + n[i] + "," + n[i + 1];
    }
    return close ? d + "Z" : d;
  }

  var PREPARE_LEAD_MS = 1200;
  var PREPARE_GAP_MS = 900;
  var prepareQueue = 0;

  var sampleCache = typeof Map === "function" ? new Map() : null;

  function cachedRingPoints(key, shapes, count) {
    function fresh() {
      return shapes.map(function (shape) {
        return shape.rings.map(function (el) { return sample(el, count); });
      });
    }
    if (!sampleCache || key == null) return fresh();
    var perSrc = sampleCache.get(key);
    if (!perSrc) { perSrc = {}; sampleCache.set(key, perSrc); }
    if (!perSrc[count]) perSrc[count] = fresh();
    return perSrc[count];
  }

  function sample(el, count) {
    var len = el.getTotalLength();
    var pts = [];
    for (var i = 0; i < count; i++) {
      var p = el.getPointAtLength((len * i) / count);
      pts.push([p.x, p.y]);
    }
    return pts;
  }

  function signedArea(pts) {
    var a = 0;
    for (var i = 0, n = pts.length; i < n; i++) {
      var p = pts[i];
      var q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  function reverseRing(pts) {
    return pts.slice().reverse();
  }

  function centroid(pts) {
    var sx = 0, sy = 0;
    for (var i = 0; i < pts.length; i++) {
      sx += pts[i][0];
      sy += pts[i][1];
    }
    return [sx / pts.length, sy / pts.length];
  }

  function unionVB(list) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    list.forEach(function (v) {
      x0 = Math.min(x0, v.x);
      y0 = Math.min(y0, v.y);
      x1 = Math.max(x1, v.x + v.w);
      y1 = Math.max(y1, v.y + v.h);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function fitTransform(fromVB, toVB) {
    var s = Math.min(fromVB.w / toVB.w, fromVB.h / toVB.h);
    return {
      s: s,
      tx: fromVB.x + (fromVB.w - toVB.w * s) / 2 - toVB.x * s,
      ty: fromVB.y + (fromVB.h - toVB.h * s) / 2 - toVB.y * s,
    };
  }

  function applyTransform(pts, t) {
    return pts.map(function (p) {
      return [p[0] * t.s + t.tx, p[1] * t.s + t.ty];
    });
  }

  function readingOrder(a, b) {
    var ca = a.c, cb = b.c;
    if (Math.abs(ca[0] - cb[0]) > 1) return ca[0] - cb[0];
    return ca[1] - cb[1];
  }

  function pairNearest(fromList, toList) {
    var pairs = [];
    var used = new Array(toList.length);
    var order = fromList.slice().sort(function (a, b) {
      return b.span - a.span;
    });
    order.forEach(function (f) {
      var best = -1;
      var bestD = Infinity;
      for (var i = 0; i < toList.length; i++) {
        if (used[i]) continue;
        var dx = toList[i].c[0] - f.c[0];
        var dy = toList[i].c[1] - f.c[1];
        var d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) {
        used[best] = true;
        pairs.push([f, toList[best]]);
      } else {
        pairs.push([f, null]);
      }
    });
    for (var j = 0; j < toList.length; j++) {
      if (!used[j]) pairs.push([null, toList[j]]);
    }
    return pairs;
  }

  function pairIndex(fromList, toList) {
    var n = Math.max(fromList.length, toList.length);
    var pairs = [];
    for (var i = 0; i < n; i++) pairs.push([fromList[i] || null, toList[i] || null]);
    return pairs;
  }

  function pair(fromList, toList) {
    var pairs = [];
    var usedTo = new Set();

    var toById = new Map();
    toList.forEach(function (item, i) {
      var id = item.el.getAttribute && item.el.getAttribute("data-morph-id");
      if (id) toById.set(id, i);
    });

    var restFrom = [];
    fromList.forEach(function (item) {
      var id = item.el.getAttribute && item.el.getAttribute("data-morph-id");
      if (id && toById.has(id)) {
        var j = toById.get(id);
        pairs.push([item, toList[j]]);
        usedTo.add(j);
      } else {
        restFrom.push(item);
      }
    });

    var restTo = toList.filter(function (_, i) {
      return !usedTo.has(i);
    });

    restFrom.sort(readingOrder);
    restTo.sort(readingOrder);

    var n = Math.max(restFrom.length, restTo.length);
    for (var i = 0; i < n; i++) {
      pairs.push([restFrom[i] || null, restTo[i] || null]);
    }
    return pairs;
  }

  function bboxOf(rings) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    rings.forEach(function (pts) {
      for (var i = 0; i < pts.length; i++) {
        if (pts[i][0] < x0) x0 = pts[i][0];
        if (pts[i][0] > x1) x1 = pts[i][0];
        if (pts[i][1] < y0) y0 = pts[i][1];
        if (pts[i][1] > y1) y1 = pts[i][1];
      }
    });
    if (!isFinite(x0)) return { x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0 };
    var w = Math.max(x1 - x0, 0.001);
    var h = Math.max(y1 - y0, 0.001);
    return { x: x0, y: y0, w: w, h: h, cx: x0 + w / 2, cy: y0 + h / 2 };
  }

  function boxTransform(from, to) {
    var sx = to.w / from.w;
    var sy = to.h / from.h;
    return (
      "translate(" + to.cx.toFixed(3) + "," + to.cy.toFixed(3) + ") " +
      "scale(" + sx.toFixed(4) + "," + sy.toFixed(4) + ") " +
      "translate(" + (-from.cx).toFixed(3) + "," + (-from.cy).toFixed(3) + ")"
    );
  }

  function lerpBox(a, b, t) {
    return {
      w: a.w + (b.w - a.w) * t,
      h: a.h + (b.h - a.h) * t,
      cx: a.cx + (b.cx - a.cx) * t,
      cy: a.cy + (b.cy - a.cy) * t,
    };
  }

  function degenerateFrom(pts) {
    var c = centroid(pts);
    return pts.map(function () {
      return [c[0], c[1]];
    });
  }

  function fallbackInterpolator(a, b) {
    var n = a.length;
    var best = 0;
    var bestCost = Infinity;
    var probes = Math.min(n, 8);
    for (var k = 0; k < probes; k++) {
      var off = Math.round((k * n) / probes);
      var cost = 0;
      for (var i = 0; i < n; i += Math.max(1, Math.floor(n / 24))) {
        var p = a[i];
        var q = b[(i + off) % n];
        cost += (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]);
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = off;
      }
    }
    return function (t) {
      var d = "M";
      for (var i = 0; i < n; i++) {
        var p = a[i];
        var q = b[(i + best) % n];
        var x = p[0] + (q[0] - p[0]) * t;
        var y = p[1] + (q[1] - p[1]) * t;
        d += (i ? "L" : "") + x.toFixed(2) + "," + y.toFixed(2);
      }
      return d + "Z";
    };
  }

  function ringToPath(pts) {
    var d = "M";
    for (var i = 0; i < pts.length; i++) {
      d += (i ? "L" : "") + pts[i][0].toFixed(2) + "," + pts[i][1].toFixed(2);
    }
    return d + "Z";
  }

  function mkPath(parent, fill, d, fillRule, transform) {
    var el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("fill", fill);
    if (transform) el.setAttribute("transform", transform);
    if (fillRule) el.setAttribute("fill-rule", fillRule);
    if (d) el.setAttribute("d", d);
    parent.appendChild(el);
    return el;
  }

  function drawInto(it, d, t) {
    it.path.setAttribute("d", d);
    if (t) it.path.setAttribute("transform", t);
    else it.path.removeAttribute("transform");
  }

  function joinRings(fns, t) {
    var d = "";
    for (var i = 0; i < fns.length; i++) d += fns[i](t);
    return d;
  }

  function makeInterpolator(a, b, opts) {
    var fl = global.flubber;
    if (opts.useFlubber && fl && typeof fl.interpolate === "function") {
      try {
        return fl.interpolate(a, b, { maxSegmentLength: opts.maxSegmentLength });
      } catch (e) {
      }
    }
    return fallbackInterpolator(a, b);
  }

  function create(options) {
    var opt = Object.assign({}, DEFAULTS, options || {});
    if (isUrl(opt.from) || isUrl(opt.to)) {
      console.warn(
        "[ApexMorph] create()에는 파일 경로를 바로 줄 수 없습니다 — " +
          "ApexMorph.load(...)로 먼저 받아오거나 autoplayOnView를 쓰세요."
      );
      return null;
    }
    var fromSvg = toSvgElement(opt.from);
    var toSvg = toSvgElement(opt.to);
    var mount = resolve(opt.mount);
    if (!fromSvg || !toSvg || !mount) {
      console.warn("[ApexMorph] from / to / mount 중 찾지 못한 게 있습니다.", opt);
      return null;
    }

    var fromVB = viewBoxOf(fromSvg);
    var toVB = viewBoxOf(toSvg);
    var fit = opt.fit === "scale" ? fitTransform(fromVB, toVB) : null;

    var alignBox =
      opt.align === "center"
        ? opt.viewBox || unionVB([fromVB, toVB])
        : null;
    function centerIn(box, vb) {
      if (!box) return null;
      var tx = box.x + (box.w - vb.w) / 2 - vb.x;
      var ty = box.y + (box.h - vb.h) / 2 - vb.y;
      if (!tx && !ty) return null;
      return { s: 1, tx: tx, ty: ty };
    }
    var moveFrom = centerIn(alignBox, fromVB);
    var moveTo = fit || centerIn(alignBox, toVB);

    function build(svg, transform, src) {
      var shapes = collectShapes(svg);
      var cachedPts = cachedRingPoints(src, shapes, opt.samples);
      var pureMove = !!transform && transform.s === 1;
      var moveAttr = pureMove
        ? "translate(" + transform.tx + " " + transform.ty + ")"
        : null;
      return shapes.map(function (shape, i) {
        var rings = cachedPts[i].map(function (pts) {
          return transform ? applyTransform(pts, transform) : pts;
        });
        var all = [];
        rings.forEach(function (r) {
          all = all.concat(r);
        });
        var c = centroid(all);
        var span = 0;
        for (var k = 0; k < all.length; k++) {
          var dx = all[k][0] - c[0];
          var dy = all[k][1] - c[1];
          if (dx * dx + dy * dy > span) span = dx * dx + dy * dy;
        }
        return {
          el: shape.el,
          rings: rings,
          rawD: transform && !pureMove ? null : shape.rawD,
          rawT: moveAttr,
          fillRule: shape.fillRule,
          c: c,
          span: Math.sqrt(span),
          i: i,
        };
      });
    }

    var fromList = build(fromSvg, moveFrom, opt.from);
    var toList = build(toSvg, moveTo, opt.to);

    if (!fromList.length || !toList.length) {
      console.warn("[ApexMorph] 샘플링할 도형을 찾지 못했습니다.");
      return null;
    }

    var pairs =
      opt.pairing === "reading"
        ? pair(fromList, toList)
        : opt.pairing === "index"
        ? pairIndex(fromList, toList)
        : pairNearest(fromList, toList);

    var outVB =
      opt.viewBox || (opt.fit === "scale" ? fromVB : unionVB([fromVB, toVB]));
    var out = document.createElementNS(SVG_NS, "svg");
    out.setAttribute("viewBox", [outVB.x, outVB.y, outVB.w, outVB.h].join(" "));
    out.setAttribute("xmlns", SVG_NS);
    out.setAttribute("preserveAspectRatio", "xMidYMid meet");
    out.setAttribute("class", "morph-svg");

    var spread = Math.max(0, Math.min(0.9, opt.stagger));
    function staggerKey(p, idx) {
      var c = (p[0] || p[1]).c;
      if (opt.staggerBy === "y") return c[1];
      if (opt.staggerBy === "index") return idx;
      if (opt.staggerBy === "random") return Math.random();
      return c[0];
    }
    var keys = pairs.map(staggerKey).map(function (v) {
      return isFinite(v) ? v : 0;
    });
    var kMin = Math.min.apply(null, keys);
    var kMax = Math.max.apply(null, keys);
    var kRange = kMax - kMin || 1;

    function shapesAlike(a, b) {
      if (!a || !b) return false;
      if (a.rings.length !== b.rings.length) return false;
      var sa = a.span, sb = b.span;
      if (!(sa > 0) || !(sb > 0)) return false;
      return Math.max(sa, sb) / Math.min(sa, sb) <= opt.alikeRatio;
    }

    function ringRoles(rings) {
      var boxes = rings.map(function (r) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (var i = 0; i < r.length; i++) {
          if (r[i][0] < x0) x0 = r[i][0];
          if (r[i][0] > x1) x1 = r[i][0];
          if (r[i][1] < y0) y0 = r[i][1];
          if (r[i][1] > y1) y1 = r[i][1];
        }
        return [x0, y0, x1, y1, (x1 - x0) * (y1 - y0)];
      });
      return boxes.map(function (a, i) {
        var depth = 0;
        for (var j = 0; j < boxes.length; j++) {
          if (i === j) continue;
          var b = boxes[j];
          if (b[4] > a[4] &&
              a[0] >= b[0] - 0.01 && a[1] >= b[1] - 0.01 &&
              a[2] <= b[2] + 0.01 && a[3] <= b[3] + 0.01) depth++;
        }
        return depth % 2;
      });
    }

    function pairRings(ra, rb) {
      var outPairs = [];
      var used = new Array(rb.length);
      var signA = ra.map(signedArea);
      var signB = rb.map(signedArea);
      var roleA = ringRoles(ra);
      var roleB = ringRoles(rb);

      function claim(i) {
        var ca = centroid(ra[i]);
        var best = -1, bestD = Infinity;
        for (var j = 0; j < rb.length; j++) {
          if (used[j]) continue;
          if (roleA[i] !== roleB[j]) continue;
          var cb = centroid(rb[j]);
          var dd = (cb[0] - ca[0]) * (cb[0] - ca[0]) + (cb[1] - ca[1]) * (cb[1] - ca[1]);
          if (dd < bestD) { bestD = dd; best = j; }
        }
        return best;
      }

      var taken = new Array(ra.length);
      var order = ra.map(function (_, i) { return i; }).sort(function (x, y) {
        return roleA[x] - roleA[y];
      });
      for (var oi = 0; oi < order.length; oi++) {
        var i = order[oi];
        var j1 = claim(i);
        if (j1 >= 0) { used[j1] = true; taken[i] = j1; }
      }

      for (var i3 = 0; i3 < ra.length; i3++) {
        var j3 = taken[i3];
        if (j3 === undefined) {
          outPairs.push([ra[i3], degenerateFrom(ra[i3])]);
          continue;
        }
        var target = rb[j3];
        if (signA[i3] * signB[j3] < 0) target = reverseRing(target);
        outPairs.push([ra[i3], target]);
      }
      for (var k = 0; k < rb.length; k++) {
        if (!used[k]) outPairs.push([degenerateFrom(rb[k]), rb[k]]);
      }
      return outPairs.length ? outPairs : [[ra[0] || [], rb[0] || []]];
    }

    if (opt.mode === "crossfade") {
      var gA = document.createElementNS(SVG_NS, "g");
      var gB = document.createElementNS(SVG_NS, "g");
      out.appendChild(gA);
      out.appendChild(gB);
      if (moveFrom) {
        gA.setAttribute("transform", "translate(" + moveFrom.tx + " " + moveFrom.ty + ")");
      }
      if (moveTo && moveTo.s === 1) {
        gB.setAttribute("transform", "translate(" + moveTo.tx + " " + moveTo.ty + ")");
      }
      var rawFrom = collectRaw(fromSvg);
      var rawTo = collectRaw(toSvg);
      rawFrom.forEach(function (sh) {
        mkPath(gA, opt.fill, sh.d, sh.fillRule);
      });
      rawTo.forEach(function (sh) {
        mkPath(gB, opt.fill, sh.d, sh.fillRule);
      });
      mount.innerHTML = "";
      mount.appendChild(out);

      var xfRaf = null;
      var xfT = 0;
      var api = {
        svg: out,
        shapeCount: rawFrom.length + rawTo.length,
        usingFlubber: false,
        set: function (t) {
          xfT = Math.max(0, Math.min(1, t));
          var e = opt.easing(xfT);
          gA.style.opacity = String(1 - e);
          gB.style.opacity = String(e);
          if (opt.onUpdate) opt.onUpdate(xfT);
        },
        stop: function () {
          if (xfRaf !== null) {
            cancelAnimationFrame(xfRaf);
            xfRaf = null;
          }
        },
        play: function (reverse) {
          api.stop();
          var to = reverse ? 0 : 1;
          var reduce =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (reduce || opt.duration <= 0) {
            api.set(to);
            if (opt.onComplete) opt.onComplete(to);
            return;
          }
          var begin = xfT;
          var span = to - begin;
          if (span === 0) {
            begin = reverse ? 1 : 0;
            span = to - begin;
          }
          var dur = Math.abs(span) * opt.duration;
          var start = null;
          var step = function (now) {
            if (start === null) start = now;
            var k = dur > 0 ? Math.min(1, (now - start) / dur) : 1;
            api.set(begin + span * k);
            if (k < 1) xfRaf = requestAnimationFrame(step);
            else {
              xfRaf = null;
              if (opt.onComplete) opt.onComplete(to);
            }
          };
          xfRaf = requestAnimationFrame(step);
        },
        destroy: function () {
          api.stop();
          if (out.parentNode) out.parentNode.removeChild(out);
        },
      };
      api.set(0);
      return api;
    }

    var items = [];
    var autoStats = { morph: 0, fade: 0 };
    pairs.forEach(function (p, idx) {
      var ringsA = p[0] ? p[0].rings : null;
      var ringsB = p[1] ? p[1].rings : null;
      if (!ringsA) ringsA = ringsB.map(degenerateFrom);
      if (!ringsB) ringsB = ringsA.map(degenerateFrom);

      var rp = pairRings(ringsA, ringsB);
      var t0 = spread * ((keys[idx] - kMin) / kRange);
      var fillRule = (p[0] || p[1]).fillRule;
      var rawA = p[0] ? p[0].rawD : null;
      var rawB = p[1] ? p[1].rawD : null;
      var rawTA = p[0] ? p[0].rawT : null;
      var rawTB = p[1] ? p[1].rawT : null;
      var item = { t0: t0, rawA: rawA, rawB: rawB, rawTA: rawTA, rawTB: rawTB };

      if (opt.mode === "transform") {
        var boxA = p[0] ? bboxOf(p[0].rings) : null;
        var boxB = p[1] ? bboxOf(p[1].rings) : null;
        if (!boxA) boxA = { w: 0.001, h: 0.001, cx: boxB.cx, cy: boxB.cy };
        if (!boxB) boxB = { w: 0.001, h: 0.001, cx: boxA.cx, cy: boxA.cy };
        var it2 = {
          t0: spread * ((keys[idx] - kMin) / kRange),
          boxA: boxA,
          boxB: boxB,
          isTransform: true,
        };
        if (rawA) it2.pathA = mkPath(out, opt.fill, rawA, fillRule, rawTA);
        if (rawB) it2.pathB = mkPath(out, opt.fill, rawB, fillRule, rawTB);
        items.push(it2);
        return;
      }

      var itemMode = opt.mode;
      if (opt.mode === "auto") {
        var alike = shapesAlike(p[0], p[1]);
        itemMode = alike ? "morph" : "fade";
        autoStats[alike ? "morph" : "fade"]++;
      }

      if (itemMode === "fade") {
        item.pathA = mkPath(out, opt.fill,
          rawA || rp.map(function (r) { return ringToPath(r[0]); }).join(""), fillRule,
          rawA ? rawTA : null);
        item.pathB = mkPath(out, opt.fill,
          rawB || rp.map(function (r) { return ringToPath(r[1]); }).join(""), fillRule,
          rawB ? rawTB : null);
      } else if (itemMode === "shrink") {
        item.path = mkPath(out, opt.fill, "", fillRule);
        item.fnsOut = rp.map(function (r) { return makeInterpolator(r[0], degenerateFrom(r[0]), opt); });
        item.fnsIn = rp.map(function (r) { return makeInterpolator(degenerateFrom(r[1]), r[1], opt); });
      } else {
        item.path = mkPath(out, opt.fill, "", fillRule);
        item.fns = rp.map(function (r) { return makeInterpolator(r[0], r[1], opt); });
      }
      items.push(item);
    });

    mount.innerHTML = "";
    mount.appendChild(out);

    var raf = null;
    var current = 0;

    var SWAP = 0.18;
    function fadeOut(e) {
      var lo = 0.5 - SWAP / 2;
      var hi = 0.5 + SWAP / 2;
      if (e <= lo) return 1;
      if (e >= hi) return 0;
      return 1 - (e - lo) / (hi - lo);
    }

    function localT(t, t0) {
      var span = 1 - spread;
      if (span <= 0) return t >= 1 ? 1 : 0;
      return Math.max(0, Math.min(1, (t - t0) / span));
    }

    function set(t) {
      current = Math.max(0, Math.min(1, t));
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var e = opt.easing(localT(current, it.t0));
        if (it.isTransform) {
          var box = lerpBox(it.boxA, it.boxB, e);
          if (it.pathA) {
            it.pathA.setAttribute("transform", boxTransform(it.boxA, box));
            it.pathA.style.opacity = String(fadeOut(e));
          }
          if (it.pathB) {
            it.pathB.setAttribute("transform", boxTransform(it.boxB, box));
            it.pathB.style.opacity = String(1 - fadeOut(e));
          }
        } else if (it.pathA) {
          it.pathA.style.opacity = String(1 - e);
          it.pathB.style.opacity = String(e);
        } else if (it.fnsOut) {
          if (e <= 0 && it.rawA) drawInto(it, it.rawA, it.rawTA);
          else if (e >= 1 && it.rawB) drawInto(it, it.rawB, it.rawTB);
          else {
            var fns = e < 0.5 ? it.fnsOut : it.fnsIn;
            var lt = e < 0.5 ? e * 2 : (e - 0.5) * 2;
            drawInto(it, joinRings(fns, lt), null);
          }
        } else if (e <= 0 && it.rawA) {
          drawInto(it, it.rawA, it.rawTA);
        } else if (e >= 1 && it.rawB) {
          drawInto(it, it.rawB, it.rawTB);
        } else {
          drawInto(it, joinRings(it.fns, e), null);
        }
      }
      if (opt.onUpdate) opt.onUpdate(current);
    }

    function stop() {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    }

    function play(reverse) {
      stop();
      var reduce =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var to = reverse ? 0 : 1;
      if (reduce || opt.duration <= 0) {
        set(to);
        if (opt.onComplete) opt.onComplete(to);
        return;
      }
      var start = null;
      var begin = current;
      var span = to - begin;
      if (span === 0) {
        begin = reverse ? 1 : 0;
        span = to - begin;
      }
      var dur = Math.abs(span) * opt.duration;

      function step(now) {
        if (start === null) start = now;
        var k = dur > 0 ? Math.min(1, (now - start) / dur) : 1;
        set(begin + span * k);
        if (k < 1) {
          raf = requestAnimationFrame(step);
        } else {
          raf = null;
          if (opt.onComplete) opt.onComplete(to);
        }
      }
      raf = requestAnimationFrame(step);
    }

    function destroy() {
      stop();
      if (out.parentNode) out.parentNode.removeChild(out);
      [fromSvg, toSvg].forEach(function (s) {
        if (s && s.parentNode === stagingEl) stagingEl.removeChild(s);
      });
    }

    set(0);

    return {
      play: play,
      set: set,
      stop: stop,
      destroy: destroy,
      svg: out,
      shapeCount: items.length,
      autoStats: autoStats,
      usingFlubber: !!(opt.useFlubber && global.flubber && global.flubber.interpolate),
    };
  }

  function sequence(options) {
    var opt = Object.assign({}, DEFAULTS, options || {});
    var mount = resolve(opt.mount);
    var steps = opt.steps || [];
    if (!mount || steps.length < 2) {
      console.warn("[ApexMorph] steps는 2개 이상이어야 합니다.", opt.steps);
      return null;
    }

    mount.innerHTML = "";

    var commonVB = opt.viewBox || null;
    if (!commonVB && opt.fit !== "scale") {
      var boxes = [];
      steps.forEach(function (src) {
        var el = toSvgElement(src);
        if (el) boxes.push(viewBoxOf(el));
      });
      if (boxes.length) commonVB = unionVB(boxes);
    }

    var order = steps.slice();
    if (opt.cycle && steps.length >= 2) order.push(steps[0]);

    var segs = [];
    for (var i = 0; i < order.length - 1; i++) {
      var wrap = document.createElement("div");
      wrap.className = "morph-step";
      mount.appendChild(wrap);
      var inst = create(
        Object.assign({}, opt, {
          from: order[i],
          to: order[i + 1],
          mount: wrap,
          viewBox: commonVB,
        })
      );
      if (!inst) continue;
      segs.push({ wrap: wrap, inst: inst });
    }
    if (!segs.length) return null;

    var n = segs.length;
    var raf = null;
    var current = 0;

    function set(t) {
      current = Math.max(0, Math.min(1, t));
      var scaled = current * n;
      var idx = Math.min(n - 1, Math.floor(scaled));
      var local = scaled - idx;
      if (current >= 1) {
        idx = n - 1;
        local = 1;
      }
      for (var i = 0; i < n; i++) {
        segs[i].wrap.style.display = i === idx ? "" : "none";
        segs[i].inst.set(i < idx ? 1 : i > idx ? 0 : local);
      }
      if (opt.onUpdate) opt.onUpdate(current);
    }

    function stop() {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    }

    function hold() {
      return Math.max(0, opt.stepHold);
    }

    function playTo(target) {
      stop();
      var to = Math.max(0, Math.min(1, target));
      var xFrom = current * n;
      var xTo = to * n;
      var dir = xTo >= xFrom ? 1 : -1;
      var H = hold();

      function xAt(e) {
        var x = xFrom;
        var remain = e;
        for (var guard = 0; guard < n + 2; guard++) {
          var next = dir > 0 ? Math.floor(x) + 1 : Math.ceil(x) - 1;
          if (dir > 0 ? next > xTo : next < xTo) next = xTo;
          var cost = Math.abs(next - x) * opt.duration;
          if (remain < cost) return x + dir * (remain / opt.duration);
          remain -= cost;
          x = next;
          if (x === xTo) return x;
          if (remain < H) return x;
          remain -= H;
        }
        return xTo;
      }

      var reduce =
        opt.mode !== "crossfade" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var crossings = Math.max(0,
        Math.ceil(Math.max(xFrom, xTo) - 0.0001) - Math.floor(Math.min(xFrom, xTo) + 0.0001) - 1);
      var dur = Math.abs(xTo - xFrom) * opt.duration + crossings * H;
      if (reduce || dur <= 0) {
        set(to);
        if (opt.onComplete) opt.onComplete(to);
        return;
      }

      var start = null;
      function step(now) {
        if (start === null) start = now;
        var e = now - start;
        if (e >= dur) {
          raf = null;
          set(to);
          if (opt.onComplete) opt.onComplete(to);
          return;
        }
        set(xAt(e) / n);
        raf = requestAnimationFrame(step);
      }
      raf = requestAnimationFrame(step);
    }

    function play(reverse) {
      playTo(reverse ? 0 : 1);
    }

    set(0);

    return {
      play: play,
      playTo: playTo,
      set: set,
      stop: stop,
      destroy: function () {
        stop();
        segs.forEach(function (sg) {
          sg.inst.destroy();
          if (sg.wrap.parentNode) sg.wrap.parentNode.removeChild(sg.wrap);
        });
      },
      steps: n + 1,
      segments: n,
      shapeCount: segs.reduce(function (a, sg) {
        return a + sg.inst.shapeCount;
      }, 0),
      usingFlubber: segs[0].inst.usingFlubber,
      autoStats: segs.reduce(function (acc, sg) {
        acc.morph += sg.inst.autoStats ? sg.inst.autoStats.morph : 0;
        acc.fade += sg.inst.autoStats ? sg.inst.autoStats.fade : 0;
        return acc;
      }, { morph: 0, fade: 0 }),
    };
  }

  function autoplayOnView(options) {
    var opt = Object.assign({ delay: 120, replay: true, threshold: 0.4 }, options || {});
    var mount = resolve(opt.mount);
    if (!mount) {
      console.warn("[ApexMorph] mount를 찾지 못했습니다.", opt.mount);
      return null;
    }

    var inst = null;
    var cancelled = false;
    var timer = null;
    var shown = false;
    var observer = null;

    function reducedMotion() {
      return !!(
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    }

    var srcList =
      opt.steps && opt.steps.length >= 2 ? opt.steps.slice() : [opt.from, opt.to];

    var prepObserver = null;
    var deferMO = null;
    var scrollWatch = null;

    function whenAllowed(cb) {
      var root = document.documentElement;
      if (!root.hasAttribute("data-morph-defer")) return cb();
      deferMO = new MutationObserver(function () {
        if (root.hasAttribute("data-morph-defer")) return;
        deferMO.disconnect();
        deferMO = null;
        cb();
      });
      deferMO.observe(root, { attributes: true, attributeFilter: ["data-morph-defer"] });
    }

    var fetched = null;
    var fetchDone = false;
    var waitingForFetch = null;
    withSources(srcList, function (resolved) {
      fetched = resolved;
      fetchDone = true;
      showFirstFrame(resolved);
      if (waitingForFetch) {
        var go = waitingForFetch;
        waitingForFetch = null;
        go();
      }
    });

    function showFirstFrame(resolved) {
      if (cancelled || !mount || mount.firstChild) return;
      var first = toSvgElement(resolved[0]);
      if (!first) return;
      var vb = opt.viewBox;
      if (!vb && opt.fit !== "scale") {
        var boxes = [];
        resolved.forEach(function (src) {
          var el = toSvgElement(src);
          if (el) boxes.push(viewBoxOf(el));
        });
        if (boxes.length) vb = unionVB(boxes);
      }
      if (vb) first.setAttribute("viewBox", [vb.x, vb.y, vb.w, vb.h].join(" "));
      first.setAttribute("preserveAspectRatio", "xMidYMid meet");
      first.setAttribute("class", "morph-svg");
      mount.appendChild(first);
    }

    function runPrepare() {
      if (cancelled) return;
      if (!fetchDone) {
        waitingForFetch = runPrepare;
        return;
      }
      onSources(fetched);
    }

    function isNear() {
      var r = mount.getBoundingClientRect();
      var h = window.innerHeight || 0;
      return r.top < h * 1.5 && r.bottom > -h * 0.5;
    }

    function beginPrepare() {
      if (cancelled) return;
      whenAllowed(function () {
        if (cancelled) return;
        if (isNear()) return runPrepare();
        var wait = PREPARE_LEAD_MS + prepareQueue * PREPARE_GAP_MS;
        prepareQueue += 1;
        setTimeout(function () {
          if (cancelled) return;
          runPrepare();
        }, wait);
      });
    }
    if (window.IntersectionObserver) {
      prepObserver = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (!entries[i].isIntersecting) continue;
            prepObserver.disconnect();
            prepObserver = null;
            beginPrepare();
            return;
          }
        },
        { rootMargin: "200% 0px" }
      );
      prepObserver.observe(mount);
    } else {
      beginPrepare();
    }

    function onScrollNear() {
      if (cancelled || !isNear()) return;
      window.removeEventListener("scroll", onScrollNear);
      scrollWatch = null;
      if (!document.documentElement.hasAttribute("data-morph-defer")) runPrepare();
    }
    if (window.addEventListener) {
      scrollWatch = onScrollNear;
      window.addEventListener("scroll", onScrollNear, { passive: true });
    }

    function onSources(resolved) {
      if (cancelled) return;
      if (reducedMotion()) opt.mode = "crossfade";
      var withDone = Object.assign({}, opt, {
        onComplete: function (to) {
          if (opt.onComplete) opt.onComplete(to);
          onDone();
        },
      });
      var built = opt.steps
        ? sequence(Object.assign(withDone, { steps: resolved }))
        : create(Object.assign(withDone, { from: resolved[0], to: resolved[1] }));
      if (!built) return;
      inst = built;
      attach();
    }

    var phase = "toLast";

    function lastStop() {
      var segCount = (inst && inst.segments) || 1;
      return segCount > 1 ? (segCount - 1) / segCount : 1;
    }

    function run() {
      if (!inst || !shown) return;
      if (phase === "toLast") {
        inst.set(0);
        inst.playTo(lastStop());
      } else if (phase === "toFirst") {
        inst.playTo(1);
      } else {
        inst.set(0);
        inst.playTo(1);
      }
    }

    function wait(ms) {
      clearTimeout(timer);
      timer = setTimeout(run, Math.max(0, ms));
    }

    function cycle() {
      if (!inst || !shown) return;
      wait(opt.delay);
    }

    function onDone() {
      if (!shown || !inst) return;

      if (phase === "toLast") {
        phase = "toFirst";
        wait(opt.loopDelay);
      } else {
        phase = "loop";
        wait(opt.stepHold);
      }
    }

    function enter() {
      if (shown || !inst) return;
      shown = true;
      inst.set(0);
      cycle();
    }

    function leave() {
      if (!shown || !inst) return;
      shown = false;
      clearTimeout(timer);
      inst.stop();
      phase = "toLast";
      if (opt.replay) inst.set(0);
    }

    function attach() {
    var slide = mount.closest ? mount.closest(".slide") : null;

    if (slide) {
      var isShown = function () {
        return (
          slide.classList.contains("is-current") &&
          !document.body.classList.contains("main-screen-visible")
        );
      };
      var sync = function () {
        if (isShown()) enter();
        else leave();
      };
      observer = new MutationObserver(sync);
      observer.observe(slide, { attributes: true, attributeFilter: ["class"] });
      observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      sync();
    } else if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) enter();
            else leave();
          });
        },
        { threshold: opt.threshold }
      );
      observer.observe(mount);
    } else {
      enter();
    }
    }

    return {
      get morph() {
        return inst;
      },
      destroy: function () {
        cancelled = true;
        clearTimeout(timer);
        if (prepObserver) prepObserver.disconnect();
        if (deferMO) deferMO.disconnect();
        if (scrollWatch) window.removeEventListener("scroll", scrollWatch);
        if (observer) observer.disconnect();
        if (inst) inst.destroy();
      },
    };
  }

  function autoInit() {
    var nodes = document.querySelectorAll(
      "[data-morph-from][data-morph-to],[data-morph-steps]"
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.dataset.morphBound) continue;
      el.dataset.morphBound = "1";
      var stepsAttr = el.getAttribute("data-morph-steps");
      var steps = stepsAttr
        ? stepsAttr.split(",").map(function (x) { return x.trim(); }).filter(Boolean)
        : null;
      autoplayOnView({
        steps: steps,
        from: el.getAttribute("data-morph-from"),
        to: el.getAttribute("data-morph-to"),
        mount: el,
        duration: Number(el.getAttribute("data-morph-duration")) || DEFAULTS.duration,
        delay: Number(el.getAttribute("data-morph-delay")) || 120,
        samples: Number(el.getAttribute("data-morph-samples")) || DEFAULTS.samples,
        mode: el.getAttribute("data-morph-mode") || DEFAULTS.mode,
        pairing: el.getAttribute("data-morph-pairing") || DEFAULTS.pairing,
        loopDelay: Number(el.getAttribute("data-morph-loop")) || DEFAULTS.loopDelay,
        stepHold: Number(el.getAttribute("data-morph-hold")) || DEFAULTS.stepHold,
        stagger: el.hasAttribute("data-morph-stagger")
          ? Number(el.getAttribute("data-morph-stagger"))
          : DEFAULTS.stagger,
        staggerBy: el.getAttribute("data-morph-stagger-by") || DEFAULTS.staggerBy,
        fit: el.getAttribute("data-morph-fit") || DEFAULTS.fit,
        align: el.getAttribute("data-morph-align") || DEFAULTS.align,
        alikeRatio: Number(el.getAttribute("data-morph-alike-ratio")) ||
          DEFAULTS.alikeRatio,
        cycle: el.getAttribute("data-morph-cycle") !== "false",
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }

  global.ApexMorph = {
    create: create,
    sequence: sequence,
    load: function (urls) {
      return Promise.all(urls.map(fetchSvg));
    },
    autoplayOnView: autoplayOnView,
    autoInit: autoInit,
  };
})(window);
