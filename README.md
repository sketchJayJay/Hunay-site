# Hunay Personalizados — Coolify

Pacote independente com React, Vite e servidor Node.js 24. O runtime não usa Cloudflare, banco D1, R2 nem autenticação do ChatGPT.

**Instalação:** consulte `INSTALAR_NO_COOLIFY.md`.

## Requisitos
- Node.js 24.x para executar sem Docker.
- Dockerfile e Docker Compose incluídos para o Coolify.
- Variável `ADMIN_PASSWORD` com 10 a 128 caracteres, sem senha padrão.
- Volume persistente em `/data` no Coolify.

## Desenvolvimento e verificações

```bash
npm ci
npm run check
npm run build
npm test
```

Depois de definir `ADMIN_PASSWORD`, use `npm start`. Localmente, `DATA_DIR` assume `./data` e a porta padrão é 3000.

## Recursos
Catálogo e estoque; personalização com texto e foto; exportação de arte plana colorida e em preto/branco; pedidos com acompanhamento por link; controle manual de recebimentos; entrada mínima para reservar estoque; etapas de produção; taxa local; frete a confirmar ou cotação opcional via conta Melhor Envio; exportação JSON e script de backup completo.

A criação de um orçamento não desconta estoque. A confirmação de pelo menos 50% de entrada reserva as unidades em transação. Cancelar devolve o estoque reservado. Valores e disponibilidade são conferidos no servidor. Não há cobrança automática, estorno automático, emissão de etiqueta nem geração de arte por IA.

Os exemplos são semeados uma única vez. Atualizações preservam o banco e arquivos quando o volume `/data` é mantido.

## Validação deste pacote

Verificados: TypeScript, build de produção e 9 testes de integração do servidor Node.js 24, incluindo login, arquivos privados, estoque, concorrência, reinício, backup e troca de senha. O runtime foi testado somente com `dist`, `server` e `package.json`, sem depender de `node_modules`.

A imagem Docker não foi construída neste ambiente, que não possui Docker. O teste final de domínio, HTTPS, volume e container deve ser feito após o deploy no Coolify.

Referências de instalação: [Dockerfile no Coolify](https://coolify.io/docs/applications/builds/dockerfile), [armazenamento persistente](https://coolify.io/docs/applications/configuration/persistent-storage) e [SQLite no Node.js 24](https://nodejs.org/download/release/v24.22.1/docs/api/sqlite.html).

## Correção 1.0.1

- Compatibilidade dos identificadores do carrinho com acesso HTTP e navegadores sem `crypto.randomUUID`. Usa `crypto.getRandomValues` como alternativa segura, sem `Math.random`.
- Mensagem de recuperação se houver erro inesperado no carregamento da interface.
- `curl` incluído na imagem para checks HTTP configurados pelo Coolify.
- Nenhuma migração de banco nem alteração nos arquivos de dados.
- Teste de regressão do gerador de identificadores no contexto HTTP sem `randomUUID`, além da suíte de integração existente.
