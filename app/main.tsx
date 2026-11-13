import React from 'react';
import {createRoot} from 'react-dom/client';
import Shop from './shop';
import AdminPanel from './admin/panel';
import Track from './pedido/page';
import Login from './login';
import './globals.css';
const path=window.location.pathname.replace(/\/$/,'')||'/';
createRoot(document.getElementById('root')!).render(path==='/admin'?<Login><AdminPanel/></Login>:path==='/pedido'?<Track/>:<Shop/>);
