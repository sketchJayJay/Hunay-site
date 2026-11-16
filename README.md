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
Catálogo e estoque por cor; coleções de estampas com nome personalizável; opção de a Hunay criar a arte a partir de uma ideia ou referência; editor com texto e foto; exportação de arte plana colorida e em preto/branco; pedidos com acompanhamento por link; controle manual de recebimentos; entrada mínima para reservar estoque; etapas de produção; taxa local; frete a confirmar ou cotação opcional via conta Melhor Envio; exportação JSON e script de backup completo.

A criação de um orçamento não desconta estoque. A confirmação de pelo menos 50% de entrada reserva as unidades em transação. Cancelar devolve o estoque reservado. Valores e disponibilidade são conferidos no servidor. Não há cobrança automática, estorno automático, emissão de etiqueta nem geração de arte por IA.

Os exemplos são semeados uma única vez. Atualizações preservam o banco e arquivos quando o volume `/data` é mantido.

## Validação deste pacote

Verificados: TypeScript, build de produção e 17 testes, incluindo login, arquivos privados, preços por cor, confirmação manual de entrada, concorrência de estoque, limites das estampas, reinício, backup, troca de senha e atualização de um banco da versão anterior. A suíte de integração executa o runtime somente com `dist`, `server` e `package.json`, sem depender de `node_modules`.

A imagem Docker não foi construída neste ambiente, que não possui Docker. O teste final de domínio, HTTPS, volume e container deve ser feito após o deploy no Coolify.

Referências de instalação: [Dockerfile no Coolify](https://coolify.io/docs/applications/builds/dockerfile), [armazenamento persistente](https://coolify.io/docs/applications/configuration/persistent-storage) e [SQLite no Node.js 24](https://nodejs.org/download/release/v24.22.1/docs/api/sqlite.html).

## Correção 1.0.1

- Compatibilidade dos identificadores do carrinho com acesso HTTP e navegadores sem `crypto.randomUUID`. Usa `crypto.getRandomValues` como alternativa segura, sem `Math.random`.
- Mensagem de recuperação se houver erro inesperado no carregamento da interface.
- `curl` incluído na imagem para checks HTTP configurados pelo Coolify.
- Nenhuma migração de banco nem alteração nos arquivos de dados.
- Teste de regressão do gerador de identificadores no contexto HTTP sem `randomUUID`, além da suíte de integração existente.

## Atualização 1.1.0 — coleções, cores e pedido pelo WhatsApp

- Em **Produtos**, habilite variações e cadastre nome, foto, preço e quantidade disponível de cada cor. O total é calculado pelas cores. Pedidos com entrada confirmada reservam apenas a cor escolhida.
- Em **Coleções**, cadastre cada estampa com o nome da coleção (por exemplo, Natal). Envie sua arte sem o nome ou use os elementos disponíveis. A arte plana usa a proporção 1600 × 700; o painel permite ajustar a posição do nome. Defina a frase, a letra, os produtos compatíveis e se o cliente pode alterar a frase ou os elementos.
- O cliente pode escolher uma coleção, montar sua própria arte ou selecionar **A Hunay cria minha arte** e enviar instruções e uma referência opcional. A Hunay prepara e aprova a arte pelo atendimento após a confirmação da entrada.
- O orçamento fica salvo no painel. Na tela de confirmação, o cliente toca em **Combinar pagamento no WhatsApp** e envia o resumo. Não há cobrança no site nem envio automático de mensagem.
- A exportação JSON inclui as cores e as estampas. As imagens entram no backup completo.
- A migração adiciona as tabelas novas sem substituir produtos, pedidos, estoque ou arquivos existentes. Os novos produtos de exemplo aparecem somente em instalações novas; a atualização de uma loja real não adiciona produtos demonstrativos. As coleções de exemplo são adicionadas na primeira atualização somente quando a loja ainda está com demonstração ativada.

A prévia visual desta atualização não foi executada: o serviço de prévia deste ambiente já estava ocupado. Após o deploy, confira os fluxos no celular e no computador com os dados reais da loja.
