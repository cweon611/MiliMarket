import {readFile,writeFile,mkdir,rename} from 'node:fs/promises'
import path from 'node:path'
import {createHash,randomBytes} from 'node:crypto'

const hash=value=>createHash('sha256').update(value).digest('hex')
const conflict=()=>Object.assign(new Error('이미 등록된 이메일입니다.'),{statusCode:409})

export async function createLocalStore(directory) {
  const file=path.join(directory,'accounts.json'),sessions=new Map()
  let db={users:[]},queue=Promise.resolve()
  try{db=JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
  function persist(){const snapshot=JSON.stringify(db);const task=queue.catch(()=>{}).then(async()=>{await mkdir(directory,{recursive:true});await writeFile(file+'.tmp',snapshot,{mode:0o600});await rename(file+'.tmp',file)});queue=task;return task}
  return {
    async findUser(email){return db.users.find(u=>u.email===email)||null},
    async createUser(user){if(db.users.some(u=>u.email===user.email))throw conflict();db.users.push(user);await persist();return user},
    async createSession(user){const token=randomBytes(32).toString('hex');sessions.set(token,{email:user.email,expires:Date.now()+86400000});return token},
    async getSession(token){const session=sessions.get(token);if(!session||session.expires<Date.now()){sessions.delete(token);return null}return db.users.find(u=>u.email===session.email)||null},
    async deleteSession(token){sessions.delete(token)},
    async saveHistory(user,entry){const current=db.users.find(u=>u.id===user.id);if(!current)throw new Error('계정을 찾을 수 없습니다.');current.history=[entry,...current.history].slice(0,20);await persist()},
  }
}

// A private store is required: account hashes, sessions and saved plans are never public blobs.
export async function createBlobStore(client) {
  const sdk=client||await import('@vercel/blob')
  const userPath=email=>`accounts/${hash(email)}.json`
  const sessionPath=token=>`sessions/${hash(token)}.json`
  async function read(key){const result=await sdk.get(key,{access:'private',useCache:false});if(!result)return null;return {value:await new Response(result.stream).json(),etag:result.blob.etag}}
  const write=(key,value,options={})=>sdk.put(key,JSON.stringify(value),{access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60,...options})
  const store={
    async findUser(email){return (await read(userPath(email)))?.value||null},
    async createUser(user){try{await write(userPath(user.email),user);return user}catch(e){if(await store.findUser(user.email))throw conflict();throw e}},
    async createSession(user){const token=randomBytes(32).toString('hex');await write(sessionPath(token),{email:user.email,expires:Date.now()+86400000});return token},
    async getSession(token){if(!/^[a-f0-9]{64}$/.test(token||''))return null;const session=(await read(sessionPath(token)))?.value;if(!session)return null;if(session.expires<Date.now()){await store.deleteSession(token);return null}return store.findUser(session.email)},
    async deleteSession(token){if(/^[a-f0-9]{64}$/.test(token||''))await sdk.del(sessionPath(token))},
    async saveHistory(user,entry){
      for(let attempt=0;attempt<5;attempt++){
        const current=await read(userPath(user.email));if(!current)throw new Error('계정을 찾을 수 없습니다.')
        const value={...current.value,history:[entry,...current.value.history.filter(h=>h.id!==entry.id)].slice(0,20)}
        if(JSON.stringify(value)===JSON.stringify(current.value))return
        try{await write(userPath(user.email),value,{allowOverwrite:true,ifMatch:current.etag});return}catch(e){if(!(e instanceof sdk.BlobPreconditionFailedError)||attempt===4)throw e}
      }
    },
  }
  return store
}
