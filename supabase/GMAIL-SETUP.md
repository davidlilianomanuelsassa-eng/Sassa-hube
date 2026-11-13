# Configuração Gmail — Sassa Hube

## O que esta integração faz
- O administrador inicia a ligação Gmail em `gmail-connect.html`.
- O token de renovação é cifrado com AES-GCM antes de ser guardado na tabela privada `gmail_oauth_credentials`.
- A função `gmail-send` valida a referência e o código de acesso contra o hash guardado em `store_orders`.
- O e-mail informa que pagamentos aguardam verificação; não aprova pagamentos nem liberta livros.
- Uma falha de e-mail não apaga nem invalida a encomenda.

## 1. SQL
Executar no SQL Editor:
`supabase/migrations/202611130001_gmail_oauth.sql`

## 2. Segredos nas Edge Functions
Já existentes no projecto: `GMAIL_CLIENT_ID` e `GMAIL_CLIENT_SECRET`.

Adicionar:
- `GMAIL_TOKEN_ENCRYPTION_KEY`: chave aleatória de 32 bytes codificada em Base64 URL-safe. Gerar localmente com:
  `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=' `
  Atenção: a saída do comando acima é Base64 URL-safe sem padding. Guardar directamente no Supabase Secrets; nunca no GitHub, site ou conversa.
- `GMAIL_REDIRECT_URI`: `https://qcdgtglayifhgwbgsfyi.supabase.co/functions/v1/gmail-oauth-callback`
- `GMAIL_FROM_EMAIL`: endereço Gmail que foi autorizado.

As funções também precisam dos segredos de sistema `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Em projectos Supabase onde apenas existe `SUPABASE_SECRET_KEYS`, configurar a chave de serviço como secret `SUPABASE_SERVICE_ROLE_KEY` usando a chave secreta do projecto; nunca a publicar no cliente.

## 3. Google Cloud
O URI de redireccionamento OAuth tem de coincidir exactamente com `GMAIL_REDIRECT_URI`.
Activar Gmail API e manter `https://www.googleapis.com/auth/gmail.send` como único scope.
Enquanto o ecrã OAuth estiver em Testing, apenas test users podem autorizar e refresh tokens para scopes Gmail podem expirar ao fim de 7 dias. Para utilização pública contínua, concluir o processo de publicação/verificação Google.

## 4. Publicar com Supabase CLI
A partir da raiz do repositório:
```sh
supabase login
supabase link --project-ref qcdgtglayifhgwbgsfyi
supabase functions deploy gmail-oauth-start --no-verify-jwt
supabase functions deploy gmail-oauth-callback --no-verify-jwt
supabase functions deploy gmail-send --no-verify-jwt
```
Estas funções validam autorização/admin ou referência + código no próprio código. Não alterar nem voltar a publicar `download-book`.

## 5. Ligar Gmail
Depois de publicar as funções e o site:
abrir `https://davidlilianomanuelsassa-eng.github.io/Sassa-hube/gmail-connect.html`, entrar como administrador e clicar em **Ligar Gmail com Google**.

## Observações de segurança
- Nunca colocar Client Secret, refresh token, service-role key ou chave de cifragem em ficheiros do GitHub.
- Nunca enviar esses valores por chat.
- Não registar tokens nem códigos de acesso nos logs.
- Testar primeiro com uma encomenda de teste de valor zero.
