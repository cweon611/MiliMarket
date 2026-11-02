import {test} from 'node:test'
import assert from 'node:assert/strict'
import {alternativeFacts,nutritionDiffs} from '../shared/alternative-facts.mjs'
const record=(protein,sodium)=>({code:'T',name:'테스트',basis:{text:'100g',amount:100,unit:'g'},nutrients:{protein:{value:protein},sodium:{value:sodium},calories:{value:null}}})
const item=(id,price,nutrition)=>({id,name:`닭강정 ${id}`,manufacturer:'미제공',market:{unitPrice:price,packGrams:1000,origin:'국산'},...(nutrition?{verifiedNutrition:nutrition}:{})})
test('Alternative facts use only verified price and official nutrition',()=>{
 const current=item(1,15000,record(10,500)),option=item(2,13000,record(12,450))
 const facts=alternativeFacts(current,option).join(' ')
 assert.match(facts,/100g당 200원\(13\.3%\) 저렴/)
 assert.match(facts,/단백질은 대체 상품 12g, 현재 상품 10g로 대체 상품이 2g 높음/)
 assert.match(facts,/나트륨은 대체 상품 450mg, 현재 상품 500mg로 대체 상품이 50mg 적음/)
 assert.doesNotMatch(facts,/열량/)
 assert.doesNotMatch(facts,/제조사/)
})
test('No nutrition comparison when either product lacks official data',()=>{
 const current=item(1,15000,null),option=item(2,13000,record(12,450))
 assert.deepEqual(nutritionDiffs(current,option),[])
 assert.match(alternativeFacts(current,option).join(' '),/영양은 비교하지 않았습니다/)
})
