import {type Design} from './client';
export type ArtworkRequest={name:string;brief:string;reference?:string};
export type ItemChoice={variantId?:string;mode:'shop'|'collection'|'custom';templateId?:string;request?:ArtworkRequest;design?:Design};
export type CartItem=ItemChoice&{key:string;productId:string;qty:number};
