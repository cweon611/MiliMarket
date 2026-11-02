import test from 'node:test'
import assert from 'node:assert/strict'
import {parseProductImages} from '../api/_product-images.mjs'
test('gallery accepts only the requested product and public G2B image paths, preserving order',()=>{
 const valid={itemIdnfNo:'25100569',orgnlImgUrl:'/static/CataAttach/one.jpg'}
 const d={ErrorCode:0,dlImgUrlL:[valid,{...valid,orgnlImgUrl:'/static/CataAttach/two.png'},valid,{...valid,itemIdnfNo:'11111111'},{...valid,orgnlImgUrl:'https://evil.test/static/CataAttach/one.jpg'},{...valid,orgnlImgUrl:'/private/one.jpg'}]}
 assert.deepEqual(parseProductImages(d,25100569).images,['https://shop.g2b.go.kr/static/CataAttach/one.jpg','https://shop.g2b.go.kr/static/CataAttach/two.png'])
 assert.deepEqual(parseProductImages({ErrorCode:0,dlImgUrlL:[]},25100569).images,[])
 assert.throws(()=>parseProductImages({ErrorCode:-1},25100569))
})
