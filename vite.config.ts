import {defineConfig,type Plugin} from 'vite'
import {readFile,readdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'

// Keep editable source data intact; compact only Vite's deployment copies.
function compactCatalogData():Plugin {
 let outputDirectory=''
 return {
  name:'compact-catalog-data',apply:'build',
  configResolved(config){outputDirectory=resolve(config.root,config.build.outDir,'data')},
  async closeBundle(){
   for(const name of await readdir(outputDirectory)){
    if(!name.endsWith('.json'))continue
    const path=resolve(outputDirectory,name)
    const original=await readFile(path,'utf8')
    const compact=JSON.stringify(JSON.parse(original))
    if(Buffer.byteLength(compact)<Buffer.byteLength(original))await writeFile(path,compact)
   }
  }
 }
}
export default defineConfig({plugins:[compactCatalogData()],server:{proxy:{'/api':'http://127.0.0.1:5184'}}})
