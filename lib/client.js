// dsh-ticker-jp — Client half (bundle entry)
//
// Loaded by the DSH web bundle loader: injects a draggable, collapsible
// floating quote window into `shell.overlay` and polls the same-origin route
// `/dsh-ticker-jp/quotes` every 5s; a poll already in flight is skipped, so a
// slow response never overlaps the next one.
//
// Watch list: entries are stored as [{ code, name? }] under the localStorage
// key `dsh-ticker-jp:syms`; legacy string arrays and `code:别名` strings are
// read too. Defaults: 1306.T and ^N225. Adding accepts a bare 4-digit code
// (`9984` is expanded to `9984.T`), a full symbol (`9984.T`, `^N225`), or an
// alias form `代码:显示名`. Aliases are also editable inline per row and
// persist.
//
// Display names resolve as: user alias -> builtin short name -> Yahoo name ->
// code. Builtin short names cover only the defaults: Yahoo has no live TOPIX
// index, so its tracking ETF 1306.T shows as "TOPIX ETF", and ^N225 shows as
// "日経225". Naming is display-only — requests always send the real codes.
// Persistence is best-effort: quota or privacy failures are silently ignored.

window.__ModuleLoader__.load({
  id: "dsh-ticker-jp",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

    var UP = "#ff3b30";
    var DOWN = "#00e08a";
    var NEUTRAL = "var(--dsw-alias-label-primary)";

    var STORAGE_KEY = "dsh-ticker-jp:syms";
    var DEFAULTS = ["1306.T", "^N225"];
    var DISPLAY = { "1306.T": "TOPIX ETF", "^N225": "日経225" };
    var RE_SYMBOL = /^[A-Z0-9^][A-Z0-9.\-]*$/;

    function normalizeSymbol(raw) {
      var s = String(raw == null ? "" : raw).trim().toUpperCase();
      if (!s) return "";
      if (/^\d{4}$/.test(s)) s += ".T";
      return (RE_SYMBOL.test(s) && s.length <= 20) ? s : "";
    }

    function parseEntry(raw) {
      var code = "";
      var name = "";
      if (typeof raw === "string") {
        var i = raw.search(/[:：]/);
        if (i === -1) code = raw;
        else { code = raw.slice(0, i); name = raw.slice(i + 1); }
      } else if (raw && typeof raw === "object") {
        code = raw.code;
        name = raw.name;
      }
      code = normalizeSymbol(code);
      name = String(name == null ? "" : name).trim();
      if (!code) return null;
      var entry = { code: code };
      if (name) entry.name = name;
      return entry;
    }

    function readSyms() {
      var parsed = null;
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) parsed = JSON.parse(raw);
      } catch (e) { parsed = null; }
      var source = (Array.isArray(parsed) && parsed.length) ? parsed : DEFAULTS;
      var out = [];
      for (var i = 0; i < source.length; i++) {
        var entry = parseEntry(source[i]);
        if (!entry) continue;
        var dup = false;
        for (var j = 0; j < out.length; j++) {
          if (out[j].code === entry.code) { dup = true; break; }
        }
        if (dup) continue;
        out.push(entry);
      }
      if (out.length) return out;
      return DEFAULTS.map(function (c) { return { code: c }; });
    }

    function writeSyms(list) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch (e) { }
    }

    function fmt(n) {
      var v = Number(n);
      return (n == null || !Number.isFinite(v)) ? "--" : v.toFixed(2);
    }
    function sign(n) {
      return n > 0 ? "+" : "";
    }

    var CSS = ".shq-widget{position:fixed;z-index:99999;width:232px;background:#1a1c23;background:color-mix(in srgb, var(--dsw-alias-bg-overlay,#1a1c23) 80%, transparent);color:var(--dsw-alias-label-primary,#eef0f4);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.25);font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,\"PingFang SC\",\"Hiragino Sans GB\",\"Microsoft YaHei\",sans-serif;user-select:none;-webkit-user-select:none;overflow:hidden}" +
      ".shq-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:grab;touch-action:none;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}" +
      ".shq-head:active{cursor:grabbing}" +
      ".shq-title{font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--dsw-alias-label-secondary,#c7ccd6)}" +
      ".shq-tools{display:flex;align-items:center;gap:5px}" +
      ".shq-tool{height:18px;border:none;border-radius:6px;background:var(--dsw-alias-border-l1,rgba(255,255,255,.1));color:var(--dsw-alias-label-secondary,#aab0bc);cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;opacity:.85;padding:0 4px}" +
      ".shq-tool:hover{background:var(--dsw-alias-border-l2,rgba(255,255,255,.18));color:var(--dsw-alias-label-primary,#eef0f4)}" +
      ".shq-body{padding:5px 12px 8px}" +
      ".shq-row{display:flex;align-items:baseline;padding:6px 0}" +
      ".shq-row + .shq-row{border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.07))}" +
      ".shq-name{font-size:12.5px;color:var(--dsw-alias-label-secondary,#c7ccd6);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:6px}" +
      ".shq-price{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;flex:none}" +
      ".shq-pct{font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;width:64px;text-align:right;flex:none}" +
      ".shq-err{font-size:12px;color:var(--dsw-alias-label-secondary,#8f96a3);padding:4px 0}" +
      ".shq-edit{padding:6px 10px 8px}" +
      ".shq-edit-list{max-height:150px;overflow:auto;margin-bottom:6px}" +
      ".shq-edit-row{display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.05))}" +
      ".shq-edit-code{flex:none;width:86px;font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#aab0bc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".shq-edit-name{flex:1;min-width:0;border:1px solid transparent;border-radius:6px;background:rgba(255,255,255,.04);color:var(--dsw-alias-label-primary,#eef0f4);font-size:12px;padding:2px 6px;outline:none}" +
      ".shq-edit-name:focus{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.28));background:rgba(255,255,255,.06)}" +
      ".shq-edit-name::placeholder{color:var(--dsw-alias-label-secondary,#6d7280)}" +
      ".shq-edit-remove{flex:none;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#8f96a3);cursor:pointer;font-size:13px;line-height:1;padding:0 2px}" +
      ".shq-edit-remove:hover{color:#ff3b30}" +
      ".shq-edit-remove:disabled{opacity:.35;cursor:default}" +
      ".shq-edit-add{display:flex;gap:6px;margin-top:6px}" +
      ".shq-edit-input{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.16));border-radius:6px;background:rgba(255,255,255,.05);color:var(--dsw-alias-label-primary,#eef0f4);font-size:12px;padding:3px 8px;outline:none}" +
      ".shq-edit-input:focus{border-color:rgba(255,255,255,.35)}" +
      ".shq-edit-btn{border:none;border-radius:6px;background:var(--dsw-alias-border-l1,rgba(255,255,255,.1));color:var(--dsw-alias-label-secondary,#aab0bc);cursor:pointer;font-size:12px;padding:3px 10px;flex:none}" +
      ".shq-edit-btn:hover{background:var(--dsw-alias-border-l2,rgba(255,255,255,.18));color:var(--dsw-alias-label-primary,#eef0f4)}" +
      ".shq-edit-hint{font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-secondary,#8f96a3);margin-top:6px}" +
      ".shq-edit-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:8px}";

    var TAG_ID = "dsh-ticker-jp/style.css";

    function injectStyle(css) {
      var tag = document.querySelector('style[data-plugin-css="' + TAG_ID + '"]');
      if (tag === null) {
        tag = document.createElement("style");
        tag.dataset.plugin = "dsh-ticker-jp";
        tag.dataset.pluginCss = TAG_ID;
        tag.textContent = css;
        document.head.appendChild(tag);
      }
      return function disposeStyle() {
        tag.remove();
      };
    }

    var inject = ["slots"];

    function Row(item, name) {
      var c = (item && typeof item.changePct === "number")
        ? (item.changePct > 0 ? UP : item.changePct < 0 ? DOWN : NEUTRAL)
        : NEUTRAL;
      var label = name || (item && item.name) || "--";
      return React.createElement("div", { className: "shq-row", key: item.code },
        React.createElement("span", { className: "shq-name", title: item.name }, label),
        React.createElement("span", { className: "shq-price", style: { color: c } }, fmt(item.price)),
        React.createElement("span", { className: "shq-pct", style: { color: c } }, sign(item.changePct) + fmt(item.changePct) + "%")
      );
    }

    function StockWidget() {
      var itemsState = React.useState(null);
      var items = itemsState[0], setItems = itemsState[1];
      var errState = React.useState(null);
      var err = errState[0], setErr = errState[1];
      var posState = React.useState({ x: 16, y: 16 });
      var pos = posState[0], setPos = posState[1];
      var collapsedState = React.useState(false);
      var collapsed = collapsedState[0], setCollapsed = collapsedState[1];
      var editingState = React.useState(false);
      var editing = editingState[0], setEditing = editingState[1];
      var symsState = React.useState(readSyms);
      var syms = symsState[0], setSyms = symsState[1];
      var draftState = React.useState("");
      var draft = draftState[0], setDraft = draftState[1];
      var drag = React.useRef(null);

      function commitSyms(next) {
        var out = [];
        for (var i = 0; i < next.length; i++) {
          var entry = parseEntry(next[i]);
          if (!entry) continue;
          var dup = false;
          for (var j = 0; j < out.length; j++) {
            if (out[j].code === entry.code) { dup = true; break; }
          }
          if (dup) continue;
          out.push(entry);
        }
        var list = out.length ? out : DEFAULTS.map(function (c) { return { code: c }; });
        setSyms(list);
        writeSyms(list);
      }

      function renameAt(idx, name) {
        var next = syms.slice();
        var code = next[idx].code;
        var trimmed = String(name == null ? "" : name).trim();
        next[idx] = trimmed ? { code: code, name: trimmed } : { code: code };
        commitSyms(next);
      }

      function addDraft() {
        var entry = parseEntry(draft);
        if (!entry) return;
        var exists = -1;
        for (var i = 0; i < syms.length; i++) {
          if (syms[i].code === entry.code) { exists = i; break; }
        }
        if (exists === -1) commitSyms(syms.concat([entry]));
        else renameAt(exists, entry.name || "");
        setDraft("");
      }

      var codesKey = syms.map(function (e) { return e.code; }).join(",");

      React.useEffect(function () {
        var alive = true;
        var busy = false;
        var codes = syms.map(function (e) { return e.code; });
        function load() {
          if (busy) return;
          busy = true;
          var q = codes.map(function (s) { return encodeURIComponent(s); }).join(",");
          fetch("/dsh-ticker-jp/quotes?syms=" + q)
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (!alive) return;
              if (data && data.ok) { setItems(data.items || []); setErr(null); }
              else setErr((data && data.error) || "获取失败");
            })
            .catch(function (e) {
              if (alive) setErr(String((e && e.message) || e));
            })
            .then(function () { busy = false; });
        }
        load();
        var timer = setInterval(load, 5000);
        return function () { alive = false; clearInterval(timer); };
      }, [codesKey]);

      function onDown(e) {
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        if (e.currentTarget && e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
      }
      function onMove(e) {
        if (!drag.current) return;
        setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
      }
      function onUp() { drag.current = null; }

      function openEditor() {
        setCollapsed(false);
        setEditing(true);
      }

      function labelFor(code) {
        for (var i = 0; i < syms.length; i++) {
          if (syms[i].code === code) {
            return (syms[i].name) || DISPLAY[code] || "";
          }
        }
        return DISPLAY[code] || "";
      }

      var body = null;
      if (!collapsed) {
        if (editing) {
          var rows = syms.map(function (e, idx) {
            return React.createElement("div", { className: "shq-edit-row", key: e.code },
              React.createElement("span", { className: "shq-edit-code" }, e.code),
              React.createElement("input", {
                className: "shq-edit-name",
                value: e.name || "",
                placeholder: DISPLAY[e.code] || "显示名（可选）",
                spellCheck: false,
                onChange: function (ev) { renameAt(idx, ev.target.value); },
              }),
              React.createElement("button", {
                className: "shq-edit-remove",
                title: "移除",
                disabled: syms.length <= 1,
                onClick: function () {
                  if (syms.length <= 1) return;
                  var next = syms.slice();
                  next.splice(idx, 1);
                  commitSyms(next);
                },
              }, "✕")
            );
          });
          body = React.createElement("div", { className: "shq-edit" },
            React.createElement("div", { className: "shq-edit-list" }, rows),
            React.createElement("div", { className: "shq-edit-add" },
              React.createElement("input", {
                className: "shq-edit-input",
                value: draft,
                placeholder: "股票代码，如 9984.T",
                spellCheck: false,
                onChange: function (ev) { setDraft(ev.target.value); },
                onKeyDown: function (ev) { if (ev.key === "Enter") addDraft(); },
              }),
              React.createElement("button", { className: "shq-edit-btn", onClick: addDraft }, "添加")
            ),
            React.createElement("div", { className: "shq-edit-hint" }, "4位简码自动补 .T"),
            React.createElement("div", { className: "shq-edit-foot" },
              React.createElement("button", {
                className: "shq-edit-btn",
                onClick: function () { commitSyms(DEFAULTS); },
              }, "恢复默认"),
              React.createElement("button", {
                className: "shq-edit-btn",
                onClick: function () { setEditing(false); },
              }, "完成")
            )
          );
        } else if (items && items.length) {
          body = React.createElement("div", { className: "shq-body" },
            items.map(function (it) { return Row(it, labelFor(it.code) || it.name); })
          );
        } else {
          body = React.createElement("div", { className: "shq-body" },
            React.createElement("div", { className: "shq-err" }, err || "加载中…")
          );
        }
      }

      return React.createElement("div", { className: "shq-widget", style: { left: pos.x + "px", top: pos.y + "px" } },
        React.createElement("div", {
          className: "shq-head",
          onPointerDown: onDown,
          onPointerMove: onMove,
          onPointerUp: onUp,
          onPointerCancel: onUp,
        },
          React.createElement("span", { className: "shq-title" }, editing ? "自选行情" : "行情"),
          React.createElement("span", { className: "shq-tools" },
            React.createElement("button", {
              className: "shq-tool",
              title: "自选设置",
              onPointerDown: function (e) { e.stopPropagation(); },
              onClick: function () {
                if (collapsed) openEditor();
                else setEditing(function (v) { return !v; });
              },
            }, "⚙"),
            React.createElement("button", {
              className: "shq-tool",
              title: collapsed ? "展开" : "收起",
              onPointerDown: function (e) { e.stopPropagation(); },
              onClick: function () { setCollapsed(function (v) { return !v; }); },
            }, collapsed ? "+" : "—")
          )
        ),
        body
      );
    }

    function apply(ctx) {
      ctx.effect(function () {
        return injectStyle(CSS);
      }, "dsh-ticker-jp: styles");
      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register(
          { name: "shell.overlay", id: "dsh-ticker-jp" },
          function () { return React.createElement(StockWidget); },
        );
      });
    }

    exports.name = "dsh-ticker-jp";
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
