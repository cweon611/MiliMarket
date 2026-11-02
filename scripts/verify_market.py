"""Audit that every displayed market price/image came from an observed matching ID."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
raw=json.loads((ROOT/'data-sources/shop-observations.json').read_text(encoding='utf-8'))
market=json.loads((ROOT/'public/data/market-enrichment.json').read_text(encoding='utf-8'))
products={p['id'] for p in json.loads((ROOT/'public/data/products.json').read_text(encoding='utf-8'))}
for key,m in market.items():
    assert int(key) in products
    matching=[r for r in raw['records'] if r['id']==int(key) and r['supplier']==m['supplier'] and r['unit']==m['unit'] and r['name']==m['name']]
    assert matching,key
    if m['unitPrice'] is not None: assert any(float(r['priceText'].replace(',','').removesuffix('원'))==m['unitPrice'] for r in matching),(key,'price')
    if m['imageUrl']: assert any(r['imageUrl']==m['imageUrl'] for r in matching),(key,'image')
    assert m['sourceUrl']=='https://shop.g2b.go.kr/'
    assert m['collectedAt']
    if m['saleStart'] or m['saleEnd']: assert any(r.get('saleStart') or r.get('saleEnd') for r in matching)
print(f'PASS: {len(market)} market records match observed IDs, suppliers, units, prices and image URLs.')
