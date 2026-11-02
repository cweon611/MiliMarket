// shared/nutrition-standards.mjs를 PostgreSQL 시드로 내보낸다: node scripts/export_nutrition_standards.mjs
import {writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {STANDARD_SOURCES,REFERENCE_VALUES,STANDARD_RULES,STANDARD_VERSION} from '../shared/nutrition-standards.mjs'
const q=v=>v==null?'NULL':typeof v==='number'||typeof v==='boolean'?String(v):`'${String(v).replaceAll("'","''")}'`
const row=values=>`  (${values.map(q).join(', ')})`
export function standardsSql(){
 return [
  '-- 생성 파일: scripts/export_nutrition_standards.mjs. 직접 수정하지 말고 shared/nutrition-standards.mjs를 고친다.',
  'BEGIN;',
  'INSERT INTO nutrition_standard_source (code, name, edition, url, verified, note) VALUES',
  Object.entries(STANDARD_SOURCES).map(([code,s])=>row([code,s.name,s.edition,s.url,s.verified,s.note])).join(',\n'),
  'ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, edition=EXCLUDED.edition, url=EXCLUDED.url, verified=EXCLUDED.verified, note=EXCLUDED.note;',
  'INSERT INTO nutrition_standard_value (source_code, nutrient, kind, value, min_value, max_value, unit, label) VALUES',
  REFERENCE_VALUES.map(v=>row([v.source,v.nutrient,v.kind,v.value,v.min,v.max,v.unit,v.label])).join(',\n'),
  'ON CONFLICT (source_code, nutrient, kind) DO UPDATE SET value=EXCLUDED.value, min_value=EXCLUDED.min_value, max_value=EXCLUDED.max_value, unit=EXCLUDED.unit, label=EXCLUDED.label;',
  'INSERT INTO nutrition_standard_rule (version, nutrient, rule_type, min_value, max_value, min_percent, max_percent, min_source, max_source, basis) VALUES',
  STANDARD_RULES.map(r=>row([STANDARD_VERSION,r.nutrient,r.type,r.min?.value,r.max?.value,r.minPercent?.value,r.maxPercent?.value,(r.min||r.minPercent)?.source,(r.max||r.maxPercent)?.source,r.basis])).join(',\n'),
  'ON CONFLICT (version, nutrient) DO NOTHING;',
  'COMMIT;',''].join('\n')
}
if(process.argv[1]===fileURLToPath(import.meta.url))await writeFile(new URL('../db/seed_nutrition_standards.sql',import.meta.url),standardsSql())
