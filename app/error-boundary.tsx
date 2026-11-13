import {Component,type ReactNode,type ErrorInfo} from 'react';
export default class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return{failed:true};}
 componentDidCatch(error:Error,_info:ErrorInfo){console.error('Hunay: falha ao carregar a interface.',error);}
 render(){if(!this.state.failed)return this.props.children;return <main className="access-page"><img src="/images/hunay-logo.jpeg" alt="Hunay Personalizados"/><h1>Vamos tentar novamente?</h1><p>Não foi possível carregar a loja desta vez.</p><button className="button primary" onClick={()=>window.location.reload()}>Atualizar a página</button><p className="small muted">Se continuar, entre em contato com a Hunay.</p></main>;}
}
