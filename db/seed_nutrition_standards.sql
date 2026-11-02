-- 생성 파일: scripts/export_nutrition_standards.mjs. 직접 수정하지 말고 shared/nutrition-standards.mjs를 고친다.
BEGIN;
INSERT INTO nutrition_standard_source (code, name, edition, url, verified, note) VALUES
  ('mnd', '국방부 장병 영양섭취기준', '2017 개정 (언론 보도)', 'https://www.segye.com/newsView/20170124003767', false, '공식 원문 미확인. 하루 3,100→3,000kcal, 단백질 에너지비율 15→17% 보도. 제안팀에서 원문을 받으면 교체한다.'),
  ('mfds', '식약처 1일 영양성분 기준치', '식품 등의 표시·광고에 관한 법률 시행규칙 [별표 5] (2020. 9. 9. 개정)', 'https://www.law.go.kr/LSW/flDownload.do?gubun=&flSeq=76612387&bylClsCd=110201', true, '2,000kcal 기준 식품 표시용 기준치. 상한 성격의 나트륨·당류에만 사용한다.'),
  ('kdri', '2025 한국인 영양소 섭취기준', '보건복지부·한국영양학회 2025 요약본 (발간등록번호 11-1352000-100416-13), 남자 19–29세', 'https://health.seoulmc.or.kr/uploadFiles/2025_%ED%95%9C%EA%B5%AD%EC%9D%B8%EC%98%81%EC%96%91%EC%86%8C%EC%84%AD%EC%B7%A8%EA%B8%B0%EC%A4%80_%ED%99%9C%EC%9A%A9.pdf', true, '에너지적정비율과 칼슘 권장·상한섭취량에 사용한다.')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, edition=EXCLUDED.edition, url=EXCLUDED.url, verified=EXCLUDED.verified, note=EXCLUDED.note;
INSERT INTO nutrition_standard_value (source_code, nutrient, kind, value, min_value, max_value, unit, label) VALUES
  ('mnd', 'calories', 'energy', 3000, NULL, NULL, 'kcal', '1일 섭취열량'),
  ('mnd', 'protein', 'energy_ratio', 17, NULL, NULL, '%', '단백질 에너지비율'),
  ('mfds', 'carbs', 'daily_value', 324, NULL, NULL, 'g', '1일 영양성분 기준치'),
  ('mfds', 'sugars', 'daily_value', 100, NULL, NULL, 'g', '1일 영양성분 기준치'),
  ('mfds', 'protein', 'daily_value', 55, NULL, NULL, 'g', '1일 영양성분 기준치'),
  ('mfds', 'fat', 'daily_value', 54, NULL, NULL, 'g', '1일 영양성분 기준치'),
  ('mfds', 'sodium', 'daily_value', 2000, NULL, NULL, 'mg', '1일 영양성분 기준치'),
  ('mfds', 'calcium', 'daily_value', 700, NULL, NULL, 'mg', '1일 영양성분 기준치'),
  ('kdri', 'calories', 'eer', 2600, NULL, NULL, 'kcal', '에너지필요추정량'),
  ('kdri', 'carbs', 'amdr', NULL, 50, 65, '%', '에너지적정비율'),
  ('kdri', 'protein', 'amdr', NULL, 10, 20, '%', '에너지적정비율'),
  ('kdri', 'fat', 'amdr', NULL, 15, 30, '%', '에너지적정비율'),
  ('kdri', 'protein', 'rni', 65, NULL, NULL, 'g', '권장섭취량'),
  ('kdri', 'sugars', 'limit_ratio', NULL, NULL, 20, '%', '총당류 에너지비율 상한'),
  ('kdri', 'sodium', 'cdrr', 2300, NULL, NULL, 'mg', '만성질환위험감소섭취량'),
  ('kdri', 'calcium', 'rni', 800, NULL, NULL, 'mg', '권장섭취량'),
  ('kdri', 'calcium', 'ul', 3000, NULL, NULL, 'mg', '상한섭취량')
ON CONFLICT (source_code, nutrient, kind) DO UPDATE SET value=EXCLUDED.value, min_value=EXCLUDED.min_value, max_value=EXCLUDED.max_value, unit=EXCLUDED.unit, label=EXCLUDED.label;
INSERT INTO nutrition_standard_rule (version, nutrient, rule_type, min_value, max_value, min_percent, max_percent, min_source, max_source, basis) VALUES
  ('2026-10-23', 'calories', 'energy', NULL, NULL, NULL, NULL, 'mnd', NULL, '열량 목표 이상'),
  ('2026-10-23', 'protein', 'ratio', NULL, NULL, 17, 20, 'mnd', 'kdri', '국방부 17% 이상, 한국인 영양소 섭취기준 상한 20% 이하'),
  ('2026-10-23', 'carbs', 'ratio', NULL, NULL, 50, 65, 'kdri', 'kdri', '에너지적정비율 50–65%'),
  ('2026-10-23', 'fat', 'ratio', NULL, NULL, 15, 30, 'kdri', 'kdri', '에너지적정비율 15–30%'),
  ('2026-10-23', 'sugars', 'limit', NULL, 100, NULL, NULL, NULL, 'mfds', '식약처 기준치 100g 이하 (열량에 비례해 늘리지 않음)'),
  ('2026-10-23', 'sodium', 'limit', NULL, 2000, NULL, NULL, NULL, 'mfds', '식약처 기준치 2,000mg 이하 (열량에 비례해 늘리지 않음)'),
  ('2026-10-23', 'calcium', 'absolute', 800, 3000, NULL, NULL, 'kdri', 'kdri', '권장섭취량 800mg 이상, 상한섭취량 3,000mg 이하')
ON CONFLICT (version, nutrient) DO NOTHING;
COMMIT;
