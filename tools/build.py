#!/usr/bin/env python3
"""Validate authored JSON and materialize the portable edition. Python stdlib only."""
from __future__ import annotations

import argparse
import copy
import html
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLUG = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
PROVENANCE = {'demo', 'original', 'derived', 'reconstructed'}
TOP_FIELDS = {'schemaVersion', 'id', 'title', 'subtitle', 'kind', 'year', 'status', 'summary',
              'tags', 'cover', 'sections', 'figures', 'charts', 'code', 'sources', 'experiment', 'methodNotes'}


def fail(condition, message):
    if not condition:
        raise ValueError(message)


def text(value, label, allow_empty=False):
    fail(isinstance(value, str) and (allow_empty or bool(value.strip())), f'{label}: требуется текст')


def asset(root, value, label):
    text(value, label)
    fail(value.startswith('content/assets/') and '\\' not in value and '?' not in value and '#' not in value,
         f'{label}: нужен относительный путь внутри content/assets/')
    parts = value.split('/')
    fail(all(part not in ('', '.', '..') for part in parts), f'{label}: некорректные компоненты пути')
    path = (root / value).resolve()
    fail(path.is_relative_to((root / 'content/assets').resolve()), f'{label}: путь выходит за content/assets/')
    fail(path.is_file(), f'{label}: файл не найден: {value}')
    return path


def validate_work(work, root=ROOT):
    fail(isinstance(work, dict), 'работа должна быть JSON-объектом')
    fail(set(work) == TOP_FIELDS, f'поля работы: отсутствуют {sorted(TOP_FIELDS-set(work))}, лишние {sorted(set(work)-TOP_FIELDS)}')
    fail(type(work['schemaVersion']) is int and work['schemaVersion'] == 1, 'поддерживается schemaVersion: 1')
    fail(isinstance(work['id'], str) and SLUG.fullmatch(work['id']), 'id: нужны латиница, цифры и дефисы')
    for key in ('title', 'subtitle', 'kind', 'summary'):
        text(work[key], key)
    fail(work['year'] is None or (type(work['year']) is int and 0 <= work['year'] <= 3000), 'year: целое число или null')
    fail(work['status'] in {'demo', 'draft', 'reviewed'}, 'status: demo/draft/reviewed')
    for key in ('tags', 'methodNotes'):
        fail(isinstance(work[key], list), f'{key}: нужен массив')
        for value in work[key]:
            text(value, key)
    text(work['cover'], 'cover', allow_empty=True)
    if work['cover']:
        asset(root, work['cover'], 'cover')
    for key in ('sections', 'figures', 'charts', 'code', 'sources'):
        fail(isinstance(work[key], list), f'{key}: нужен массив')
        ids = set()
        for item in work[key]:
            fail(isinstance(item, dict), f'{key}: элементы должны быть объектами')
            item_id = item.get('id')
            fail(isinstance(item_id, str) and SLUG.fullmatch(item_id) and item_id not in ids,
                 f'{key}: id должен быть уникальным slug')
            ids.add(item_id)
            text(item.get('title'), f'{key}.{item_id}.title')
    fail(bool(work['sections']), 'нужен хотя бы один раздел sections')
    for section in work['sections']:
        fail(isinstance(section.get('paragraphs'), list) and bool(section['paragraphs']), 'section.paragraphs: нужен непустой массив')
        for paragraph in section['paragraphs']:
            text(paragraph, 'section.paragraphs')
        if 'formula' in section:
            text(section['formula'], 'section.formula')
    for figure in work['figures']:
        asset(root, figure.get('path'), 'figure.path')
        for key in ('caption', 'alt'):
            text(figure.get(key), f'figure.{key}')
        fail(figure.get('provenance') in PROVENANCE, 'figure.provenance: неизвестный статус')
    for chart in work['charts']:
        for key in ('xLabel', 'yLabel', 'note'):
            text(chart.get(key), f'chart.{key}')
        fail(chart.get('provenance') in PROVENANCE, 'chart.provenance: неизвестный статус')
        fail(isinstance(chart.get('series'), list) and bool(chart['series']), 'chart.series: нужен непустой массив')
        series_ids = set()
        for series in chart['series']:
            text(series.get('id'), 'series.id')
            fail(series['id'] not in series_ids, 'series.id: дубликат')
            series_ids.add(series['id'])
            text(series.get('name'), 'series.name')
            fail(isinstance(series.get('values'), list) and bool(series['values']), 'series.values: нужны точки')
            last_x = None
            for point in series['values']:
                fail(isinstance(point, list) and len(point) == 2, 'точка должна иметь вид [x,y]')
                fail(all(type(value) in (int, float) and math.isfinite(value) for value in point), 'координаты должны быть конечными числами')
                fail(last_x is None or point[0] > last_x, 'координаты x должны строго возрастать')
                last_x = point[0]
    for code in work['code']:
        path = asset(root, code.get('path'), 'code.path')
        fail(code.get('language') in {'pascal', 'javascript', 'text'}, 'code.language: pascal/javascript/text')
        text(code.get('note'), 'code.note')
        fail(path.stat().st_size <= 1_000_000, 'отображаемый исходник больше 1 MB; подготовьте меньший файл для просмотра')
        content = path.read_text(encoding='utf-8')
        fail(isinstance(code.get('highlights'), list), 'code.highlights: нужен массив')
        for highlight in code['highlights']:
            start, end = highlight.get('start'), highlight.get('end')
            fail(type(start) is int and type(end) is int and 1 <= start <= end <= len(content.splitlines()), 'highlight: диапазон за пределами кода')
            text(highlight.get('label'), 'highlight.label')
    for source in work['sources']:
        asset(root, source.get('path'), 'source.path')
        text(source.get('type'), 'source.type')
        text(source.get('note'), 'source.note')
        fail(source.get('provenance') in PROVENANCE, 'source.provenance: неизвестный статус')
    experiment = work['experiment']
    fail(isinstance(experiment, dict) and experiment.get('type') in {'bch', 'trains', 'sensitivity', 'none'}, 'experiment.type: неизвестный эксперимент')
    text(experiment.get('note'), 'experiment.note')
    return work


def load_works(root=ROOT):
    paths = sorted((root / 'content/works').glob('*.json'))
    fail(bool(paths), 'content/works: нет файлов работ')
    result, ids = [], set()
    for path in paths:
        try:
            work = json.loads(path.read_text(encoding='utf-8'))
            validate_work(work, root)
            fail(work['id'] not in ids, f'повторный id: {work["id"]}')
            fail(path.stem == work['id'], 'имя JSON-файла должно совпадать с id')
            ids.add(work['id'])
            result.append(work)
        except (ValueError, KeyError, TypeError, UnicodeError) as error:
            raise ValueError(f'{path.relative_to(root)}: {error}') from error
    return sorted(result, key=lambda item: (item['year'] is None, item['year'] or 0, item['id']))


E = lambda value: html.escape(str(value), quote=True)


def page(title, body):
    return f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>{E(title)} — Альманах</title><link rel="stylesheet" href="../assets/css/site.css"><link rel="icon" href="../assets/favicon.svg" type="image/svg+xml"></head><body><main class="print-page">{body}</main></body></html>
'''


def chart_table(chart):
    all_x = sorted({point[0] for series in chart['series'] for point in series['values']})
    tables = [dict(series['values']) for series in chart['series']]
    head = '<th>' + E(chart['xLabel']) + '</th>' + ''.join('<th>' + E(series['name']) + '<br>' + E(chart['yLabel']) + '</th>' for series in chart['series'])
    rows = ''.join('<tr><th scope="row">' + E(x) + '</th>' + ''.join('<td>' + E(values.get(x, '—')) + '</td>' for values in tables) + '</tr>' for x in all_x)
    return f'<div class="table-wrap"><table><caption>{E(chart["title"])}</caption><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>'


def read_work(work):
    year = str(work['year']) if work['year'] is not None else 'Год не установлен'
    status = 'Учебная глава; дата условная' if work['status'] == 'demo' else ('Черновик' if work['status'] == 'draft' else 'Материалы архива')
    body = f'<header><nav class="print-topnav"><a href="index.html">← Все главы</a><a href="../index.html#work/{E(work["id"])}/story">Интерактивная версия ↗</a></nav><p class="eyebrow" style="margin-top:24px">{E(year)} · {E(status)}</p><h1>{E(work["title"])}</h1><p>{E(work["subtitle"])}</p><p class="small-text muted">Версия для чтения и печати. Все тексты, таблицы, иллюстрации и исходники доступны без JavaScript.</p></header>'
    for section in work['sections']:
        body += f'<section id="{E(section["id"])}"><h2>{E(section["title"])}</h2>' + ''.join(f'<p>{E(paragraph)}</p>' for paragraph in section['paragraphs'])
        if section.get('formula'):
            body += f'<div class="formula">{E(section["formula"])}</div>'
        body += '</section>'
    if work['figures']:
        body += '<section><h2>Иллюстрации</h2>'
        for index, figure in enumerate(work['figures']):
            body += f'<figure><img src="../{E(figure["path"])}" alt="{E(figure["alt"])}"><figcaption>Рис. {index+1}. {E(figure["caption"])}</figcaption></figure>'
        body += '</section>'
    if work['charts']:
        body += '<section><h2>Данные графиков</h2>'
        for chart in work['charts']:
            body += f'<h3>{E(chart["title"])}</h3><p class="small-text muted">{E(chart["note"])}</p>' + chart_table(chart)
        body += '</section>'
    if work['code']:
        body += '<section><h2>Исходный код</h2>'
        for code in work['code']:
            body += f'<h3>{E(code["title"])}</h3><p>{E(code["note"])}</p><p><a href="../{E(code["path"])}" download>Скачать исходник</a></p><pre><code>{E(code["text"])}</code></pre>'
        body += '</section>'
    if work['experiment']['type'] != 'none':
        body += f'<section><h2>Эксперимент</h2><p>{E(work["experiment"]["note"])}</p><p><a href="../index.html#work/{E(work["id"])}/lab">Открыть работающий пример</a> (требуется JavaScript).</p></section>'
    if work['sources']:
        body += '<section><h2>Материалы</h2><ul>' + ''.join(f'<li><a href="../{E(source["path"])}" download>{E(source["title"])}</a> — {E(source["note"])}</li>' for source in work['sources']) + '</ul></section>'
    if work['methodNotes']:
        body += '<section><h2>Примечания</h2>' + ''.join(f'<p>{E(note)}</p>' for note in work['methodNotes']) + '</section>'
    return page(work['title'], body)


def generated_files(works, root=ROOT):
    edition = copy.deepcopy(works)
    for work in edition:
        for code in work['code']:
            code['text'] = (root / code['path']).read_text(encoding='utf-8').replace('\r\n', '\n')
    payload = json.dumps({'schemaVersion': 1, 'works': edition}, ensure_ascii=False, sort_keys=True, indent=2).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    files = {'assets/js/content.generated.js': '// Generated by tools/build.py. Edit content/works/*.json and their source assets.\nwindow.AlmanacContent = ' + payload + ';\n'}
    listing = '<header><nav class="print-topnav"><a href="../index.html">← Интерактивный альманах</a></nav><h1>Альманах работ</h1><p>Статическая версия для чтения. Главы, таблицы и исходники доступны без выполнения программ.</p></header>'
    for work in edition:
        status = 'Демонстрационная глава' if work['status'] == 'demo' else ('Черновик' if work['status'] == 'draft' else 'Материалы архива')
        listing += f'<section><p class="eyebrow">{E(status)}</p><h2><a href="{E(work["id"])}.html">{E(work["title"])}</a></h2><p>{E(work["summary"])}</p></section>'
        files[f'read/{work["id"]}.html'] = read_work(work)
    files['read/index.html'] = page('Версия для чтения', listing)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--check', action='store_true', help='check committed output for drift; do not write')
    group.add_argument('--validate', action='store_true', help='validate authored works and references only')
    args = parser.parse_args()
    try:
        works = load_works()
        if args.validate:
            print(f'OK: {len(works)} работ; все ссылки и данные проверены.')
            return 0
        files = generated_files(works)
        stale = {str(path.relative_to(ROOT)) for path in (ROOT / 'read').glob('*.html')} - set(files)
        differences = [name for name, value in files.items() if not (ROOT/name).is_file() or (ROOT/name).read_text(encoding='utf-8') != value]
        if args.check:
            if differences or stale:
                print('Требуется python3 tools/build.py: ' + ', '.join(sorted(set(differences) | stale)), file=sys.stderr)
                return 1
            print(f'OK: {len(works)} работ; {len(files)} готовых файлов актуальны.')
            return 0
        for name, value in files.items():
            path = ROOT/name
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(path.suffix+'.tmp')
            temporary.write_text(value, encoding='utf-8', newline='\n')
            temporary.replace(path)
        for name in stale:
            (ROOT/name).unlink()
        print(f'Готово: {len(works)} работ; {len(files)} файлов. Откройте index.html в браузере.')
        return 0
    except (ValueError, OSError) as error:
        print(f'Ошибка: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
