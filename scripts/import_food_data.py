"""Read the supplied Excel workbooks without changing them; build the app catalog."""
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path, required=True)
args = parser.parse_args()

def read(name):
    path = args.source_dir / name
    book = load_workbook(path, read_only=True, data_only=True)
    iterator = book.active.iter_rows(values_only=True)
    headers = next(iterator)
    records = [dict(zip(headers, row), excel_row=i) for i, row in enumerate(iterator, 2) if any(v is not None for v in row)]
    book.close()
    return records, {'file': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'rows': len(records)}

original, original_meta = read('1. 통합본_최종.xlsx')
applied, applied_meta = read('2. 통합본_DB적용.xlsx')
ocr = {str(r['물품식별번호']): r for r in original}
assert len(ocr) == len(original)
assert len(set(str(r['물품식별번호']) for r in applied)) == len(applied)
assert set(ocr) == {str(r['물품식별번호']) for r in applied}

def text(v):
    return '' if v is None else str(v).strip()

def num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and v >= 0 else None

def category(food_type):
    t = re.sub(r'\s+', '', food_type)
    if re.search(r'가공유|우유|치즈|발효유|유크림|버터|분유|유청', t): return '유제품'
    if re.search(r'수산|어육|어묵|조미김|건조김|액젓|젓갈', t): return '수산물'
    if re.search(r'양념육|가공육|식육|소시지|베이컨|햄|알가열|알가공|분쇄가|잉념육|소소지|축산물|포장육', t): return '육류'
    if re.search(r'두부|묵류|김치|채소|콩나물|깍두기', t): return '두류/채소'
    if re.search(r'곡류|쌀|밀가루', t): return '곡류'
    if not t or t in ('없음', '표기없음'): return '기타'
    return '가공식품'

def untyped(food_type):
    # Missing, or a processing/allergen note that was entered in the food-type column.
    t = re.sub(r'\s+', '', food_type)
    return t in ('', '없음', '표기없음', '식용') or bool(re.match(r'비살균|산도조절제|추분말|소고기,', t))

# Spelling variants, typos and near-duplicates of the same item class → one subcategory label.
SUBCATEGORY_GROUPS = {
    '양념육': '양념육 양념육류 잉념육', '베이컨': '베이컨 베이컨류', '소시지': '소시지 소시지류 소소지류',
    '분쇄가공육제품': '분쇄가공육 분쇄가공육제품 분쇄가공품 분쇄가열가공품 분쇄가육제품',
    '식육추출가공품': '식육추출가공 식육추출가공품', '식육가공품': '식육가공품 축산물가공품 기타축산물가공품',
    '알가공품': '알가공품 알가열제품', '햄': '햄 햄류 햄류-햄 햄살가공품',
    '두유': '가공두유 두유 두유음료 포프리두유리치 포프리두유플레인',
    '간장': '간장 개량한식간장 전통한식간장 한식간장 혼합간장', '된장': '된장 한식된장 전통한식된장',
    '고추장': '고추장 조미고추장 한식고추장', '고춧가루': '고춧가루 고춧가루및실고추',
    '과자': '과자 과자류', '캔디류': '캔디류', '과채음료·주스': '과·채음료 과채음료 과·채주스 과채주스 상온주스 과채가공품',
    '국탕류': '국 국탕류', '면류': '면류 국수 건면 생면 생면류 숙면 유탕면 유탕면류 파스타류',
    '기타가공품': '기타가공품 기타농산가공품 기타어가공품', '즉석조리식품': '즉석조리식품 기타즉석조리식품 즉석섭취식품 다원에프앤비',
    '식용유': '식용유 대두유 콩기름 콩식용유 식물성기름 식용유지 카놀라유 채종유 옥수수기름 해바라기유 압착올리브유 향미유',
    '떡': '떡 떡류', '만두': '만두 만두류 냉동만두', '빵류': '빵류 냉동빵 상온보관용빵',
    '소스': '소스 소스류 요리용소스', '엿류': '엿류 기타엿 물엿', '잼': '잼 잼류', '절임식품': '절임류 절임식품',
    '복합조미식품': '복합조미식품 조미식품 조미음베이스수프', '카레': '카레 카레분', '커피': '커피 커피음료',
    '탄산음료': '탄산음료 탄신음료 청량음료', '혼합음료': '혼합음료 혼성음료 해태에이치티비',
    '토마토케첩': '토마토케첩 토마토케챂', '소금': '소금 가공소금 천일염 태움·용융소금',
    '땅콩또는견과류가공품': '땅콩또는견과류가공품', '가공유': '가공유 가공우유',
    '치즈': '치즈 가공치즈 자연치즈 가공유지', '발효유': '발효유 발효유류 농후발효유 농축발효유',
    '김치': '김치 김치류 맛김치 기타김치 배추김치', '두부': '두부 두부류 가공두부 생식용두부',
    '수산물가공품': '수산물가공품 기타수산물가공품', '어육가공품': '어육 어육가공품 기타어육가공품 어육살균제품 어육유탕처리제품 어육소시지',
    '김': '김 가공김 조미김',
}
SUBCATEGORY_ALIASES = {variant: label for label, variants in SUBCATEGORY_GROUPS.items() for variant in variants.split()}

def subcategory(raw):
    # Drop qualifiers such as "(살균제품…)", ", 멸균제품", "「멸균제품」", "<…냉동식품>", trailing weights.
    t = re.split(r'[(/\[,「<]', raw)[0]
    t = re.sub(r'\s+', '', t).replace('․', '·')
    t = re.sub(r'\d+(?:\.\d+)?g$', '', t)
    t = re.sub(r'가열하여섭취하는냉동식품$', '', t)
    return SUBCATEGORY_ALIASES.get(t, t) or '기타'

def product_class(name):
    # Market names start with the G2B item class, e.g. "양념육류, 업체, 상품명, 1kg".
    head = re.sub(r'^\(주문자상표부착\)', '', name.split(',')[0]).strip() if ',' in name else ''
    return head if head and not re.search(r'\d', head) and len(head) <= 15 else ''

NAME_RULES = [
    ('유제품', r'가공유|우유|치즈|발효유|요구르트|유크림|버터|분유'),
    ('수산물', r'수산|어육|어묵|조미김|김\(|골뱅이|참치|연어|새우'),
    ('육류', r'양념육|햄|소시지|베이컨|알가공|식육|순대|떡갈비|돈까스|돈가스|모듬고기'),
    ('두류/채소', r'김치|깍두기|소박이|두부|묵류|단무지|콩나물'),
    ('곡류', r'조리된곡물|즉석건조|견과|밀가루'),
    ('가공식품', r'면류|면$|소스|국탕|간편조리|주스|음료|만두|젤리|도시락|밥|빵|조미|커피|떡|드레싱|즉석조리|케이크|파이|잼|쿠키|간장|고추장|된장|당면|고춧가루|소금|기름|케첩|두유|에이치티비'),
]

NAME_ONLY_RULES = [('육류', r'돈까스|돈가스|떡갈비|모듬고기'), ('가공식품', r'비빔밥|라면|도시락|케이크')]

# Subcategory from the product name when neither a food type nor an item class exists.
NAME_SUBCATEGORIES = [('즉석조리식품', r'비빔밥|라면'), ('김', r'조미김'), ('수산물가공품', r'골뱅이'), ('단백질음료', r'단백질음료'),
    ('혼합음료', r'음료'), ('케이크또는파이또는패스트리', r'케이크'), ('발효유', r'요구르트'), ('식육가공품', r'모듬고기'),
    ('과자', r'초코파이'), ('소금', r'천일염|소금'), ('면류', r'당면'), ('양념육', r'떡갈비'), ('분쇄가공육제품', r'돈까스|돈가스')]

def subcategory_from_name(name):
    t = re.sub(r'\s+', '', name)
    return next((label for label, pattern in NAME_SUBCATEGORIES if re.search(pattern, t)), '기타')

def category_from_name(name):
    # Used only when the food type is missing: classify by the item class, then by the full name.
    for text_, rules in ((product_class(name), NAME_RULES), (name, NAME_ONLY_RULES + NAME_RULES)):
        t = re.sub(r'\s+', '', text_)
        for cat, pattern in rules:
            if t and re.search(pattern, t): return cat
    return '기타'

def weight(name):
    # Only one explicit mass is accepted. Volume is never converted to mass.
    matches = list(re.finditer(r'(?<![\d.])(\d+(?:\.\d+)?)\s*(kg|㎏|킬로그램|g|그램)(?![A-Za-z])', name, re.I))
    if len(matches) != 1 or re.search(r'[×*]|\d\s*[xX]\s*\d', name): return None, '미제공 / 규격 확인 필요'
    m = matches[0]
    grams = float(m[1]) * (1000 if m[2].lower() in ('kg', '㎏', '킬로그램') else 1)
    return (grams, m[0].strip()) if grams > 0 else (None, '미제공')

products = []
for r in applied:
    identity = str(r['물품식별번호'])
    old = ocr[identity]
    assert text(old['제품명']) == text(r['제품명'])
    name, food_type = text(r['제품명']), text(r['식품유형'])
    missing_type = untyped(food_type)
    cat = category_from_name(name) if missing_type else category(food_type)
    sub = subcategory(product_class(name) or subcategory_from_name(name)) if missing_type else subcategory(food_type)
    mass, label = weight(name)
    storage = next((s for s in ['냉동', '냉장', '상온'] if s in name + food_type), '미제공')
    nutrients = {field: num(r.get(column)) for field, column in [('protein','단백질(g)'),('fat','지방(g)'),('carbs','탄수화물(g)'),('sugars','당류(g)'),('sodium','나트륨(mg)'),('calcium','칼슘(mg)')]}
    products.append({
        'id': int(identity), 'name': name, 'category': cat,
        'subcategory': sub,
        'foodType': food_type or '미제공', 'ingredients': text(r['원재료명']) or '미제공',
        'reportNumber': text(r['품목제조보고번호']) or '미제공',
        'manufacturer': '미제공', 'origin': '미제공', 'specType': storage, 'purchaseMethod': '미제공',
        'weightPerUnit': label, 'packGrams': mass, 'unitPrice': None, 'pricePerKg': None,
        'perPersonGram': None, 'calories': None, **nutrients,
        'tags': [sub if missing_type else food_type] + ([storage] if storage != '미제공' else []),
        'nutritionBasis': '기준 중량 미제공', 'sourceRow': r['excel_row'],
        'rawNutrition': {k: text(old.get(k)) or '미제공' for k in ['탄수화물','단백질','지방','당류','나트륨']},
    })

out = ROOT / 'public' / 'data'
out.mkdir(parents=True, exist_ok=True)
(out / 'products.json').write_text(json.dumps(products, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
summary = {'sources': [original_meta, applied_meta], 'products': len(products),
           'withDbNutrition': sum(p['protein'] is not None for p in products),
           'withExtractedMass': sum(p['packGrams'] is not None for p in products),
           'categories': dict(Counter(p['category'] for p in products)),
           'notes': ['DB적용본 영양성분을 그대로 사용. 최종본의 영양성분 원문은 별도 표시.',
                     '가격, 제조사, 원산지, 계약 방식, 배식량, 평가 정보는 추정하지 않음.',
                     '분류는 식품유형 기반 자동분류. 식품유형이 없으면 제품명의 나라장터 품명으로 분류하고, 판단 불가 시 기타. 보관 방식은 제품명/식품유형의 명시 문구만 사용.',
                     '중량은 제품명에서 단일 질량 표기만 추출. 복수 중량/곱셈/부피 단위는 수동 확인.']}
(out / 'catalog-meta.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
