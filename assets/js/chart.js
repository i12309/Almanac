/* Offline SVG charts. No network, generated data, or runtime dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AlmanacChart = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = ['#1b887b', '#537fbb', '#b57937', '#8b6fb0'];
  const DASHES = ['', '8 4', '3 3', '9 3 2 3'];
  let nextId = 0;

  function prepareSeries(series) {
    const ids = new Set();
    return (Array.isArray(series) ? series : []).filter(Boolean).map(function (item, index) {
      let id = String(item.id == null ? index : item.id);
      if (ids.has(id)) id += ':' + index;
      ids.add(id);
      const points = new Map();
      (Array.isArray(item.values) ? item.values : []).forEach(function (point) {
        if (Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])) {
          points.set(point[0], point[1]);
        }
      });
      return { id: id, name: String(item.name || 'Ряд ' + (index + 1)), index: index,
        values: Array.from(points).sort(function (a, b) { return a[0] - b[0]; }), points: points };
    });
  }

  function dataDomain(values, padding) {
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return [0, 1];
    let low = Infinity, high = -Infinity;
    finite.forEach(function (value) { low = Math.min(low, value); high = Math.max(high, value); });
    if (low === high) {
      const gap = Math.max(Math.abs(low) * 0.1, 1);
      return [low - gap, high + gap];
    }
    const gap = (high - low) * (padding || 0);
    return [low - gap, high + gap];
  }

  function nearestIndex(values, target) {
    if (!values.length) return -1;
    let low = 0, high = values.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (values[middle] < target) low = middle + 1;
      else high = middle;
    }
    return low > 0 && target - values[low - 1] <= values[low] - target ? low - 1 : low;
  }

  function niceAxis(domain, count, extend) {
    const rough = (domain[1] - domain[0]) / Math.max(1, count);
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const ratio = rough / magnitude;
    const step = magnitude * (ratio >= Math.sqrt(50) ? 10 : ratio >= Math.sqrt(10) ? 5 : ratio >= Math.sqrt(2) ? 2 : 1);
    if (!Number.isFinite(step) || step <= 0) return { domain: domain, ticks: domain };
    const first = extend ? Math.floor(domain[0] / step + 1e-12) : Math.ceil(domain[0] / step - 1e-12);
    const last = extend ? Math.ceil(domain[1] / step - 1e-12) : Math.floor(domain[1] / step + 1e-12);
    const ticks = [];
    for (let index = first; index <= last && ticks.length < 30; index++) ticks.push(Number((index * step).toPrecision(12)));
    return { domain: extend ? [ticks[0], ticks[ticks.length - 1]] : domain, ticks: ticks };
  }

  function allX(series) {
    const values = new Set();
    series.forEach(function (item) { item.values.forEach(function (point) { values.add(point[0]); }); });
    return Array.from(values).sort(function (a, b) { return a - b; });
  }

  function makeCSV(series, xLabel) {
    function cell(value) {
      const text = String(value);
      return /[;"\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }
    const rows = [[xLabel || 'x'].concat(series.map(function (item) { return item.name; }))];
    allX(series).forEach(function (x) {
      rows.push([x].concat(series.map(function (item) { return item.points.has(x) ? item.points.get(x) : ''; })));
    });
    return rows.map(function (row) { return row.map(cell).join(';'); }).join('\r\n') + '\r\n';
  }

  function format(value) {
    if (value === 0 || Object.is(value, -0)) return '0';
    if (Math.abs(value) >= 1e7 || Math.abs(value) < 0.001) return value.toExponential(2).replace('.', ',');
    return new Intl.NumberFormat('ru-RU', { maximumSignificantDigits: 6 }).format(value);
  }

  function formatTick(value) {
    if (value === 0) return '0';
    const compact = new Intl.NumberFormat('ru-RU', { maximumSignificantDigits: 4 }).format(value);
    return compact.length <= 7 ? compact : value.toExponential(1).replace('.', ',');
  }

  function installStyles(document) {
    if (document.getElementById('almanac-chart-styles')) return;
    const style = document.createElement('style');
    style.id = 'almanac-chart-styles';
    style.textContent = `
.al-chart{color:var(--ink,#253c38);font-family:inherit;font-size:13px;line-height:1.5;min-width:0}
.al-chart [hidden]{display:none}
.al-chart-top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px 16px;margin-bottom:4px}
.al-chart-title{font-family:inherit;font-size:13px;font-weight:600;line-height:1.5;margin:0;color:var(--ink,#253c38)}
.al-chart-legend{display:flex;flex-wrap:wrap;gap:3px 10px}
.al-chart-legend button{font:inherit;font-size:12px;color:var(--ink,#253c38);background:none;border:1px solid transparent;border-radius:4px;display:inline-flex;align-items:center;gap:6px;padding:4px 6px;cursor:pointer;min-height:30px}
.al-chart-legend button[aria-pressed="false"]{opacity:.48;text-decoration:line-through}
.al-chart-legend button:hover{border-color:var(--line,#d8dfd9)}
.al-chart-swatch{display:inline-block;width:20px;flex:none;border-top-width:2px;border-top-style:solid}
.al-chart-plot{position:relative;min-width:0}
.al-chart-svg{display:block;width:100%;height:auto;overflow:hidden;touch-action:pan-y;font-family:inherit}
.al-chart button:focus-visible,.al-chart-svg:focus-visible{outline:2px solid var(--series-1,#1b887b);outline-offset:2px}
.al-chart-svg:focus-visible{outline-offset:-2px}
.al-chart-tooltip{pointer-events:none;position:absolute;z-index:2;top:14px;max-width:calc(100% - 16px);width:max-content;padding:9px 12px;border:1px solid var(--line,#d8dfd9);border-radius:6px;background:var(--panel,var(--surface,Canvas));color:var(--ink,#253c38);box-shadow:0 3px 14px #00000012;font-size:12px;line-height:1.65}
.al-chart-tooltip strong{display:block;font-weight:600;margin-bottom:2px}
.al-chart-tooltip-row{display:flex;align-items:baseline;gap:8px;overflow-wrap:anywhere}
.al-chart-inspector{display:flex;align-items:flex-start;gap:9px;border-top:1px solid var(--line,#d8dfd9);padding-top:9px;min-height:37px}
.al-chart-step-buttons{display:flex;gap:4px;flex:none}
.al-chart-step-buttons button{width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--line,#d8dfd9);border-radius:4px;color:var(--ink,#253c38);background:none;font-family:inherit;font-size:18px;line-height:1;cursor:pointer}
.al-chart-step-buttons button:disabled{opacity:.35;cursor:default}
.al-chart-status{color:var(--muted,#61716b);font-size:12px;line-height:1.55;padding-top:4px;overflow-wrap:anywhere;min-width:0}
.al-chart-note{font-size:11px;line-height:1.5;color:var(--muted,#61716b);margin:8px 0 0}
@media(max-width:440px){.al-chart-inspector{gap:7px}.al-chart-top{align-items:flex-start}.al-chart-legend{gap:1px}.al-chart-legend button{padding:4px}.al-chart-tooltip{font-size:11px}}
`;
    document.head.appendChild(style);
  }

  function mount(container, initialOptions) {
    if (!container || !container.ownerDocument) throw new TypeError('Нужен DOM-контейнер для графика.');
    const document = container.ownerDocument, win = document.defaultView;
    installStyles(document);
    const uid = 'al-chart-' + (++nextId);
    const wrapper = document.createElement('section');
    wrapper.className = 'al-chart';
    wrapper.innerHTML = '<div class="al-chart-top"><h4 class="al-chart-title"></h4><div class="al-chart-legend" role="group" aria-label="Ряды графика"></div></div>' +
      '<div class="al-chart-plot"><svg class="al-chart-svg" xmlns="' + NS + '" role="img" tabindex="0"></svg><div class="al-chart-tooltip" aria-hidden="true" hidden></div></div>' +
      '<div class="al-chart-inspector"><div class="al-chart-step-buttons"><button type="button" aria-label="Предыдущая точка">‹</button><button type="button" aria-label="Следующая точка">›</button></div><output class="al-chart-status" aria-live="polite" aria-atomic="true"></output></div><p class="al-chart-note" hidden></p>';
    container.appendChild(wrapper);
    const title = wrapper.querySelector('.al-chart-title'), legend = wrapper.querySelector('.al-chart-legend');
    const plot = wrapper.querySelector('.al-chart-plot'), svg = wrapper.querySelector('svg');
    const tooltip = wrapper.querySelector('.al-chart-tooltip'), status = wrapper.querySelector('output');
    const note = wrapper.querySelector('.al-chart-note'), buttons = wrapper.querySelectorAll('.al-chart-step-buttons button');
    let options = {}, series = [], hidden = new Set(), visible = [], xs = [], selected = 0;
    let width = 640, height = 280, margin, xScale, yScale, inspection, destroyed = false;
    let resizeObserver;

    function element(tag, attributes, text, parent) {
      const node = document.createElementNS(NS, tag);
      Object.keys(attributes || {}).forEach(function (key) { node.setAttribute(key, attributes[key]); });
      if (text != null) node.textContent = text;
      if (parent) parent.appendChild(node);
      return node;
    }

    function color(item) { return 'var(--series-' + (item.index % 4 + 1) + ',' + COLORS[item.index % 4] + ')'; }
    function marker(parent, item, x, y, size) {
      const attrs = { fill: color(item), stroke: 'var(--panel,var(--surface,Canvas))', 'stroke-width': 1.3 };
      switch (item.index % 4) {
        case 1: Object.assign(attrs, { x: x - size, y: y - size, width: size * 2, height: size * 2 }); return element('rect', attrs, null, parent);
        case 2: attrs.points = [x + ',' + (y - size - 1), (x + size + 1) + ',' + y, x + ',' + (y + size + 1), (x - size - 1) + ',' + y].join(' '); return element('polygon', attrs, null, parent);
        case 3: attrs.points = [x + ',' + (y - size - 1), (x + size + 1) + ',' + (y + size), (x - size - 1) + ',' + (y + size)].join(' '); return element('polygon', attrs, null, parent);
        default: Object.assign(attrs, { cx: x, cy: y, r: size }); return element('circle', attrs, null, parent);
      }
    }

    function inspect(showTooltip, announce) {
      if (!inspection) return;
      inspection.replaceChildren();
      tooltip.replaceChildren();
      tooltip.hidden = !showTooltip || !xs.length;
      buttons[0].disabled = !xs.length || selected === 0;
      buttons[1].disabled = !xs.length || selected === xs.length - 1;
      status.setAttribute('aria-live', announce ? 'polite' : 'off');
      if (!xs.length) {
        status.textContent = series.some(function (item) { return item.values.length; }) ? 'Выберите ряд в легенде.' : 'В этом наборе пока нет числовых данных.';
        return;
      }
      const x = xs[selected], px = xScale(x), label = (options.xLabel || 'x') + ': ' + format(x);
      const values = visible.map(function (item) { return item.name + ': ' + (item.points.has(x) ? format(item.points.get(x)) : 'нет значения'); });
      status.textContent = label + ' · ' + values.join(' · ');
      element('line', { x1: px, x2: px, y1: margin.top, y2: height - margin.bottom, stroke: 'var(--muted,#61716b)', 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0.55 }, null, inspection);
      const strong = document.createElement('strong');
      strong.textContent = label;
      tooltip.appendChild(strong);
      visible.forEach(function (item, index) {
        if (item.points.has(x)) marker(inspection, item, px, yScale(item.points.get(x)), 4);
        const row = document.createElement('div');
        row.className = 'al-chart-tooltip-row';
        const swatch = document.createElement('span');
        swatch.className = 'al-chart-swatch';
        swatch.style.borderColor = color(item);
        swatch.style.borderTopStyle = item.index % 4 ? 'dashed' : 'solid';
        const text = document.createElement('span');
        text.textContent = values[index];
        row.append(swatch, text);
        tooltip.appendChild(row);
      });
      if (showTooltip) {
        const pixelX = px * plot.clientWidth / width;
        tooltip.style.left = Math.max(8, Math.min(plot.clientWidth - tooltip.offsetWidth - 8, pixelX > plot.clientWidth / 2 ? pixelX - tooltip.offsetWidth - 12 : pixelX + 12)) + 'px';
      }
    }

    function draw() {
      if (destroyed) return;
      const oldX = xs[selected];
      width = Math.max(280, Math.round(plot.clientWidth || 640));
      height = Math.max(210, Math.min(700, Number(options.height) || 280));
      margin = { left: 64, right: 19, top: 18, bottom: 43 };
      visible = series.filter(function (item) { return !hidden.has(item.id); });
      xs = allX(visible);
      selected = oldX == null ? 0 : Math.max(0, nearestIndex(xs, oldX));
      const tickCount = Math.max(2, Math.min(6, Math.floor((width - margin.left - margin.right) / 75)));
      const xAxis = niceAxis(dataDomain(xs, 0), tickCount, false), xd = xAxis.domain;
      const yAxis = niceAxis(dataDomain(visible.flatMap(function (item) { return item.values.map(function (point) { return point[1]; }); }), 0.08), 4, true), yd = yAxis.domain;
      xScale = function (x) { return margin.left + (x - xd[0]) / (xd[1] - xd[0]) * (width - margin.left - margin.right); };
      yScale = function (y) { return height - margin.bottom - (y - yd[0]) / (yd[1] - yd[0]) * (height - margin.top - margin.bottom); };
      svg.replaceChildren();
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.setAttribute('aria-labelledby', uid + '-title ' + uid + '-description');
      element('title', { id: uid + '-title' }, options.title || 'График', svg);
      element('desc', { id: uid + '-description' }, 'Линейный график. ' + (options.xLabel || 'x') + '; ' + (options.yLabel || 'y') + '. Стрелки влево и вправо выбирают точку. Значения всех рядов доступны под графиком.', svg);
      const defs = element('defs', {}, null, svg), clip = element('clipPath', { id: uid + '-clip' }, null, defs);
      element('rect', { x: margin.left - 6, y: margin.top - 6, width: width - margin.left - margin.right + 12, height: height - margin.top - margin.bottom + 12 }, null, clip);
      const axisText = { fill: 'var(--muted,#61716b)', 'font-size': 10, 'font-family': 'inherit' };
      yAxis.ticks.forEach(function (value) {
        const y = yScale(value);
        element('line', { x1: margin.left, x2: width - margin.right, y1: y, y2: y, stroke: 'var(--line,#d8dfd9)', 'stroke-width': 1 }, null, svg);
        element('text', Object.assign({}, axisText, { x: margin.left - 8, y: y + 3, 'text-anchor': 'end' }), formatTick(value), svg);
      });
      xAxis.ticks.forEach(function (value) {
        const x = xScale(value), anchor = x < margin.left + 2 ? 'start' : x > width - margin.right - 2 ? 'end' : 'middle';
        element('text', Object.assign({}, axisText, { x: x, y: height - margin.bottom + 18, 'text-anchor': anchor }), formatTick(value), svg);
      });
      element('text', Object.assign({}, axisText, { x: (margin.left + width - margin.right) / 2, y: height - 3, 'text-anchor': 'middle' }), options.xLabel || 'x', svg);
      element('text', Object.assign({}, axisText, { transform: 'translate(13 ' + ((margin.top + height - margin.bottom) / 2) + ') rotate(-90)', 'text-anchor': 'middle' }), options.yLabel || 'y', svg);
      const lines = element('g', { 'clip-path': 'url(#' + uid + '-clip)' }, null, svg);
      visible.forEach(function (item) {
        const path = item.values.map(function (point, index) { return (index ? 'L' : 'M') + xScale(point[0]) + ',' + yScale(point[1]); }).join(' ');
        if (path) element('path', { d: path, fill: 'none', stroke: color(item), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-dasharray': DASHES[item.index % 4] }, null, lines);
        if (item.values.length < 45) item.values.forEach(function (point) { marker(lines, item, xScale(point[0]), yScale(point[1]), 2.8); });
      });
      if (!xs.length) element('text', { x: (margin.left + width - margin.right) / 2, y: height / 2, 'text-anchor': 'middle', fill: 'var(--muted,#61716b)', 'font-size': 12 }, 'Нет отображаемых данных', svg);
      inspection = element('g', { 'aria-hidden': 'true' }, null, svg);
      inspect(false, false);
    }

    function update(nextOptions) {
      if (destroyed) return;
      options = Object.assign({}, options, nextOptions || {});
      series = prepareSeries(options.series);
      hidden = new Set(Array.from(hidden).filter(function (id) { return series.some(function (item) { return item.id === id; }); }));
      if (series.length === 1) hidden.delete(series[0].id);
      title.textContent = options.title || 'График';
      note.textContent = options.note || '';
      note.hidden = !options.note;
      legend.replaceChildren();
      legend.hidden = series.length < 2;
      series.forEach(function (item) {
        const button = document.createElement('button'), swatch = document.createElement('span');
        button.type = 'button';
        button.setAttribute('aria-pressed', String(!hidden.has(item.id)));
        swatch.className = 'al-chart-swatch';
        swatch.style.borderColor = color(item);
        swatch.style.borderTopStyle = item.index % 4 ? 'dashed' : 'solid';
        button.append(swatch, document.createTextNode(item.name));
        button.addEventListener('click', function () {
          if (hidden.has(item.id)) hidden.delete(item.id); else hidden.add(item.id);
          button.setAttribute('aria-pressed', String(!hidden.has(item.id)));
          draw();
        });
        legend.appendChild(button);
      });
      draw();
    }

    function move(delta) {
      selected = Math.max(0, Math.min(xs.length - 1, selected + delta));
      inspect(false, true);
    }
    buttons[0].addEventListener('click', function () { move(-1); });
    buttons[1].addEventListener('click', function () { move(1); });
    svg.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        move(event.key === 'Home' ? -xs.length : event.key === 'End' ? xs.length : event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    function pointer(event) {
      if (!xs.length) return;
      const bounds = svg.getBoundingClientRect();
      if (!bounds.width) return;
      const px = (event.clientX - bounds.left) / bounds.width * width;
      selected = nearestIndex(xs, xs[0] + (px - xScale(xs[0])) / (xScale(xs[xs.length - 1]) - xScale(xs[0]) || 1) * (xs[xs.length - 1] - xs[0]));
      inspect(true, false);
    }
    svg.addEventListener('pointermove', pointer);
    svg.addEventListener('pointerdown', pointer);
    svg.addEventListener('pointerleave', function () { tooltip.hidden = true; });

    function download(blob, filename) {
      const url = win.URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      win.setTimeout(function () { win.URL.revokeObjectURL(url); }, 1000);
    }

    function downloadSVG(filename) {
      const clone = svg.cloneNode(true), originals = [svg].concat(Array.from(svg.querySelectorAll('*')));
      const copies = [clone].concat(Array.from(clone.querySelectorAll('*')));
      const properties = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor'];
      originals.forEach(function (original, index) {
        const computed = win.getComputedStyle(original);
        properties.forEach(function (property) { copies[index].style.setProperty(property, computed.getPropertyValue(property)); });
      });
      clone.removeAttribute('tabindex');
      const content = element('g', {}, null);
      Array.from(clone.children).forEach(function (child) {
        if (!['title', 'desc', 'defs'].includes(child.tagName)) content.appendChild(child);
      });
      clone.appendChild(content);
      const font = win.getComputedStyle(svg).fontFamily, ink = win.getComputedStyle(wrapper).color;
      let headerY = 23;
      function caption(text, x, attrs) {
        const limit = Math.max(15, Math.floor((width - x - 20) / 7));
        const words = String(text).split(/\s+/), rows = [];
        let row = '';
        words.forEach(function (word) {
          if (row && row.length + word.length + 1 > limit) { rows.push(row); row = ''; }
          row += (row ? ' ' : '') + word;
        });
        if (row) rows.push(row);
        rows.forEach(function (line) {
          element('text', Object.assign({ x: x, y: headerY, fill: ink, 'font-family': font, 'font-size': 12 }, attrs), line, clone);
          headerY += 18;
        });
      }
      caption(options.title || 'График', 20, { 'font-weight': 600, 'font-size': 14 });
      headerY += 3;
      visible.forEach(function (item) {
        const sourcePath = Array.from(svg.querySelectorAll('path')).find(function (path) { return path.getAttribute('stroke') === color(item); });
        const lineColor = sourcePath ? win.getComputedStyle(sourcePath).stroke : COLORS[item.index % 4];
        element('line', { x1: 21, x2: 41, y1: headerY - 4, y2: headerY - 4, stroke: lineColor, 'stroke-width': 2, 'stroke-dasharray': DASHES[item.index % 4] }, null, clone);
        caption(item.name, 49);
      });
      content.setAttribute('transform', 'translate(0 ' + headerY + ')');
      let exportHeight = height + headerY;
      if (options.note) {
        headerY = exportHeight + 12;
        caption(options.note, 20, { 'font-size': 10, fill: win.getComputedStyle(note).color });
        exportHeight = headerY + 4;
      }
      clone.setAttribute('viewBox', '0 0 ' + width + ' ' + exportHeight);
      clone.setAttribute('width', width);
      clone.setAttribute('height', exportHeight);
      clone.setAttribute('xmlns', NS);
      let background = wrapper, fill = 'white';
      while (background) {
        const value = win.getComputedStyle(background).backgroundColor;
        if (value && value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)') { fill = value; break; }
        background = background.parentElement;
      }
      const backdrop = element('rect', { x: 0, y: 0, width: width, height: exportHeight, fill: fill });
      clone.insertBefore(backdrop, clone.firstChild);
      clone.querySelector('desc').textContent += ' Видимые ряды: ' + visible.map(function (item) { return item.name; }).join(', ') + '. ' + (options.note || '');
      download(new win.Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + new win.XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }), filename || 'almanac-chart.svg');
    }

    update(initialOptions);
    if (win.ResizeObserver) { resizeObserver = new win.ResizeObserver(draw); resizeObserver.observe(plot); }
    else win.addEventListener('resize', draw);
    return {
      update: update,
      destroy: function () { destroyed = true; if (resizeObserver) resizeObserver.disconnect(); else win.removeEventListener('resize', draw); wrapper.remove(); },
      toCSV: function () { return makeCSV(series, options.xLabel); },
      downloadCSV: function (filename) { download(new win.Blob(['\uFEFF' + makeCSV(series, options.xLabel)], { type: 'text/csv;charset=utf-8' }), filename || 'almanac-data.csv'); },
      downloadSVG: downloadSVG
    };
  }

  return { mount: mount, prepareSeries: prepareSeries, dataDomain: dataDomain, niceAxis: niceAxis, nearestIndex: nearestIndex, makeCSV: makeCSV };
}));
