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

Verificados: TypeScript, build de produção e 34 testes, incluindo login, arquivos privados, preços por quantidade e por cor, descontos, vendas manuais a prazo, estoque, relatórios, reinício, backup, troca de senha e atualização de um banco da versão anterior. A suíte de integração executa o runtime somente com `dist`, `server` e `package.json`, sem depender de `node_modules`.

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

A prévia visual da versão 1.1.0 não foi executada porque o serviço de prévia estava ocupado.

## Atualização 1.2.0 — preços por quantidade e desconto no pedido

- Em **Produtos**, abra **Preço automático por quantidade** e cadastre quantidade mínima e preço por unidade. Exemplo: caneca a R$ 40 e faixa a R$ 35 com mínimo 11 (acima de 10). Use mínimo 10 se valer já com 10 unidades. São permitidas até 10 faixas com preços decrescentes.
- A regra soma as unidades do mesmo produto, inclusive cores e artes diferentes. Produtos diferentes não entram na mesma faixa. Nas variações, o preço da faixa vale para todas as cores. Os preços são conferidos pelo servidor e também são usados no valor declarado da cotação do frete.
- O cliente pode digitar a quantidade no carrinho. O preço se ajusta ao subir ou descer de faixa e aparece no resumo do WhatsApp e no pedido salvo.
- Em **Pedidos**, o painel permite desconto adicional em reais ou porcentagem sobre os produtos. O frete fica separado. O total, a entrada mínima de 50% e o saldo são recalculados. O sistema registra o desconto em centavos e o motivo no histórico. Salve antes de usar **Enviar total salvo no WhatsApp**.
- Alterar faixas de um produto não muda os pedidos já fechados. O desconto manual funciona também nos pedidos existentes. O acompanhamento mostra o desconto e o total atualizado; o pagamento continua combinado pelo WhatsApp.
- A nova migração acrescenta desconto e motivo com valor inicial zero, mantendo valores e estoque anteriores. Nenhum cadastro real é alterado automaticamente; configure as faixas nos produtos desejados após atualizar.

Conferido no navegador da prévia: caneca de R$ 40, 10 unidades por R$ 400 e 11 unidades por R$ 385 com faixa mínima 11. A interface administrativa e o layout móvel desta atualização não passaram por conferência visual; os cálculos e a persistência foram verificados pela suíte de testes.

## Atualização 1.3.0 — vendas lançadas pela loja

O botão **Nova venda** permite registrar vendas feitas presencialmente, pelo WhatsApp ou para empresas e prefeituras. O formulário recebe cliente, CPF/CNPJ e WhatsApp opcionais, data da venda, referência de contrato/empenho, produtos do catálogo ou itens avulsos, quantidades, preços combinados, descontos, frete, etapa, pagamentos e vencimento.

- Nas linhas do catálogo, o preço é sugerido pelas faixas de quantidade. Desmarque **Usar preço do catálogo** para informar um preço negociado. Itens avulsos recebem descrição e valor próprios e não movimentam estoque.
- A loja escolhe se quer baixar o estoque ao registrar a venda. A baixa é feita uma única vez, em transação, respeitando as cores. Para uma venda antiga cujo estoque já foi baixado, desmarque a opção; o cancelamento dessa venda não devolve unidades ao estoque.
- Uma venda lançada no painel pode ficar em produção ou entregue sem entrada, para permitir pagamento a prazo. Pedidos feitos pelo cliente no site continuam com a regra de entrada de pelo menos 50%. O campo de origem é definido pelo servidor e o cadastro manual exige login administrativo.
- Em **Pedidos e vendas → Vendas e totais**, filtre datas, origem e cliente/referência. O relatório exibe vendido, recebido e saldo a receber, com paginação e totais de todos os registros do período. Orçamentos não confirmados e vendas canceladas não compõem esses totais. Os recebimentos são os valores acumulados registrados nessas vendas, não um fluxo de caixa pela data do pagamento.
- Abra a venda para atualizar recebimentos, desconto e etapa. Se foi registrada sem movimentar estoque, a opção de baixar depois fica disponível. Vendas com estoque já baixado são desfeitas pelo cancelamento, que devolve as unidades reservadas uma única vez.
- Produtos, pedidos e pagamentos anteriores são mantidos. A nova migração acrescenta origem, data da venda e dados do lançamento manual; não recria o banco.

A apresentação do formulário foi conferida no navegador em uma prévia estática com dados demonstrativos. A gravação, a autorização, a baixa de estoque, os relatórios e a persistência foram verificados pelos testes da API. O fluxo administrativo completo no navegador e o layout móvel não foram exercitados nesta versão.
