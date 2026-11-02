import argparse
import json
from pathlib import Path
from openpyxl import load_workbook

parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
products = json.loads((root / 'public/data/products.json').read_text(encoding='utf-8'))
book = load_workbook(args.source_dir / '2. 통합본_DB적용.xlsx', read_only=True, data_only=True)
rows = book.active.iter_rows(values_only=True)
headers = next(rows)
source = [dict(zip(headers, r)) for r in rows if any(v is not None for v in r)]
assert len(source) == len(products) == 7902
assert len(set(p['id'] for p in products)) == len(products)
for expected, actual in zip(source, products):
    assert int(expected['물품식별번호']) == actual['id']
    for field, column in [('name','제품명'),('ingredients','원재료명'),('foodType','식품유형'),('reportNumber','품목제조보고번호')]:
        raw = expected[column]
        assert actual[field] == (str(raw).strip() if raw is not None and str(raw).strip() else '미제공')
    for field, column in [('protein','단백질(g)'),('fat','지방(g)'),('carbs','탄수화물(g)'),('sugars','당류(g)'),('sodium','나트륨(mg)'),('calcium','칼슘(mg)')]:
        raw = expected[column]
        number = float(raw) if isinstance(raw,(int,float)) and not isinstance(raw,bool) and raw >= 0 else None
        assert actual[field] == number, (actual['id'],field)
    assert all(actual[k] is None for k in ['unitPrice','pricePerKg','perPersonGram','calories'])
book.close()
original = load_workbook(args.source_dir / '1. 통합본_최종.xlsx', read_only=True, data_only=True)
rows = original.active.iter_rows(values_only=True)
headers = next(rows)
by_id = {p['id']:p for p in products}
for row in rows:
    if not any(v is not None for v in row): continue
    item = dict(zip(headers,row)); p = by_id[int(item['물품식별번호'])]
    for field, value in p['rawNutrition'].items():
        raw = item[field]
        assert value == (str(raw).strip() if raw is not None and str(raw).strip() else '미제공')
original.close()
assert sum(p['protein'] is not None for p in products) == 1623
assert any(p['sugars'] == 0 for p in products)
print('PASS: 7,902 unique IDs, exact source text, all DB nutrients, raw nutrition, missing values and real zeros verified.')
