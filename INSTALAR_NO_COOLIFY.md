# Hunay Personalizados — instalação no Coolify

Este pacote é independente do ChatGPT. Inclui o mesmo catálogo e personalizador, painel administrativo com usuário/senha, banco SQLite e arquivos locais persistentes.

## 1. Enviar ao GitHub

Extraia o ZIP e envie o conteúdo para a raiz de um repositório. Na raiz devem aparecer `Dockerfile`, `package.json`, `package-lock.json`, `server`, `app`, `lib` e `public`.

Não envie `node_modules`, `data`, `.env` ou backups ao GitHub. O pacote já contém as regras para ignorá-los.

## 2. Criar a aplicação no Coolify

Em seu projeto, adicione uma aplicação usando o repositório. Selecione **Dockerfile** como Build Pack / Build Strategy.

| Campo | Valor |
| --- | --- |
| Base Directory | `/` |
| Dockerfile Location | `/Dockerfile` |
| Ports Exposes / porta interna | `3000` |
| Domínio | O endereço escolhido para a Hunay |
| Healthcheck | `GET /healthz`, porta `3000` |

O processo já escuta em `0.0.0.0`. Não é necessário mapear uma porta pública do servidor: o proxy do Coolify encaminha o domínio para a porta interna.

## 3. Configurar as variáveis de ambiente

Cadastre como variáveis de **runtime**, não como argumentos de build:

| Variável | Valor |
| --- | --- |
| `ADMIN_USERNAME` | `admin`, ou outro usuário que você escolher |
| `ADMIN_PASSWORD` | Sua senha, com 10 a 128 caracteres |
| `APP_URL` | Endereço completo do site, por exemplo `https://seu-dominio.com.br` |
| `PORT` | `3000` |
| `DATA_DIR` | `/data` |
| `MELHOR_ENVIO_TOKEN` | Opcional: token da conta de envio, para cotação automática |

**Não há senha padrão.** A aplicação não inicia sem `ADMIN_PASSWORD` válida. O campo `APP_URL` deve corresponder exatamente à origem do domínio usado no navegador; não coloque caminho `/admin`.

Se alterar a senha nas variáveis e reiniciar, as sessões antigas serão encerradas. Os produtos e pedidos permanecem.

## 4. Criar o volume ANTES do primeiro uso

Na aplicação, abra **Persistent Storage** e adicione um **Volume Mount**:

- Nome sugerido: `hunay_data`.
- Destination Path / caminho dentro do container: **`/data`**.
- Use um volume exclusivo desta aplicação.

Nesse volume ficam:

```
/data/hunay.sqlite       banco de dados
/data/uploads/          fotos e artes dos pedidos
/data/auth-salt          dado interno de autenticação
/data/backups/          backups gerados manualmente
```

**Manter o mesmo volume e o mesmo destino `/data` nas próximas atualizações.** Não renomeie nem exclua o volume. Não monte o volume em `/app`: isso esconderia os arquivos da aplicação.

O container usa o usuário `node` (UID 1000). Um Volume Mount novo é a opção mais simples. Se usar uma pasta do servidor já existente, ela deve permitir leitura e escrita ao UID 1000.

## 5. Publicar e acessar

Clique em **Deploy**. Abra o site e depois `/admin` para acessar o painel com o usuário e a senha das variáveis.

Em **Configurações**, defina WhatsApp com DDD, CEP de origem, endereço de retirada, prazo de produção e eventual taxa de entrega local por prefixo de CEP. Revise produtos, fotos, valores e estoque antes de desativar o aviso de demonstração.

Os dados iniciais são demonstrativos. Este ZIP não transporta os pedidos, configurações ou arquivos que eventualmente tenham sido cadastrados na prévia hospedada anteriormente. Isso requer uma migração de dados separada.

## Frete e personalização

- Retirada e taxa de entrega local funcionam com os dados cadastrados.
- Sem conta de envio conectada, Correios fica **a confirmar**. O painel permite registrar o valor do frete no pedido.
- Para cotação automática, configure `MELHOR_ENVIO_TOKEN` no Coolify e o CEP de origem na loja. A geração de etiquetas não está incluída.
- O editor gera PNG colorido e preto/branco. A conferência da arte e os parâmetros da máquina continuam no LightBurn.
- Não há geração de artes por IA.

## Atualizações e backups

Atualize os arquivos no mesmo repositório e faça o deploy mantendo o volume. As migrações são aplicadas uma única vez; o catálogo não é semeado novamente se o banco já existe.

Para criar um backup completo, abra o terminal do container no Coolify e execute:

```bash
node server/backup.mjs
```

O arquivo é criado em `/data/backups/` e inclui uma cópia consistente do banco, fotos e artes. Copie o backup para fora da VPS. Um volume persistente preserva dados em redeploys, mas não substitui backup externo.

O botão de exportação no painel salva cadastros e pedidos em JSON. Para incluir também os arquivos das artes, use o backup completo acima.

Esta versão usa SQLite em um único container. Mantenha uma réplica; não compartilhe o volume gravável entre vários containers.

## Alternativa com Docker Compose

O `docker-compose.yml` incluso usa o mesmo Dockerfile e já declara o volume `hunay_data:/data`. Use-o a partir de um repositório com contexto de build. Cadastre `ADMIN_PASSWORD` e configure o domínio do serviço `hunay` na porta `3000`.

## Verificação antes de atender clientes

Entre no painel, monte um orçamento de teste, confirme a entrada e confira estoque/arte. Reinicie a aplicação e confirme que o pedido continua salvo. Só depois de revisar os dados demonstrativos use para vendas reais.

## Atualização 1.0.1 — abertura por HTTP

Corrigida a criação dos identificadores do carrinho/pedido para funcionar também em endereços `http://...sslip.io`. Em alguns navegadores, a versão anterior podia ficar em branco logo depois de abrir. O código agora usa geração segura de identificadores disponível nesse contexto e mantém os identificadores fortes criados pelo servidor para acesso aos pedidos.

Atualize os arquivos no mesmo repositório e faça Redeploy. Mantenha o volume `/data` e as variáveis já configuradas. Não é necessário recriar nem limpar o banco.

A imagem também passa a incluir `curl` para o healthcheck HTTP do Coolify. Se usar o check pelo painel: método GET, esquema HTTP, host localhost, porta 3000, caminho `/healthz`. Se deixar o check do painel desativado, permanece a verificação nativa do Dockerfile usando Node.

Para o uso real com clientes e login administrativo, configure HTTPS no domínio antes de receber senhas e dados de pedidos.

## Atualização 1.1.0 — coleções e variações

Atualize os arquivos no mesmo repositório e faça **Redeploy**, mantendo o mesmo volume em `/data` e as variáveis atuais. Não recrie a aplicação nem limpe o banco. A migração é aplicada automaticamente uma única vez e preserva os cadastros e pedidos anteriores.

No painel:

1. **Produtos e estoque:** edite ou crie o produto, marque que tem variações e cadastre cada cor com foto, preço e estoque próprios. Cadastre a garrafa de 600 ml em **Garrafas**. Informe unidades disponíveis, sem as já reservadas. Se um produto já tem unidades reservadas, mantenha seu tipo de estoque e crie um novo produto para o modelo com cores.
2. **Coleções e estampas:** crie as estampas, informe o nome da coleção (Natal, por exemplo), envie a imagem sem o nome e escolha os campos que o cliente pode alterar. Confira a posição do nome na prévia. O cliente sempre pode editar o nome; a loja controla a frase e os elementos.
3. **Configurações:** confirme o WhatsApp com DDD. O orçamento salva a cor, o tipo de personalização, a estampa e as instruções. Depois o cliente abre o WhatsApp e envia o resumo para combinar o pagamento.
4. **Pedidos:** confirme manualmente o recebimento da entrada. A reserva continua exigindo pelo menos 50% do total e desconta somente a cor pedida. A aprovação da arte continua pelo atendimento.

A opção **A Hunay cria minha arte** permite pedir a personalização sem usar o editor. O cliente informa o nome, o tema ou uma referência; a loja prepara a arte depois de confirmar a entrada. Não há integração de pagamento nem IA nesta versão.
