import {DatabaseSync,backup} from 'node:sqlite';
import {promises as fs} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
const data=resolve(process.env.DATA_DIR||'./data');
const output=resolve(process.env.BACKUP_DIR||join(data,'backups'));
const temp=await fs.mkdtemp(join(tmpdir(),'hunay-backup-'));
let db;
try{
 await fs.mkdir(output,{recursive:true});
 db=new DatabaseSync(join(data,'hunay.sqlite'),{readOnly:true,timeout:5000});
 await backup(db,join(temp,'hunay.sqlite'));db.close();db=null;
 try{await fs.cp(join(data,'uploads'),join(temp,'uploads'),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
 try{await fs.copyFile(join(data,'auth-salt'),join(temp,'auth-salt'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const now=new Date();await fs.writeFile(join(temp,'backup-info.json'),JSON.stringify({application:'Hunay Personalizados',createdAt:now.toISOString(),contents:['hunay.sqlite','uploads/','auth-salt'],note:'A senha do administrador e demais variáveis de ambiente são configuradas no Coolify, não neste backup.'},null,2));
 const filename=join(output,'hunay-backup-'+now.toISOString().replace(/[:.]/g,'-')+'.tar.gz');
 await new Promise((ok,fail)=>{const p=spawn('tar',['-czf',filename,'-C',temp,'.'],{stdio:['ignore','ignore','inherit']});p.on('error',fail);p.on('close',code=>code===0?ok():fail(new Error('Não foi possível empacotar o backup.')));});
 console.log('Backup criado: '+filename);
}finally{db?.close();await fs.rm(temp,{recursive:true,force:true});}
