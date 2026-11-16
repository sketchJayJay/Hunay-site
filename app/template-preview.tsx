import {useEffect,useState} from 'react';
import {type ArtTemplate} from '../lib/catalog';
import {defaultDesign,renderDesign,type Design} from '../lib/client';

export function templateDesign(t:ArtTemplate,text='Seu nome'):Design {
 return {...defaultDesign,text,phrase:t.phrase,font:t.font,ink:t.ink,template:t.template,photo:'',background:t.image,nameX:t.nameX,nameY:t.nameY};
}
export default function TemplatePreview({template}:{template:ArtTemplate}){
 const [src,setSrc]=useState('');
 useEffect(()=>{let alive=true;renderDesign(templateDesign(template)).then(s=>{if(alive)setSrc(s);}).catch(()=>{if(alive)setSrc('');});return()=>{alive=false;};},[template]);
 return <div className="template-preview">{src?<img src={src} alt={'Estampa '+template.name}/>:<span>Prévia da estampa</span>}</div>;
}
