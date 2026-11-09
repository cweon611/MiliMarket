import {readJsonResponse} from '../shared/http-response.mjs'
import type {NutritionAggregate} from './MealNutritionEvidence'
import type {NutrientCondition} from './NutritionTools'
import type {NutritionEvidence} from './PublicData'

export interface User {id:string;name:string;email:string}
export interface Status {configured:boolean;model:string;catalogCount:number;user:User|null;dataProviders?:Record<string,{configured:boolean;source:{name:string;url:string}}> }
export interface PlanSettings {start:string;days:number;people:number;mealBudgets:number[];exclusions:string[];dessert:boolean;cuisine:string;seed:number;meals?:string[];composition?:Record<string,number>;preferenceLabels?:string[];nutritionScope?:string;mealTargets?:NutrientCondition[];dailyTargets?:NutrientCondition[];targetSource?:string;standardEnergy?:number;portions?:Record<string,number>;portionSource?:string}
export interface SourceProduct {verifiedNutrition?:import('./PublicData').NutritionRecord|null;id:number;name:string;imageUrl:string|null;unitPrice:number|null;gramPrice:number|null;packGrams:number|null;unit:string;sourceUrl:string|null;collectedAt:string|null;nutritionBasis:string;protein:number|null;sodium:number|null;calories:number|null;ingredients:string}
export interface PlanItem extends SourceProduct {role:string;reasons?:string[];missing?:boolean;grams:number|null;unitsPerPerson:number|null;portionCost:number;repeat:number;family:string}
export interface Purchase extends PlanItem {requiredGrams:number;requiredUnits:number;packs:number;total:number}
export interface Plan {nutritionVerified?:boolean;nutrition?:{targetSource:string;targets:NutrientCondition[];mealTargets?:NutrientCondition[];days:(NutritionAggregate&{date:string;meals:(NutritionAggregate&{name:string})[]})[]};settings:PlanSettings;days:{date:string;meals:{name:string;budget:number;cost:number;items:PlanItem[]}[]}[];purchase:Purchase[];total:number;budget:number;missing:number;warnings:string[];basis:string;createdAt:string}
export interface Reply {contextReset?:boolean;chatContext?:{meal:Record<string,unknown>|null;recommendation:Record<string,unknown>|null};mealRequestContext?:Record<string,unknown>;needsMealDetails?:boolean;needsPreference?:boolean;recommendationContext?:Record<string,unknown>;answerKind?:string;generalNotice?:string;followUps?:string[];recommendations?:{id:number;reasons:string[]}[];plan?:Plan;highlights?:string[];explanationNotice?:string;needsBasis?:boolean;nutritionEvidence?:NutritionEvidence[];mode:string;text:string;products:SourceProduct[];blocked?:boolean;count?:number;planSettings?:Partial<PlanSettings>}
export interface Message {role:'user'|'assistant';text:string;reply?:Reply}
export const initialPlanSettings:PlanSettings={start:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),days:7,people:120,mealBudgets:[4000,5000,4000],exclusions:[],dessert:true,cuisine:'한식',seed:0}
export async function api<T>(url:string,body?:unknown):Promise<T>{const response=await fetch(url,{credentials:'same-origin',...(body!==undefined?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});return readJsonResponse(response)}
