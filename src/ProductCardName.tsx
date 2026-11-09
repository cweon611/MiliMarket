import type {Product} from './data'
import {categoryLabel} from './category-label'
import {productCardLabel} from './product-card-label'

export function ProductCardName({product}:{product:Product}) {
 const {title,itemName}=productCardLabel(product)
 return <><button className="product-name">{title}</button>{itemName&&<p className="product-item-name">{categoryLabel(itemName)}</p>}</>
}
