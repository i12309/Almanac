/* Almanac: presentation only. Authored content and calculation kernels are separate. */
(function () {
  'use strict';
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = (value, digits = 2) => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: digits}).format(value);
  const app = $('#app');
  const data = window.AlmanacContent;
  const works = data?.works || [];
  const views = {story:'Читать', charts:'Графики', gallery:'Иллюстрации', lab:'Лаборатория', code:'Код', sources:'Материалы'};
  const chartInstances = new Map();
  let activeWork = null;
  let catalogMode = 'list';
  let searchQuery = '';
  let activeCodeIndex = 0;
  let toastTimer;
  let galleryIndex = 0;
  let galleryFigures = [];
  let imageZoom = 1;
  let imageOffset = {x: 0, y: 0};
  let imageDrag = null;
  const workYear = work => work.year === null ? 'Год неизвестен' : String(work.year);
  const isDemo = work => work.status === 'demo';
  const workStatus = work => isDemo(work) ? 'Учебная глава' : work.status === 'draft' ? 'Черновик' : 'По материалам архива';
  const provenanceLabel = value => ({demo:'Учебные данные',original:'Оригинал',derived:'По исходным данным',reconstructed:'Реконструкция'}[value] || 'Данные работы');
  const workURL = (work, view = 'story') => `#work/${encodeURIComponent(work.id)}/${view}`;
  const demoNotice = works.some(work => work.status === 'demo') ? '<div class="demo-notice"><span class="demo-badge">Демо</span><span>Учебные материалы и условные даты. Учебные главы помечены отдельно от материалов архива.</span></div>' : '';

  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3200);
  }
  function restoreTheme() {
    let theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    try { theme = localStorage.getItem('almanac-theme') || theme; } catch (_) { /* file:// storage is optional */ }
    applyTheme(theme === 'dark' ? 'dark' : 'light');
  }
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('#theme-toggle').setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
    try { localStorage.setItem('almanac-theme', theme); } catch (_) { /* keep session theme */ }
  }
  $('#theme-toggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#menu-toggle').addEventListener('click', () => {
    const isOpen = $('#sidebar').classList.toggle('is-open');
    $('#menu-toggle').setAttribute('aria-expanded', String(isOpen));
  });
  restoreTheme();
  $('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    $('#main-content').focus({preventScroll:true});
    $('#main-content').scrollIntoView({behavior:'auto'});
  });

  function sidebar(work, view) {
    $('#work-nav').innerHTML = works.map(item => `<a href="${workURL(item)}" ${work?.id === item.id ? 'aria-current="page"' : ''}><span class="nav-year">${escape(workYear(item))}${isDemo(item) ? ' · ДЕМО' : ''}</span>${escape(item.title)}</a>`).join('');
    $('#chapter-nav').innerHTML = work && view === 'story' ? `<p class="eyebrow">В этой главе</p>${work.sections.map(section => `<a href="${workURL(work)}" data-jump="section-${escape(section.id)}">${escape(section.title)}</a>`).join('')}` : '';
  }
  $('#chapter-nav').addEventListener('click', event => {
    const anchor = event.target.closest('[data-jump]');
    if (!anchor) return;
    event.preventDefault();
    const section = document.getElementById(anchor.dataset.jump);
    $('#sidebar').classList.remove('is-open');
    $('#menu-toggle').setAttribute('aria-expanded', 'false');
    section?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  });

  function renderLibrary() {
    document.title = 'Альманах — история работ';
    app.innerHTML = `<div class="library-header"><div><div class="eyebrow">Личный архив / первое издание</div><h1>История в работах</h1><p>Задачи, исследования и программы — с объяснениями, исходниками и экспериментами, которые можно повторить.</p></div><div class="volume-number">Том I<br><span class="small-text">Эскиз альманаха</span></div></div>${demoNotice}<div class="catalog-toolbar"><label class="search-field"><span class="sr-only">Поиск по названиям, описаниям и темам работ</span><input id="catalog-search" type="search" autocomplete="off" placeholder="Найти работу или тему…" value="${escape(searchQuery)}"></label><div class="segmented" role="group" aria-label="Вид каталога"><button type="button" data-mode="list" aria-pressed="${catalogMode === 'list'}">Хронология</button><button type="button" data-mode="grid" aria-pressed="${catalogMode === 'grid'}">Карточки</button></div></div><div class="catalog-caption"><span id="catalog-count" aria-live="polite"></span><span>${works.every(isDemo) ? 'ДАТЫ И МАТЕРИАЛЫ УСЛОВНЫЕ' : 'КАТАЛОГ РАБОТ'}</span></div><div id="catalog-results"></div><div class="library-note"><section><h3>Читать на разной глубине</h3><p>Начните с истории работы. Откройте графики и иллюстрации, затем перейдите к эксперименту и исходному коду.</p></section><section><h3>Сохранить связь с оригиналом</h3><p>У каждой главы есть материалы и пояснения к результатам. Здесь показано, как будет устроен ваш будущий архив.</p></section></div>`;
    $('#catalog-search').addEventListener('input', event => { searchQuery = event.target.value; renderCatalogResults(); });
    $$('[data-mode]', app).forEach(button => button.addEventListener('click', () => {
      catalogMode = button.dataset.mode;
      $$('[data-mode]', app).forEach(item => item.setAttribute('aria-pressed', String(item.dataset.mode === catalogMode)));
      renderCatalogResults();
    }));
    renderCatalogResults();
  }
  function renderCatalogResults() {
    const query = searchQuery.trim().toLocaleLowerCase('ru-RU');
    const selected = works.filter(work => `${work.title} ${work.subtitle} ${work.summary} ${work.tags.join(' ')}`.toLocaleLowerCase('ru-RU').includes(query));
    $('#catalog-count').textContent = `Работ: ${selected.length} из ${works.length}`;
    const container = $('#catalog-results');
    container.className = `catalog-${catalogMode}`;
    container.innerHTML = selected.length ? selected.map(work => `<a class="work-card" href="${workURL(work)}"><div class="card-year">${escape(workYear(work))}${isDemo(work) ? '<small>условная дата</small>' : ''}</div><div class="card-copy"><div class="eyebrow">${escape(work.kind)}</div><h2>${escape(work.title)}</h2><p>${escape(work.summary)}</p><div class="tag-row">${work.tags.map(tag => `<span>${escape(tag)}</span>`).join('')}</div></div>${work.cover ? `<figure class="card-figure"><img src="${escape(work.cover)}" alt="" loading="lazy"><span class="card-open" aria-hidden="true">↗</span></figure>` : ''}</a>`).join('') : '<div class="empty-state"><h2>Работы не найдены</h2><p>Попробуйте другое название или тему.</p></div>';
  }

  function renderWork(work, view) {
    document.title = `${work.title} — Альманах`;
    const countForView = {charts:work.charts.length, gallery:work.figures.length, code:work.code.length, sources:work.sources.length};
    app.innerHTML = `<div class="breadcrumb"><a href="#library">Все работы</a> / ${escape(work.kind)}</div><header class="work-heading"><div class="eyebrow"><span>${escape(workYear(work))}${isDemo(work) ? ' · условная дата' : ''}</span><span>${escape(work.kind)}</span><span class="demo-badge">${escape(workStatus(work))}</span></div><h1>${escape(work.title)}</h1><p class="work-subtitle">${escape(work.subtitle)}</p><div class="work-meta"><div class="tag-row">${work.tags.map(tag => `<span>${escape(tag)}</span>`).join('')}</div><a class="print-link" href="read/${escape(work.id)}.html" target="_blank" rel="noopener">Чтение и печать ↗</a></div></header><nav class="view-tabs" aria-label="Разделы работы">${Object.entries(views).map(([key,label]) => `<a href="${workURL(work,key)}" ${view === key ? 'aria-current="page"' : ''}>${label}${countForView[key] ? `<small>${countForView[key]}</small>` : ''}</a>`).join('')}</nav><div id="work-view"></div>${pagination(work)}`;
    const target = $('#work-view');
    if (view === 'story') renderStory(target, work);
    if (view === 'charts') renderCharts(target, work);
    if (view === 'gallery') renderGallery(target, work);
    if (view === 'lab') renderLab(target, work);
    if (view === 'code') { activeCodeIndex = 0; renderCode(target, work); }
    if (view === 'sources') renderSources(target, work);
  }
  function pagination(work) {
    const index = works.findIndex(item => item.id === work.id);
    const previous = works[index - 1];
    const next = works[index + 1];
    return `<nav class="chapter-pagination" aria-label="Перелистывание работ">${previous ? `<a href="${workURL(previous)}"><small>← Предыдущая работа</small>${escape(previous.title)}</a>` : '<a href="#library"><small>К оглавлению</small>← Все работы</a>'}${next ? `<a href="${workURL(next)}"><small>Следующая работа →</small>${escape(next.title)}</a>` : '<a href="#library"><small>Вы прочитали последнюю главу</small>Все работы →</a>'}</nav>`;
  }
  function figureHTML(figure, index, className = 'inline-figure') {
    return `<figure class="${className}"><button class="figure-button" type="button" data-image="${index}" aria-label="Увеличить: ${escape(figure.title)}"><img src="${escape(figure.path)}" alt="${escape(figure.alt)}" loading="lazy"></button><figcaption><span class="figure-number">Рис. ${index + 1}.</span> ${escape(figure.caption)} <span class="muted">Нажмите для увеличения.</span></figcaption></figure>`;
  }
  function renderStory(target, work) {
    let body = '';
    work.sections.forEach((section, index) => {
      body += `<section class="story-section" id="section-${escape(section.id)}"><h2>${escape(section.title)}</h2>${section.paragraphs.map(paragraph => `<p>${escape(paragraph)}</p>`).join('')}${section.formula ? `<div class="formula">${escape(section.formula)}</div>` : ''}</section>`;
      if (index === 0 && work.figures[0]) body += figureHTML(work.figures[0], 0);
      if (index === 1 && work.charts[0]) body += chartPanel('story-chart', work.charts[0]);
      if (index === 2) body += `<aside class="lab-teaser"><h3>Попробовать самому</h3><p>${escape(work.experiment.note)}</p><a href="${workURL(work,'lab')}">Открыть лабораторию →</a></aside>`;
    });
    target.innerHTML = `<div class="story-layout"><article class="story-content">${body}</article><aside class="reading-margin"><h3>Примечания к главе</h3>${work.methodNotes.map(note => `<p>${escape(note)}</p>`).join('')}<a href="${workURL(work,'sources')}">Материалы этой работы →</a></aside></div>`;
    if (work.charts[0]) attachChart('story-chart', work.charts[0]);
  }
  function chartPanel(id, config) {
    return `<section class="chart-panel" aria-label="${escape(config.title)}"><div data-chart-host="${id}"></div><div class="chart-actions"><span class="provenance">${escape(provenanceLabel(config.provenance || 'demo'))}</span><div class="button-group"><button class="button small" type="button" data-chart-action="csv" data-chart-id="${id}">Данные CSV ↓</button><button class="button small" type="button" data-chart-action="svg" data-chart-id="${id}">График SVG ↓</button></div></div><details class="data-details"><summary>Таблица значений</summary><div class="table-wrap" data-chart-table="${id}">${chartTable(config)}</div></details></section>`;
  }
  function chartTable(config) {
    const xValues = Array.from(new Set(config.series.flatMap(series => series.values.map(point => point[0])))).sort((a,b) => a-b);
    return `<table><caption class="sr-only">${escape(config.title)}. Полные исходные данные графика.</caption><thead><tr><th scope="col">${escape(config.xLabel)}</th>${config.series.map(series => `<th scope="col">${escape(series.name)}<br>${escape(config.yLabel)}</th>`).join('')}</tr></thead><tbody>${xValues.map(x => `<tr><th scope="row">${number(x,6)}</th>${config.series.map(series => { const point=series.values.find(value => value[0] === x); return `<td>${point ? number(point[1],8) : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function attachChart(id, config) {
    const container = $(`[data-chart-host="${id}"]`, app);
    if (!container || !window.AlmanacChart) return;
    const controller = window.AlmanacChart.mount(container, {...config, height:285});
    chartInstances.set(id, {controller, config});
  }
  function updateChart(id, config) {
    const item = chartInstances.get(id);
    if (!item) return;
    item.config = config;
    item.controller.update(config);
    const table = $(`[data-chart-table="${id}"]`, app);
    if (table) table.innerHTML = chartTable(config);
  }
  function renderCharts(target, work) {
    target.innerHTML = `<div class="section-intro"><h2>От графика — к значениям</h2><p>Сравните ряды, наведите указатель или коснитесь графика. Точки можно изучать кнопками, а исходные значения — открыть таблицей и скачать.</p></div>${work.charts.length ? work.charts.map((config,index) => chartPanel(`chart-${index}`,config)).join('') : '<p class="muted">Для этой работы пока нет подготовленных графиков.</p>'}`;
    work.charts.forEach((config,index) => attachChart(`chart-${index}`,config));
  }
  function renderGallery(target, work) {
    target.innerHTML = `<div class="section-intro"><h2>Иллюстрации и схемы</h2><p>Откройте изображение, увеличьте детали и перелистывайте материалы. ${isDemo(work) ? 'Все иллюстрации этой главы подготовлены для демонстрации.' : 'Происхождение изображений указано в подписях и материалах работы.'}</p></div>${work.figures.length ? '' : '<p class="muted">Иллюстрации для этой главы пока не добавлены.</p>'}<div class="gallery">${work.figures.map((figure,index) => `<figure><button class="figure-button" type="button" data-image="${index}" aria-label="Увеличить: ${escape(figure.title)}"><img src="${escape(figure.path)}" alt="${escape(figure.alt)}" loading="lazy"></button><figcaption><span class="gallery-caption-title">${index+1}. ${escape(figure.title)}</span>${escape(figure.caption)}</figcaption></figure>`).join('')}</div>`;
  }
  function highlightedLine(line, language) {
    if (language === 'text') return escape(line);
    const matcher = /(\/\/.*$|\{[^}]*\}|\(\*.*?\*\)|'(?:''|[^'])*'|"(?:\\.|[^"\\])*"|\b(?:program|uses|const|type|var|function|procedure|begin|end|if|then|else|for|to|downto|do|while|repeat|until|case|of|array|integer|double|boolean|string|word|byte|and|or|xor|shl|shr|not|div|mod|let|return|new|true|false)\b|\b\d+(?:\.\d+)?\b)/gi;
    let result = '', position = 0;
    for (const match of line.matchAll(matcher)) {
      result += escape(line.slice(position,match.index));
      const token=match[0];
      const type=/^(\/\/|\{|\(\*)/.test(token) ? 'comment' : /^['"]/.test(token) ? 'string' : /^\d/.test(token) ? 'number' : 'keyword';
      result += `<span class="token-${type}">${escape(token)}</span>`;
      position = match.index + token.length;
    }
    return result + escape(line.slice(position));
  }
  function renderCode(target, work) {
    const item = work.code[activeCodeIndex];
    if (!item) { target.innerHTML = '<p>Исходники для этой главы ещё не подготовлены.</p>'; return; }
    const filename = item.path.split('/').pop();
    const picker = work.code.length > 1 ? `<label class="code-select">Файл<select id="code-select">${work.code.map((entry,index) => `<option value="${index}" ${index === activeCodeIndex ? 'selected' : ''}>${escape(entry.title)}</option>`).join('')}</select></label>` : `<div><div class="eyebrow">${escape(item.language)} / демонстрационный исходник</div><div class="code-label">${escape(filename)}</div></div>`;
    target.innerHTML = `<div class="section-intro"><h2>Код, который можно прочитать</h2><p>Полный текст файла, пояснения и выделенные фрагменты. Работающий браузерный пример доступен в лаборатории.</p></div><div class="code-toolbar">${picker}<div class="button-group"><button class="button small" type="button" data-action="copy-code">Копировать</button><a class="button small" href="${escape(item.path)}" download>Исходник ↓</a></div></div><div class="code-layout"><div class="code-box" aria-label="Исходный код ${escape(filename)}"><ol class="code-lines">${item.text.replace(/\n$/, '').split('\n').map((line,index) => `<li data-code-line="${index+1}"><code>${highlightedLine(line,item.language) || ' '}</code></li>`).join('')}</ol></div><aside class="code-notes"><h3>${escape(item.title)}</h3><p>${escape(item.note)}</p>${(item.highlights || []).map((highlight,index) => `<button type="button" class="code-preset" data-code-highlight="${index}" aria-pressed="false">${escape(highlight.label)}<small>Строки ${highlight.start}–${highlight.end}</small></button>`).join('')}<p style="margin-top:20px"><a href="${workURL(work,'lab')}">Запустить пример →</a></p></aside></div>`;
    $('#code-select')?.addEventListener('change', event => { activeCodeIndex=Number(event.target.value); renderCode(target,work); });
  }
  async function copyCode() {
    const text = activeWork?.code[activeCodeIndex]?.text;
    if (!text) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('No clipboard');
      await navigator.clipboard.writeText(text);
      toast('Исходный код скопирован');
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value=text; textarea.style.position='fixed'; textarea.style.left='-9999px';
      document.body.append(textarea); textarea.select();
      let copied=false;
      try { copied=document.execCommand('copy'); } catch (_) { /* manual selection remains available */ }
      textarea.remove();
      toast(copied ? 'Исходный код скопирован' : 'Копирование недоступно. Скачайте исходник кнопкой рядом.');
    }
  }
  function renderSources(target, work) {
    target.innerHTML = `<div class="section-intro"><h2>Материалы работы</h2><p>${isDemo(work) ? 'В этом демо — подготовленные учебные файлы. Здесь будут доступны выбранные документы, исходники и данные из вашего архива.' : 'Документы, исходники и данные, на которых основана эта глава.'}</p></div><div class="sources-list">${work.sources.map(source => `<article class="source-row"><span class="source-kind" aria-hidden="true">${escape(source.path.split('.').pop())}</span><div class="source-info"><h3>${escape(source.title)}</h3><p>${escape(source.note)}</p><div class="source-path">${escape(source.path)}</div></div><a class="button small" href="${escape(source.path)}" download>Скачать ↓</a></article>`).join('')}</div><div class="lab-footnote">Сведения о происхождении материала сохраняются вместе с работой. Для реальных архивов будут отдельно отмечены оригиналы, реконструкции и современные пояснения.</div>`;
  }

  function renderLab(target, work) {
    const labs = window.AlmanacLabs;
    if (!labs) { target.innerHTML='<p>Не удалось открыть эксперименты. Проверьте, что папка альманаха распакована полностью.</p>'; return; }
    if (work.experiment.type === 'bch') renderBCH(target, work, labs.bch);
    else if (work.experiment.type === 'trains') renderTrains(target, work, labs.trains);
    else if (work.experiment.type === 'sensitivity') renderSensitivity(target, work, labs.sensitivity);
    else target.innerHTML='<p>Для этой работы интерактивный пример ещё не подготовлен.</p>';
  }
  function renderBCH(target, work, lab) {
    let original=lab.encode(0b1011001), received=original ^ (1<<4);
    target.innerHTML = `<div class="section-intro"><h2>БЧХ-код под руками</h2><p>${escape(work.experiment.note)}</p></div><section class="lab-panel"><div class="lab-head"><div><h2>Измените биты. Проверьте синдром.</h2><p>БЧХ(15,7,5) · поле GF(16) · учебная реализация</p></div><span class="demo-badge">Расчёт в браузере</span></div><div class="message-row"><label class="field">Сообщение · 7 бит<input id="bch-message" type="text" inputmode="numeric" maxlength="7" value="1011001" aria-describedby="bch-input-error" autocomplete="off" spellcheck="false"></label><p class="lab-help">Семь информационных битов дополнены восемью проверочными. Можно изменить любой из 15 битов принятого слова.</p></div><p id="bch-input-error" class="input-error" role="alert" hidden></p><div class="bit-label"><span>Принятое слово · коэффициенты при x¹⁴ … x⁰</span><span>Изменённые биты выделены цветом и состоянием кнопки</span></div><div id="bch-bits" class="bit-grid">${Array.from({length:15},(_,index) => 14-index).map(power => `<button type="button" class="bit-button" data-bit="${power}" aria-pressed="false"><span class="bit-power">${power}</span><span class="bit-value">0</span></button>`).join('')}</div><div class="lab-actions"><div class="button-group"><button class="button small" id="bch-clear" type="button">Вернуть исходное</button><button class="button small" id="bch-two" type="button">Две ошибки</button><button class="button small" id="bch-five" type="button">Пять изменений</button></div><span class="small-text muted">Исходное: <code id="bch-original"></code></span></div><div class="syndrome-grid">${[1,2,3,4].map(j=>`<div><span>Синдром S${['','₁','₂','₃','₄'][j]}</span><output id="bch-s${j}">0</output></div>`).join('')}</div><div id="bch-status" class="lab-result" role="status" aria-live="polite"></div><p class="lab-footnote">Синдромы — элементы GF(16), а не количество ошибок. Число изменённых битов известно из условий эксперимента. Нулевой синдром означает принадлежность коду и сам по себе не гарантирует совпадение с исходным словом.</p><details class="lab-params"><summary>Параметры и границы примера</summary><p>p(x) = x⁴ + x + 1; g(x) = x⁸ + x⁷ + x⁶ + x⁴ + 1. Вычисляются Sⱼ = r(αʲ), j = 1…4. В этой демонстрации нет декодера. Проверка обнаруживает любые изменения от одного до четырёх битов. Кнопка «Пять изменений» добавляет g(x) и показывает другое допустимое слово с нулевыми синдромами.</p></details></section>`;
    function update() {
      $$('[data-bit]',target).forEach(button => {
        const power=Number(button.dataset.bit), value=(received>>power)&1, changed=Boolean(((received^original)>>power)&1);
        $('.bit-value',button).textContent=String(value);
        button.setAttribute('aria-pressed',String(changed));
        button.setAttribute('aria-label',`Бит при x в степени ${power}: ${value}${changed ? ', изменён' : ''}. Переключить`);
      });
      $('#bch-original').textContent=original.toString(2).padStart(15,'0');
      const syndromes=lab.syndromes(received), changed=lab.errors(original,received), zero=syndromes.every(value=>value===0);
      syndromes.forEach((value,index) => { $(`#bch-s${index+1}`).textContent=lab.fieldLabel(value).replace(/\^(\d+)/,(_,digits)=>digits.split('').map(char=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(char)]).join('')); });
      const result=$('#bch-status'); result.classList.toggle('is-zero',zero);
      result.textContent=changed===0 ? 'Исходное кодовое слово. Все синдромы равны нулю.' : zero ? `Изменённых битов: ${changed}. Получилось другое допустимое слово — изменения не обнаружены синдромной проверкой.` : `Изменённых битов: ${changed}. Ненулевой синдром — нарушение обнаружено.`;
    }
    $$('[data-bit]',target).forEach(button=>button.addEventListener('click',()=>{ received^=1<<Number(button.dataset.bit); update(); }));
    $('#bch-clear').addEventListener('click',()=>{ received=original; update(); });
    $('#bch-two').addEventListener('click',()=>{ received=original^(1<<2)^(1<<9); update(); });
    $('#bch-five').addEventListener('click',()=>{ received=original^lab.parameters.generatorPolynomial; update(); });
    $('#bch-message').addEventListener('input',event=>{
      const valid=/^[01]{7}$/.test(event.target.value);
      $('#bch-input-error').hidden=valid; $('#bch-input-error').textContent=valid ? '' : 'Введите ровно семь символов: 0 или 1. Ниже остаётся последний корректный расчёт.';
      event.target.setAttribute('aria-invalid',String(!valid));
      if (valid) { original=lab.encode(parseInt(event.target.value,2)); received=original; update(); }
    });
    update();
  }
  function rangeControl(id,label,min,max,step,value) {
    return `<label class="range-control" for="${id}"><span>${escape(label)}<output id="${id}-value" for="${id}"></output></span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
  }
  function renderTrains(target, work, lab) {
    const state={...lab.defaults};
    const config=result=>({title:'Приведённые затраты по годам',xLabel:'Год эксплуатации',yLabel:'млн ₽',series:result.series,note:'Учебная модель: первоначальная покупка и ежегодные затраты в ценах одного условного периода. Дисконтирование на конец каждого года.'});
    target.innerHTML=`<div class="section-intro"><h2>Выбор зависит от сценария</h2><p>${escape(work.experiment.note)}</p></div><section class="lab-panel"><div class="lab-head"><div><h2>Два условных варианта поезда</h2><p>Меняйте нагрузку, цену энергии и горизонт сравнения</p></div><button class="button small" type="button" id="train-reset">Исходный сценарий</button></div><div class="range-grid">${rangeControl('train-years','Горизонт расчёта',5,40,1,state.years)}${rangeControl('train-km','Годовой пробег',50000,400000,5000,state.annualKm)}${rangeControl('train-energy','Цена энергии',1,20,.5,state.energyPrice)}${rangeControl('train-discount','Ставка дисконтирования',0,20,.5,state.discountRate*100)}</div><div class="lab-metrics"><div><span>Вариант А · приведённые затраты</span><output id="train-total-a"></output><small> млн ₽</small></div><div><span>Вариант Б · приведённые затраты</span><output id="train-total-b"></output><small> млн ₽</small></div><div><span id="train-saving-label"></span><output id="train-saving"></output><small> млн ₽</small></div></div><div id="train-chart-block">${chartPanel('train-chart',config(lab.calculate(state)))}</div><div id="train-status" class="sr-only" role="status" aria-live="polite"></div><details class="lab-params"><summary>Что включено в расчёт</summary><div class="table-wrap"><table><thead><tr><th>Параметр</th><th>А</th><th>Б</th></tr></thead><tbody><tr><th>Покупка, млн ₽</th><td>120</td><td>145</td></tr><tr><th>Энергия, кВт·ч/км</th><td>4,7</td><td>3,8</td></tr><tr><th>Обслуживание, млн ₽/год</th><td>4,2</td><td>3,4</td></tr></tbody></table></div><p>Все исходные значения придуманы для демонстрации интерфейса. Учитываются покупка в год 0 и обслуживание с энергией в конце каждого последующего года. Доходы, налоги, инфляция и остаточная стоимость не включены. Это не оценка реальных поездов и не исторический расчёт автора.</p></details></section>`;
    attachChart('train-chart',config(lab.calculate(state)));
    function update() {
      const result=lab.calculate(state);
      $('#train-years-value').textContent=`${state.years} лет`;
      $('#train-km-value').textContent=`${number(state.annualKm,0)} км`;
      $('#train-energy-value').textContent=`${number(state.energyPrice,1)} ₽/кВт·ч`;
      $('#train-discount-value').textContent=`${number(state.discountRate*100,1)} %`;
      $('#train-total-a').textContent=number(result.totals.a);
      $('#train-total-b').textContent=number(result.totals.b);
      $('#train-saving').textContent=number(Math.abs(result.totals.saving));
      $('#train-saving-label').textContent=result.totals.saving>=0 ? 'Вариант Б дешевле на' : 'Вариант А дешевле на';
      $('#train-status').textContent=`Приведённые затраты: А ${number(result.totals.a)}; Б ${number(result.totals.b)} миллионов рублей.`;
      updateChart('train-chart',config(result));
    }
    const bindings={'train-years':['years',1],'train-km':['annualKm',1],'train-energy':['energyPrice',1],'train-discount':['discountRate',.01]};
    Object.entries(bindings).forEach(([id,[key,scale]])=>$('#'+id).addEventListener('input',event=>{ state[key]=Number(event.target.value)*scale; update(); }));
    $('#train-reset').addEventListener('click',()=>{ Object.assign(state,lab.defaults); Object.entries(bindings).forEach(([id,[key,scale]])=>{ $('#'+id).value=String(state[key]/scale); }); update(); });
    update();
  }
  function renderSensitivity(target,work,lab) {
    const state={...lab.defaults};
    const config=result=>({title:'Отклик учебной модели',xLabel:'x, усл. ед.',yLabel:'y, усл. ед.',series:result.series,note:'y = A · (1 − exp(−x/τ)). Абстрактная иллюстрация влияния параметров, не результат диссертации.'});
    target.innerHTML=`<div class="section-intro"><h2>Посмотреть, что меняет параметр</h2><p>${escape(work.experiment.note)}</p></div><section class="lab-panel"><div class="lab-head"><div><h2>Одна формула, разные кривые</h2><p>Учебная модель · y = A · (1 − exp(−x/τ))</p></div><button class="button small" type="button" id="response-reset">Исходные параметры</button></div><div class="range-grid">${rangeControl('response-tau','Постоянная τ',1,10,.5,state.tau)}${rangeControl('response-gain','Масштаб A',.5,2,.05,state.gain)}</div>${chartPanel('response-chart',config(lab.calculate(state)))}<p class="lab-footnote">Параметр A задаёт предельное значение, τ — масштаб изменения по оси x. Этот пример показывает устройство будущих интерактивных моделей, а содержание реального исследования будет восстановлено по архиву.</p></section>`;
    attachChart('response-chart',config(lab.calculate(state)));
    function update() {
      $('#response-tau-value').textContent=`${number(state.tau,1)} усл. ед.`;
      $('#response-gain-value').textContent=number(state.gain,2);
      updateChart('response-chart',config(lab.calculate(state)));
    }
    $('#response-tau').addEventListener('input',event=>{ state.tau=Number(event.target.value); update(); });
    $('#response-gain').addEventListener('input',event=>{ state.gain=Number(event.target.value); update(); });
    $('#response-reset').addEventListener('click',()=>{ Object.assign(state,lab.defaults); $('#response-tau').value=state.tau; $('#response-gain').value=state.gain; update(); });
    update();
  }

  app.addEventListener('click', event => {
    const image=event.target.closest('[data-image]');
    if (image && activeWork) openImage(Number(image.dataset.image),activeWork.figures);
    const chartAction=event.target.closest('[data-chart-action]');
    if (chartAction) {
      const chart=chartInstances.get(chartAction.dataset.chartId);
      if (chart) {
        const name=`${activeWork.id}-${chartAction.dataset.chartId}`;
        if (chartAction.dataset.chartAction === 'csv') chart.controller.downloadCSV(name+'.csv');
        if (chartAction.dataset.chartAction === 'svg') chart.controller.downloadSVG(name+'.svg');
      }
    }
    if (event.target.closest('[data-action="copy-code"]')) copyCode();
    const highlightButton=event.target.closest('[data-code-highlight]');
    if (highlightButton) {
      const range=activeWork.code[activeCodeIndex].highlights[Number(highlightButton.dataset.codeHighlight)];
      $$('[data-code-highlight]',app).forEach(button=>button.setAttribute('aria-pressed',String(button === highlightButton)));
      $$('[data-code-line]',app).forEach(line=>line.classList.toggle('is-highlighted',Number(line.dataset.codeLine)>=range.start && Number(line.dataset.codeLine)<=range.end));
      const line=$(`[data-code-line="${range.start}"]`,app), box=$('.code-box',app);
      if (line && box) box.scrollTop += line.getBoundingClientRect().top-box.getBoundingClientRect().top-32;
    }
  });

  function openImage(index, figures) {
    galleryFigures=figures; galleryIndex=index;
    refreshImage();
    if (!$('#image-dialog').open) $('#image-dialog').showModal();
  }
  function refreshImage() {
    const figure=galleryFigures[galleryIndex];
    if (!figure) return;
    $('#image-title').textContent=figure.title;
    $('#image-position').textContent=`${galleryIndex+1} из ${galleryFigures.length} · ${provenanceLabel(figure.provenance)}`;
    $('#image-full').src=figure.path; $('#image-full').alt=figure.alt;
    $('#image-caption').textContent=figure.caption;
    $('#image-download').href=figure.path;
    $('#image-download').download=figure.path.split('/').pop();
    imageZoom=1; imageOffset={x:0,y:0}; updateImageTransform();
    $('#image-prev').disabled=galleryFigures.length<2; $('#image-next').disabled=galleryFigures.length<2;
  }
  function updateImageTransform() {
    $('#image-full').style.transform=`translate(${imageOffset.x}px,${imageOffset.y}px) scale(${imageZoom})`;
    $('#image-zoom-label').textContent=`${Math.round(imageZoom*100)}%`;
    $('#image-stage').classList.toggle('is-zoomed',imageZoom>1);
    $('#image-zoom-out').disabled=imageZoom<=1;
    $('#image-zoom-in').disabled=imageZoom>=4;
  }
  function stepImage(delta) { galleryIndex=(galleryIndex+delta+galleryFigures.length)%galleryFigures.length; refreshImage(); }
  $('#image-close').addEventListener('click',()=>$('#image-dialog').close());
  $('#image-dialog').addEventListener('click',event=>{ if (event.target === $('#image-dialog')) $('#image-dialog').close(); });
  $('#image-prev').addEventListener('click',()=>stepImage(-1));
  $('#image-next').addEventListener('click',()=>stepImage(1));
  $('#image-zoom-in').addEventListener('click',()=>{ imageZoom=Math.min(4,imageZoom+.5); updateImageTransform(); });
  $('#image-zoom-out').addEventListener('click',()=>{ imageZoom=Math.max(1,imageZoom-.5); if(imageZoom===1) imageOffset={x:0,y:0}; updateImageTransform(); });
  $('#image-fit').addEventListener('click',()=>{ imageZoom=1; imageOffset={x:0,y:0}; updateImageTransform(); });
  $('#image-dialog').addEventListener('keydown',event=>{
    if(event.key === 'ArrowLeft') { event.preventDefault(); stepImage(-1); }
    if(event.key === 'ArrowRight') { event.preventDefault(); stepImage(1); }
  });
  $('#image-stage').addEventListener('pointerdown',event=>{
    if(imageZoom<=1) return;
    imageDrag={x:event.clientX,y:event.clientY,start:{...imageOffset}};
    event.currentTarget.setPointerCapture(event.pointerId);
  });
  $('#image-stage').addEventListener('pointermove',event=>{
    if(!imageDrag) return;
    const bounds=event.currentTarget.getBoundingClientRect();
    const clamp=(value,limit)=>Math.max(-limit,Math.min(limit,value));
    imageOffset={x:clamp(imageDrag.start.x+event.clientX-imageDrag.x,bounds.width*(imageZoom-1)/2),y:clamp(imageDrag.start.y+event.clientY-imageDrag.y,bounds.height*(imageZoom-1)/2)};
    updateImageTransform();
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>$('#image-stage').addEventListener(type,()=>{imageDrag=null;}));

  function route() {
    chartInstances.forEach(item=>item.controller.destroy()); chartInstances.clear();
    if ($('#image-dialog').open) $('#image-dialog').close();
    $('#sidebar').classList.remove('is-open'); $('#menu-toggle').setAttribute('aria-expanded','false');
    const parts=location.hash.slice(1).split('/');
    let id;
    try { id=decodeURIComponent(parts[1] || ''); } catch (_) { id=''; }
    activeWork=parts[0] === 'work' ? works.find(work=>work.id === id) : null;
    const view=views[parts[2]] ? parts[2] : 'story';
    sidebar(activeWork,view);
    if (parts[0] === 'work' && !activeWork) app.innerHTML='<div class="empty-state"><h1>Глава не найдена</h1><p>Возможно, ссылка относится к другой версии альманаха.</p><a href="#library">Вернуться к оглавлению →</a></div>';
    else if (activeWork) renderWork(activeWork,view);
    else renderLibrary();
    window.scrollTo({top:0,behavior:'instant'});
  }
  if (!works.length) {
    app.innerHTML='<div class="empty-state"><h1>Материалы не открылись</h1><p>Распакуйте папку репозитория целиком и снова откройте index.html. Доступна также статическая версия глав.</p><a href="read/index.html">Открыть версию для чтения →</a></div>';
    return;
  }
  window.addEventListener('hashchange',route);
  route();
})();
