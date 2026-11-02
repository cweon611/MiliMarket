"""Build a separate, auditable market overlay from public browser observations."""
import json,re
from datetime import datetime,timezone
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'data-sources/shop-observations.json'
data=json.loads(source.read_text(encoding='utf-8'))
products={p['id']:p for p in json.loads((ROOT/'public/data/products.json').read_text(encoding='utf-8'))}
def amount(text):
    match=re.fullmatch(r'([\d,]+(?:\.\d+)?)원',text.strip())
    return float(match[1].replace(',','')) if match else None
def date(text):
    match=re.search(r'(\d{4})[.\-/](\d{2})[.\-/](\d{2})',text or '')
    return '-'.join(match.groups()) if match else None
def mass(name,unit):
    if unit.lower() in ('kg','킬로그램'): return 1000
    matches=list(re.finditer(r'(?<![\d.,])(\d+(?:,\d{3})*(?:\.\d+)?)\s*(kg|㎏|g|그램)(?![a-z])',name,re.I))
    if len(matches)!=1 or re.search(r'[×*]|\d\s*[xX]\s*\d',name): return None
    value=float(matches[0][1].replace(',',''))*(1000 if matches[0][2].lower() in ('kg','㎏') else 1)
    return value if value>0 else None
by_id=defaultdict(list)
for row in data['records']:
    if row['id'] in products: by_id[row['id']].append(row)
overlay={}
for identity,rows in by_id.items():
    # Deduplicate observations; preserve actual selected supplier and unit.
    unique={(r['supplier'],r['unit'],r['priceText']):r for r in rows}
    offers=list(unique.values())
    live=[r for r in offers if not r.get('unavailable') and (date(r.get('contractEnd')) or '9999')>=datetime.now().date().isoformat()]
    chosen=min(live or offers,key=lambda r:amount(r['priceText']) if amount(r['priceText']) is not None else float('inf'))
    image=chosen['imageUrl']
    if not image.startswith('https://shop.g2b.go.kr/static/CataAttach/'): image=None
    overlay[str(identity)]={
        'name':chosen['name'],'unitPrice':amount(chosen['priceText']) if live else None,
        'imageUrl':image,'unit':chosen['unit'],'packGrams':mass(chosen['name'],chosen['unit']),
        'supplier':chosen['supplier'],'origin':chosen['origin'],'purchaseMethod':chosen['purchaseMethod'],
        'category':chosen.get('sourceCategory','음료류'),'itemType':chosen['name'].split(',')[0].strip(),
        'collectedAt':chosen.get('collectedAt',datetime.now(timezone.utc).isoformat()),'contractEnd':date(chosen['contractEnd']) or '',
        'sourceUrl':'https://shop.g2b.go.kr/','sourceName':'나라장터 쇼핑몰',
        'delivery':chosen['delivery'],'region':chosen['region'],'offerCount':len(unique),
        'saleStart':date(chosen.get('saleStart')),'saleEnd':date(chosen.get('saleEnd')),
        'discount':chosen.get('discount') or None,'originalPrice':amount(chosen.get('originalPriceText','')),
        'minimumOrder':int(chosen['minimumOrder'].replace(',','')) if re.fullmatch(r'[\d,]+',chosen.get('minimumOrder','')) else None,
    }
(ROOT/'public/data/market-enrichment.json').write_text(json.dumps(overlay,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
summary={'catalogProducts':len(products),'matchedProducts':len(overlay),'withPrice':sum(r['unitPrice'] is not None for r in overlay.values()),'withImage':sum(bool(r['imageUrl']) for r in overlay.values()),'readPages':len(data['batches']),'collectedAt':datetime.now(timezone.utc).isoformat(),'source':'https://shop.g2b.go.kr/'}
(ROOT/'public/data/market-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))

unmatched=[{'id':p['id'],'name':p['name'],'reason':'공개 식품 목록에서 동일 물품식별번호 미확인'} for p in products.values() if str(p['id']) not in overlay]
(ROOT/'data-sources/market-unmatched.json').write_text(json.dumps(unmatched,ensure_ascii=False,indent=2),encoding='utf-8')
