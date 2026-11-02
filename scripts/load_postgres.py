"""Load the existing JSON catalog into PostgreSQL (db/schema.sql) without changing the JSON files.

Usage:  DATABASE_URL=postgresql://user@localhost/milimarket python scripts/load_postgres.py
Requires: pip install "psycopg[binary]"
Re-running is safe: products are upserted; a source file already loaded (same sha256) is not inserted again.
"""
import hashlib, json, os, re
from datetime import datetime, timezone
from pathlib import Path
import psycopg
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[1]
products = json.loads((ROOT / 'public/data/products.json').read_text(encoding='utf-8'))
meta = json.loads((ROOT / 'public/data/catalog-meta.json').read_text(encoding='utf-8'))
SHOP_FILE = ROOT / 'data-sources/shop-observations.json'
shop = json.loads(SHOP_FILE.read_text(encoding='utf-8'))

MISSING = {'', '미제공', '없음', '표기 없음', '표기없음'}
def clean(v): return None if v is None or str(v).strip() in MISSING else str(v).strip()

def report_numbers(raw):
    """'F1-123..., F2: 456...' / '1998...(F1) / 2001...(F2)' → [(factory, text, digits)]."""
    if not clean(raw): return []
    out = []
    for m in re.finditer(r'(?:([FP]\d)\s*[:\-]?\s*)?(\d{6,}(?:[\- ]\d{1,4}(?!\d))?)(?:\s*\(([FP]\d)\))?', raw):
        text = m[2].strip()
        out.append((m[1] or m[3], text, re.sub(r'\D', '', text)))
    return out

def nutrient(text):
    m = re.fullmatch(r'([\d,]+(?:\.\d+)?)\s*(g|mg)', (text or '').strip(), re.I)
    return float(m[1].replace(',', '')) if m else None

def amount(text):
    m = re.fullmatch(r'([\d,]+(?:\.\d+)?)원', (text or '').strip())
    return float(m[1].replace(',', '')) if m else None

def day(text):
    m = re.search(r'(\d{4})[.\-/](\d{2})[.\-/](\d{2})', text or '')
    return '-'.join(m.groups()) if m else None

def mass(name, unit):  # same rule as build_market.py: one explicit mass only
    if unit.lower() in ('kg', '킬로그램'): return 1000
    ms = list(re.finditer(r'(?<![\d.,])(\d+(?:,\d{3})*(?:\.\d+)?)\s*(kg|㎏|g|그램)(?![a-z])', name, re.I))
    if len(ms) != 1 or re.search(r'[×*]|\d\s*[xX]\s*\d', name): return None
    v = float(ms[0][1].replace(',', '')) * (1000 if ms[0][2].lower() in ('kg', '㎏') else 1)
    return v if v > 0 else None

with psycopg.connect(os.environ['DATABASE_URL']) as db, db.cursor() as cur:
    now = datetime.now(timezone.utc)
    batch, fresh = {}, {}
    def open_batch(kind, name, sha, rows, collected, url=None, note=None):
        """Same source file (sha256) → reuse its batch and skip re-inserting its history rows."""
        cur.execute('SELECT id FROM source_batch WHERE kind=%s AND sha256=%s', (kind, sha))
        row = cur.fetchone()
        if row: batch[kind], fresh[kind] = row[0], False; return
        cur.execute('INSERT INTO source_batch(kind,source_name,source_url,sha256,row_count,collected_at,note) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id',
                    (kind, name, url, sha, rows, collected, note))
        batch[kind], fresh[kind] = cur.fetchone()[0], True
    for kind, src in zip(('excel_ocr', 'excel_db_applied'), meta['sources']):
        open_batch(kind, src['file'], src['sha256'], src['rows'], now)
    shop_time = max(r['collectedAt'] for r in shop['records'] if r.get('collectedAt'))
    open_batch('g2b_shop', shop['source'], hashlib.sha256(SHOP_FILE.read_bytes()).hexdigest(), len(shop['records']), shop_time,
               shop['sourceUrl'], f"{len(shop['batches'])} pages, browser observation")

    categories = {}
    def category(parent, name):
        key = (parent, name)
        if key not in categories:
            cur.execute('INSERT INTO category(parent_id,name) VALUES (%s,%s) ON CONFLICT (parent_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id', key)
            categories[key] = cur.fetchone()[0]
        return categories[key]

    for p in products:
        cat = category(category(None, p['category']), p['subcategory'])
        cur.execute('''INSERT INTO product(id,name,category_id,food_type_raw,ingredients,report_number_raw,storage_type,pack_grams,pack_label,source_batch_id,source_row)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, category_id=EXCLUDED.category_id, food_type_raw=EXCLUDED.food_type_raw,
              ingredients=EXCLUDED.ingredients, report_number_raw=EXCLUDED.report_number_raw, storage_type=EXCLUDED.storage_type,
              pack_grams=EXCLUDED.pack_grams, pack_label=EXCLUDED.pack_label, source_batch_id=EXCLUDED.source_batch_id,
              source_row=EXCLUDED.source_row, is_active=true, updated_at=now()''',
            (p['id'], p['name'], cat, clean(p['foodType']), clean(p['ingredients']), clean(p['reportNumber']),
             p['specType'] if p['specType'] in ('냉동', '냉장', '상온') else None, p['packGrams'], p['weightPerUnit'],
             batch['excel_db_applied'], p['sourceRow']))
        cur.execute('DELETE FROM product_report_number WHERE product_id=%s', (p['id'],))
        cur.executemany('INSERT INTO product_report_number(product_id,seq,factory_tag,number_text,normalized) VALUES (%s,%s,%s,%s,%s)',
                        [(p['id'], i, tag, text, digits) for i, (tag, text, digits) in enumerate(report_numbers(p['reportNumber']), 1)])

        if fresh['excel_ocr']:
            raw = p['rawNutrition']
            cur.execute('''INSERT INTO nutrition_record(product_id,source,source_batch_id,carbs_g,sugars_g,protein_g,fat_g,sodium_mg,raw)
            VALUES (%s,'ocr_label',%s,%s,%s,%s,%s,%s,%s)''',
                (p['id'], batch['excel_ocr'], nutrient(raw.get('탄수화물')), nutrient(raw.get('당류')), nutrient(raw.get('단백질')),
                 nutrient(raw.get('지방')), nutrient(raw.get('나트륨')), Jsonb(raw)))
        db_values = [p[k] for k in ('carbs', 'sugars', 'protein', 'fat', 'sodium', 'calcium')]
        if fresh['excel_db_applied'] and any(v is not None for v in db_values):
            # The app shows DB-applied values, so adopt them — unless a reviewer approved or entered another record.
            cur.execute('''SELECT EXISTS (SELECT 1 FROM nutrition_record WHERE product_id=%s AND adopted
                             AND (source='manual' OR review_status='approved'))''', (p['id'],))
            keep = cur.fetchone()[0]
            if not keep: cur.execute("UPDATE nutrition_record SET adopted=false WHERE product_id=%s AND adopted", (p['id'],))
            cur.execute('''INSERT INTO nutrition_record(product_id,source,source_batch_id,carbs_g,sugars_g,protein_g,fat_g,sodium_mg,calcium_mg,adopted)
                VALUES (%s,'food_db_excel',%s,%s,%s,%s,%s,%s,%s,%s)''', (p['id'], batch['excel_db_applied'], *db_values, not keep))

    known = {p['id'] for p in products}
    suppliers = {}
    for r in shop['records'] if fresh['g2b_shop'] else []:
        if r['id'] not in known: continue
        if r['supplier'] not in suppliers:
            cur.execute('INSERT INTO supplier(name) VALUES (%s) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id', (r['supplier'],))
            suppliers[r['supplier']] = cur.fetchone()[0]
        image = r['imageUrl'] if r['imageUrl'].startswith('https://shop.g2b.go.kr/static/CataAttach/') else None
        minimum = r.get('minimumOrder', '')
        cur.execute('''INSERT INTO market_offer(product_id,source_batch_id,supplier_id,market_name,sale_unit,unit_grams,unit_price,price_text,
              original_price,discount_text,sale_start,sale_end,contract_end,purchase_method,origin,delivery,region,minimum_order,
              image_url,source_category,source_page,unavailable,collected_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING''',
            (r['id'], batch['g2b_shop'], suppliers[r['supplier']], r['name'], r['unit'], mass(r['name'], r['unit']), amount(r['priceText']),
             r['priceText'], amount(r.get('originalPriceText')), r.get('discount') or None, day(r.get('saleStart')), day(r.get('saleEnd')),
             day(r['contractEnd']), r['purchaseMethod'], r['origin'], r['delivery'], r['region'],
             int(minimum.replace(',', '')) if re.fullmatch(r'[\d,]+', minimum) else None,
             image, r.get('sourceCategory'), r.get('sourcePage'), bool(r.get('unavailable')), r.get('collectedAt') or shop_time))

    # Products missing from this catalog stay in the DB (orders may reference them) but are hidden.
    cur.execute('UPDATE product SET is_active=false WHERE NOT (id = ANY(%s)) AND is_active', (list(known),))
    cur.execute('SELECT (SELECT count(*) FROM product WHERE is_active),(SELECT count(*) FROM market_offer WHERE source_batch_id=%s),'
                '(SELECT count(*) FROM current_offer WHERE live),(SELECT count(*) FROM nutrition_record WHERE adopted)', (batch['g2b_shop'],))
    print(dict(zip(('active_products', 'offers_in_batch', 'live_offers', 'adopted_nutrition'), cur.fetchone())),
          {k: 'new' if v else 'already loaded' for k, v in fresh.items()})
