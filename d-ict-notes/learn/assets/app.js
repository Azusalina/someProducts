/* Shared script: navigation chrome, tonal sections, scroll reveal, hero visuals, animation helpers. */
(function () {
  var chapters = [
    ["index.html", "Overview", "Unit C overview"],
    ["ch16-networking.html", "Ch16 Networking", "Ch16 Networking and Internet basics"],
    ["ch17-protocols.html", "Ch17 Protocols", "Ch17 Communication software and protocols"],
    ["ch18-services.html", "Ch18 Services", "Ch18 Services and applications"],
    ["ch19-html.html", "Ch19 HTML", "Ch19 Introduction to HTML"],
    ["ch20-web-authoring.html", "Ch20 Web authoring", "Ch20 Elementary web authoring"]
  ];
  var here = location.pathname.split("/").pop() || "index.html";
  var idx = chapters.findIndex(function (c) { return c[0] === here; });
  var reduced = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var hasIO = "IntersectionObserver" in window;
  document.documentElement.classList.add("js");

  /* ---------- helpers shared with page scripts ---------- */
  var U = window.U = {
    reduced: reduced,
    $: function (s, r) { return (r || document).querySelector(s); },
    $$: function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); },
    sleep: function (ms) { return new Promise(function (r) { setTimeout(r, reduced ? 1 : ms); }); },
    /* Move an SVG element from [x,y] to [x,y]. Resolves when finished. */
    move: function (el, from, to, ms) {
      var a = el.animate(
        [{ transform: "translate(" + from[0] + "px," + from[1] + "px)" },
         { transform: "translate(" + to[0] + "px," + to[1] + "px)" }],
        { duration: reduced ? 1 : (ms || 700), easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }
      );
      return a.finished;
    },
    svg: function (tag, attrs, parent) {
      var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
      Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (parent) parent.appendChild(e);
      return e;
    },
    esc: function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); },
    /* Repeat fn (sync or async) while host is on screen. Does nothing under reduced motion. */
    loop: function (host, fn, ms) {
      if (reduced || !hasIO) return;
      var on = false, t = null;
      function tick() {
        if (!on) return;
        Promise.resolve(fn()).then(function () { if (on) t = setTimeout(tick, ms); });
      }
      new IntersectionObserver(function (es) {
        var v = es[0].isIntersecting;
        if (v && !on) { on = true; tick(); } else if (!v) { on = false; clearTimeout(t); }
      }).observe(host);
    },
    /* Multiple-choice mini quiz. items: [{q, a (index), why}], opts: [labels] */
    quiz: function (box, items, opts) {
      var i = 0, score = 0, done = false;
      box.innerHTML = '<p class="mc-q"></p><div class="mc-opts"></div><p class="status"></p><div class="row"><button class="btn pri" disabled>Next</button><span class="mc-score"></span></div>';
      var q = box.querySelector(".mc-q"), o = box.querySelector(".mc-opts"), st = box.querySelector(".status"),
          nx = box.querySelector(".btn.pri"), sc = box.querySelector(".mc-score");
      function show() {
        done = false; q.textContent = items[i].q; st.textContent = ""; nx.disabled = true;
        nx.textContent = i === items.length - 1 ? "Restart" : "Next";
        sc.textContent = "Question " + (i + 1) + " of " + items.length + ". Score " + score + ".";
        o.innerHTML = "";
        opts.forEach(function (label, k) {
          var b = document.createElement("button"); b.className = "btn"; b.textContent = label;
          b.onclick = function () {
            if (done) return; done = true;
            var ok = k === items[i].a;
            if (ok) score++;
            b.className = "btn " + (ok ? "right" : "wrong");
            if (!ok) o.children[items[i].a].className = "btn right";
            st.innerHTML = (ok ? "<b>Correct.</b> " : "<b>Not quite.</b> ") + U.esc(items[i].why);
            sc.textContent = "Question " + (i + 1) + " of " + items.length + ". Score " + score + ".";
            nx.disabled = false;
          };
          o.appendChild(b);
        });
      }
      nx.onclick = function () { if (i === items.length - 1) { i = 0; score = 0; } else { i++; } show(); };
      show();
    }
  };

  /* ---------- chrome: glass nav, sub-nav, progress ---------- */
  var chrome = document.createElement("header");
  chrome.className = "chrome";
  chrome.innerHTML =
    '<div class="topbar"><div class="topbar-in"><a class="brand" href="index.html">ICT Unit C</a><nav aria-label="Chapters">' +
    chapters.slice(1).map(function (c) {
      return '<a href="' + c[0] + '"' + (c[0] === here ? ' aria-current="page"' : "") + ">" + c[1] + "</a>";
    }).join("") + '</nav></div></div>' +
    '<div class="subnav"><div class="subnav-in"><span class="sn-title">' + (idx >= 0 ? chapters[idx][1] : "ICT Unit C") + '</span><nav aria-label="On this page"></nav></div></div>';
  document.body.prepend(chrome);
  var bar = document.createElement("div");
  bar.className = "progress"; bar.setAttribute("aria-hidden", "true");
  document.body.prepend(bar);

  /* ---------- group content into tonal sections ---------- */
  var main = document.querySelector("main");
  var hero = main.querySelector(".hero");
  var bands = [], cur = null;
  Array.prototype.slice.call(main.children).forEach(function (n) {
    if (n === hero) return;
    if (n.tagName === "H2") {
      cur = document.createElement("section");
      cur.className = "band";
      cur._w = document.createElement("div");
      cur._w.className = "wrap";
      cur.appendChild(cur._w);
      bands.push(cur);
    }
    if (cur) cur._w.appendChild(n);
  });
  bands.forEach(function (b) { main.appendChild(b); });

  /* previous / next as large tiles in a last section */
  if (idx >= 0) {
    var p = idx > 0 ? chapters[idx - 1] : null, n = idx < chapters.length - 1 ? chapters[idx + 1] : null;
    var pb = document.createElement("section");
    pb.className = "band";
    pb.style.paddingTop = "72px"; pb.style.paddingBottom = "96px";
    pb.innerHTML = '<div class="wrap"><nav class="pager" aria-label="Previous and next">' +
      (p ? '<a href="' + p[0] + '"><small>Previous</small>' + p[2] + "</a>" : "<span></span>") +
      (n ? '<a class="next" href="' + n[0] + '"><small>Next</small>' + n[2] + "</a>" : "") + "</nav></div>";
    main.appendChild(pb);
    bands.push(pb);
  }

  /* sub-nav links from section headings */
  var heads = U.$$("main h2[id]");
  var sn = U.$(".subnav nav"), snLinks = {};
  heads.forEach(function (h) {
    var a = document.createElement("a");
    a.href = "#" + h.id; a.textContent = h.textContent; sn.appendChild(a); snLinks[h.id] = a;
  });
  if (hasIO) {
    if (hero) {
      new IntersectionObserver(function (es) {
        U.$(".subnav").classList.toggle("show", !es[0].isIntersecting);
      }, { rootMargin: "-90px 0px 0px 0px" }).observe(hero);
    }
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && snLinks[e.target.id]) {
          Object.keys(snLinks).forEach(function (k) { snLinks[k].classList.remove("on"); });
          snLinks[e.target.id].classList.add("on");
          snLinks[e.target.id].scrollIntoView({ block: "nearest", inline: "center" });
        }
      });
    }, { rootMargin: "-100px 0px -70% 0px" });
    heads.forEach(function (h) { spy.observe(h); });

    /* scroll reveal */
    if (!reduced) {
      var rv = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); rv.unobserve(e.target); } });
      }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
      U.$$(".band .wrap > *").forEach(function (el) { el.classList.add("rv"); rv.observe(el); });
    }
  }

  /* ---------- hero visuals (each explains the chapter in motion) ---------- */
  function hv16(v) {
    var s = U.svg("svg", { viewBox: "0 0 360 280", "class": "dia", role: "presentation" }, v);
    var C = [180, 140], N = { PC: [64, 52], Laptop: [296, 52], Printer: [64, 228], Server: [296, 228] }, boxes = {};
    Object.keys(N).forEach(function (k) { U.svg("line", { x1: C[0], y1: C[1], x2: N[k][0], y2: N[k][1], "class": "wire" }, s); });
    function node(p, label, w) {
      var r = U.svg("rect", { x: p[0] - w / 2, y: p[1] - 18, width: w, height: 36, rx: 12, "class": "box" }, s);
      var t = U.svg("text", { x: p[0], y: p[1] + 5, "class": "mid" }, s); t.textContent = label; return r;
    }
    node(C, "Switch", 84);
    Object.keys(N).forEach(function (k) { boxes[k] = node(N[k], k, 84); });
    U.loop(v, async function () {
      var ks = Object.keys(N), a = ks[Math.floor(Math.random() * ks.length)], b;
      do { b = ks[Math.floor(Math.random() * ks.length)]; } while (b === a);
      var d = U.svg("circle", { r: 7, "class": "pkt" }, s);
      await U.move(d, N[a], C, 520); await U.move(d, C, N[b], 520); d.remove();
      boxes[b].setAttribute("class", "box on"); await U.sleep(450); boxes[b].setAttribute("class", "box");
    }, 250);
  }

  function hv17(v) {
    v.innerHTML = '<div class="hv-stack"><div class="chips"></div><p></p></div>';
    var chips = U.$(".chips", v), cap = U.$("p", v), i = 0;
    var S = [["data"], ["TH", "data"], ["NH", "TH", "data"], ["DH", "NH", "TH", "data", "DT"], ["bits"]];
    var names = ["User data", "Segment", "Packet", "Frame", "Bits on the wire"];
    var fresh = [[], ["TH"], ["NH"], ["DH", "DT"], ["bits"]];
    function show(k) {
      chips.innerHTML = "";
      S[k].forEach(function (t) {
        var c = document.createElement("span");
        c.className = "chip" + (t === "data" ? " data" : "") + (fresh[k].indexOf(t) >= 0 ? " new" : "");
        c.textContent = t === "bits" ? "0110 1001 1100 0101" : t; chips.appendChild(c);
      });
      cap.textContent = names[k];
    }
    if (reduced) { show(3); return; }
    show(0);
    U.loop(v, function () { i = (i + 1) % S.length; show(i); }, 1300);
  }

  function hv18(v) {
    v.innerHTML = '<div class="hv-search"><div class="bar"><span class="q"></span><span class="caret"></span></div><ul></ul></div>';
    var q = U.$(".q", v), ul = U.$("ul", v), text = "python NOT snake";
    var R = [["Learn Python for beginners", 0], ["Python snake care guide", 1], ["Python programming course", 0]];
    function build() {
      ul.innerHTML = "";
      return R.map(function (r) { var li = document.createElement("li"); li.textContent = r[0]; ul.appendChild(li); return li; });
    }
    if (reduced) { q.textContent = text; build().forEach(function (li, k) { li.className = "in" + (R[k][1] ? " no" : ""); }); return; }
    U.loop(v, async function () {
      q.textContent = ""; var lis = build();
      for (var i = 0; i < text.length; i++) { q.textContent += text[i]; await U.sleep(70); }
      await U.sleep(250);
      for (var k = 0; k < lis.length; k++) { lis[k].classList.add("in"); await U.sleep(220); }
      await U.sleep(700); lis[1].classList.add("no"); await U.sleep(3200);
    }, 300);
  }

  function hv19(v) {
    v.innerHTML = '<div class="hv-code"><pre><code></code></pre><div class="hv-preview"></div></div>';
    var code = U.$("code", v), pv = U.$(".hv-preview", v);
    var L = [["<h1>Hello</h1>", "<h1>Hello</h1>"], ["<p>This is <b>bold</b>.</p>", "<h1>Hello</h1><p>This is <b>bold</b>.</p>"]];
    if (reduced) { code.textContent = L[0][0] + "\n" + L[1][0]; pv.innerHTML = L[1][1]; return; }
    U.loop(v, async function () {
      code.textContent = ""; pv.innerHTML = "";
      for (var l = 0; l < L.length; l++) {
        for (var i = 0; i < L[l][0].length; i++) { code.textContent += L[l][0][i]; await U.sleep(55); }
        pv.innerHTML = L[l][1]; code.textContent += "\n"; await U.sleep(500);
      }
      await U.sleep(2800);
    }, 300);
  }

  function hv20(v) {
    var s = U.svg("svg", { viewBox: "0 0 360 270", "class": "dia hv-tree", role: "presentation" }, v);
    var P = { home: [180, 40, "index.html"], a: [70, 130, "A"], b: [180, 130, "B"], c: [290, 130, "C"], a1: [34, 215, "A1"], a2: [112, 215, "A2"], c1: [250, 215, "C1"], c2: [328, 215, "C2"] };
    var E = [["home", "a"], ["home", "b"], ["home", "c"], ["a", "a1"], ["a", "a2"], ["c", "c1"], ["c", "c2"]];
    var lines = E.map(function (e) {
      return U.svg("line", { x1: P[e[0]][0], y1: P[e[0]][1], x2: P[e[1]][0], y2: P[e[1]][1], "class": "wire", pathLength: 1, style: "stroke-dasharray:1;" }, s);
    });
    var nodes = {};
    Object.keys(P).forEach(function (k) {
      var g = U.svg("g", { "class": "nd" }, s), w = k === "home" ? 92 : 46;
      U.svg("rect", { x: P[k][0] - w / 2, y: P[k][1] - 16, width: w, height: 32, rx: 12, "class": "box on" }, g);
      var t = U.svg("text", { x: P[k][0], y: P[k][1] + 5, "class": "mid" }, g); t.textContent = P[k][2]; nodes[k] = g;
    });
    function all(on) {
      lines.forEach(function (l) { l.style.strokeDashoffset = on ? 0 : 1; l.style.transition = on ? "" : "none"; });
      Object.keys(nodes).forEach(function (k) { nodes[k].classList.toggle("in", on); });
    }
    lines.forEach(function (l) { l.style.strokeDashoffset = 1; l.style.transition = "stroke-dashoffset .6s cubic-bezier(.16,1,.3,1)"; });
    if (reduced) { all(true); return; }
    U.loop(v, async function () {
      all(false); await U.sleep(250);
      lines.forEach(function (l) { l.style.transition = "stroke-dashoffset .6s cubic-bezier(.16,1,.3,1)"; });
      nodes.home.classList.add("in"); await U.sleep(450);
      for (var i = 0; i < E.length; i++) { lines[i].style.strokeDashoffset = 0; await U.sleep(380); nodes[E[i][1]].classList.add("in"); await U.sleep(260); }
      await U.sleep(3200);
    }, 300);
  }

  var heroes = { "ch16-networking.html": hv16, "ch17-protocols.html": hv17, "ch18-services.html": hv18, "ch19-html.html": hv19, "ch20-web-authoring.html": hv20 };
  var vis = U.$("#hero-vis");
  if (vis && heroes[here]) heroes[here](vis);

  /* index: chapter pipeline lights up in order */
  var stops = U.$$(".pipe .stop");
  if (stops.length) {
    if (reduced) stops.forEach(function (s) { s.classList.add("on"); });
    else {
      var n2 = 0;
      U.loop(U.$(".pipe"), function () { n2 = (n2 + 1) % (stops.length + 2); stops.forEach(function (s, k) { s.classList.toggle("on", k < n2); }); }, 900);
    }
  }
})();
