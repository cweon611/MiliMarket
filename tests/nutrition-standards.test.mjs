import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {standardTargets,compareToStandard,rescaleTargets,standardTargetSource,STANDARD_RULES,STANDARD_SOURCES,REFERENCE_VALUES} from '../shared/nutrition-standards.mjs'
import {validateConditions} from '../api/_query.mjs'
import {standardsSql} from '../scripts/export_nutrition_standards.mjs'
const by=list=>Object.fromEntries(list.map(t=>[t.nutrient,[t.min,t.max]]))
test('3,000kcal integrated standard: ratios scale, limits and absolutes stay fixed',()=>{
 assert.deepEqual(by(standardTargets(3000)),{calories:[3000,null],protein:[128,150],carbs:[375,488],fat:[50,100],sugars:[null,100],sodium:[null,2000],calcium:[800,3000]})
 const higher=by(standardTargets(3300))
 assert.deepEqual([higher.protein,higher.carbs,higher.fat],[[140,165],[413,536],[55,110]])
 assert.deepEqual([higher.sugars,higher.sodium,higher.calcium],[[null,100],[null,2000],[800,3000]])
 assert.doesNotThrow(()=>validateConditions(standardTargets()))
 assert.throws(()=>standardTargets(200))
})
test('Every rule cites a known source and every source value is traceable',()=>{
 for(const r of STANDARD_RULES)for(const x of [r.min,r.max,r.minPercent,r.maxPercent].filter(Boolean))assert.ok(STANDARD_SOURCES[x.source],r.nutrient)
 for(const v of REFERENCE_VALUES)assert.ok(STANDARD_SOURCES[v.source])
 assert.equal(STANDARD_SOURCES.mnd.verified,false)
})
test('User edits are tracked and kept when energy changes',()=>{
 const edited=standardTargets(3000).map(t=>t.nutrient==='sodium'?{...t,max:1800}:t).filter(t=>t.nutrient!=='sugars')
 const states=Object.fromEntries(compareToStandard(edited,3000).map(r=>[r.nutrient,r.state]))
 assert.equal(states.sodium,'edited');assert.equal(states.sugars,'removed');assert.equal(states.protein,'standard')
 assert.match(standardTargetSource(edited,3000),/2개 사용자 수정/)
 const scaled=by(rescaleTargets(edited,3000,3300))
 assert.deepEqual(scaled.sodium,[null,1800]);assert.equal(scaled.sugars,undefined);assert.deepEqual(scaled.protein,[140,165])
})
test('DB seed matches the shared standard module',async()=>{
 assert.equal(await readFile(new URL('../db/seed_nutrition_standards.sql',import.meta.url),'utf8'),standardsSql())
})
