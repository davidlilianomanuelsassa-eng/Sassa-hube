# Campo da Secretaria — especificação funcional e técnica

Estado: planeamento aprovado; ainda não publicado em produção.
Repositório: Sassa-hube. Branch de trabalho: feature/campo-secretaria.

## 1. Objectivo

Criar uma área privada chamada **Campo da Secretaria**, acessível apenas ao proprietário da plataforma e a uma assistente administrativa convidada. A área não deve aparecer a visitantes nem a outros utilizadores autenticados.

Cada pessoa utiliza a sua própria conta Supabase Auth. Não partilhar credenciais.

## 2. Perfis

### Proprietário
- Controlo integral da plataforma e das permissões.
- Convidar, activar, suspender ou remover a assistente.
- Consultar todos os pedidos, notificações e registos de auditoria.
- Aprovar operações reservadas.
- Gerir configurações críticas, segurança, propriedade e integrações.

### Assistente administrativa — autonomia moderada
Pode, sem aprovação prévia:
- Criar, editar e publicar livros e materiais.
- Autorizar e publicar conteúdos dentro das áreas editoriais permitidas.
- Gerir catálogo, capas, descrições e ficheiros de livros.
- Consultar e acompanhar encomendas; executar tarefas operacionais autorizadas.
- Responder a perguntas e organizar documentos e tarefas.
- Consultar relatórios administrativos não sensíveis.
- Enviar mensagens internas e receber notificações.

Exige aprovação do proprietário:
- Eliminação definitiva de publicações, livros, ficheiros ou registos.
- Alterações a dados bancários, métodos de pagamento ou integrações.
- Alterações globais de configuração, segurança ou políticas.
- Alterações de propriedade, criação de administradores ou gestão de credenciais.
- Operações financeiras irreversíveis ou excepções de encomendas.

A lista de permissões deve ser configurável pelo proprietário; a assistente não pode conceder permissões a si própria.

## 3. Navegação e privacidade

- O menu **Campo da Secretaria** só é renderizado depois da verificação da sessão e da autorização no servidor/base de dados.
- A rota e os dados não podem ser protegidos apenas por CSS, JavaScript ou ocultação do menu.
- Visitantes e contas comuns recebem acesso negado, mesmo que conheçam o URL.
- A assistente vê apenas os módulos e acções autorizados.
- O painel do proprietário mostra a mesma área, acrescida de gestão de membros, aprovações e auditoria.

## 4. Aprovações

Cada pedido guarda:
- identificador, tipo de operação e recurso afectado;
- descrição e justificação;
- autor e data de criação;
- estado: pendente, aprovado, rejeitado ou cancelado;
- decisor, data da decisão e observação;
- referência ao registo de auditoria.

Fluxo:
1. A assistente submete a operação que exige aprovação.
2. O sistema cria o pedido em estado pendente e não executa a operação.
3. O proprietário recebe uma notificação no painel e um e-mail.
4. O proprietário abre o painel autenticado e aprova ou rejeita.
5. A operação é executada apenas no servidor após validar o decisor e o estado pendente.
6. A assistente recebe o resultado no painel; a decisão fica auditada.

O e-mail é apenas um aviso com ligação para o painel. Nunca aprovar por resposta de e-mail nem incluir palavras-passe, tokens ou dados privados no aviso.

## 5. Notificações por e-mail

- Destinatário inicial: endereço confirmado da conta do proprietário, obtido do Supabase Auth no servidor.
- Eventos: novo pedido de aprovação, decisão tomada, falha de entrega e alertas administrativos importantes.
- Preferências para frequência e tipos de aviso ficam configuráveis pelo proprietário.
- Usar um serviço de envio no servidor (Edge Function); nunca expor chaves ou tokens no JavaScript público.
- Registar estado de envio, data, tentativa e erro técnico sanitizado; nunca registar segredos.
- Repetir envios com limite e protecção contra duplicação.

Estado observado: o repositório contém código/documentação de integração Gmail, mas no projecto Supabase só estavam activas as Edge Functions `download-book` e `gmail-oauth-callback`. As funções `gmail-oauth-start` e `gmail-send` não estavam activas na listagem consultada e as tabelas de credenciais Gmail estavam vazias. Portanto, notificações por e-mail ainda não estão prontas; devem ser configuradas e testadas antes de prometer envio.

## 6. Dados a criar

Desenho lógico (nomes sujeitos à revisão da migração):
- `site_members`: associação de utilizadores ao site, papel proprietário/assistente e estado activo/suspenso.
- `site_member_permissions`: permissões explícitas por módulo e acção.
- `secretary_approval_requests`: pedidos e decisões de aprovação.
- `secretary_notifications`: notificações internas e estado de leitura.
- `secretary_messages`: mensagens privadas entre proprietário e assistente.
- `secretary_tasks`: tarefas, prazos, responsáveis e estados.
- `secretary_audit_logs`: registo append-only das operações e decisões.

Não guardar passwords, tokens de recuperação ou chaves API nestas tabelas.

## 7. Segurança e autorização

- Manter a tabela actual `site_admins` apenas como mecanismo legado/identificação do proprietário até a migração estar validada. **Não adicionar a assistente a `site_admins`**, porque o código actual e as políticas RLS tratam qualquer membro dessa tabela como administrador total.
- Substituir gradualmente a verificação binária `isAdmin()` por verificações específicas: `isOwner()` e `hasPermission(module, action)`.
- RLS activa em todas as tabelas expostas. As políticas devem validar o utilizador e a permissão exacta, com autorização decidida no servidor/base de dados.
- Não usar `user_metadata` para autorizar operações. Alterações de papel/permissão devem ser feitas por operação administrativa segura no servidor.
- A assistente nunca pode actualizar o próprio papel ou permissões.
- Operações privilegiadas e execução de aprovações devem validar a sessão, o papel, a permissão e o estado actual do pedido no servidor.
- Os registos de auditoria não podem ser editados nem apagados pela assistente.
- Não colocar service-role/secret keys no frontend ou no repositório.

## 8. Situação técnica observada

- Frontend actual: HTML, CSS e JavaScript estáticos, publicado no GitHub Pages.
- Backend de dados/autenticação: Supabase.
- Projecto Supabase identificado pelo próprio repositório: `qcdgtglayifhgwbgsfyi`.
- O painel actual `admin.html` faz login Supabase e verifica pertença a `site_admins`.
- A tabela `site_admins` tinha um registo; as políticas RLS de livros, encomendas, publicações, comprovativos e relatórios usam essa tabela como acesso administrativo.
- A tabela de encomendas e catálogo já existem; não duplicar essas tabelas para a secretaria.
- As notificações por e-mail dependem de completar e testar o serviço de envio.

## 9. Plano de implementação

1. Rever as políticas RLS actuais e identificar as operações exactas em cada módulo.
2. Criar migração aditiva para membros, permissões, aprovações, notificações, mensagens, tarefas e auditoria.
3. Definir políticas RLS e funções de autorização seguras; testar com contas de proprietário, assistente e visitante.
4. Criar convite individual da assistente com confirmação de e-mail; não criar conta partilhada.
5. Implementar o Campo da Secretaria e separar o painel da assistente do painel do proprietário.
6. Implementar aprovação no servidor e histórico append-only.
7. Activar o envio de e-mail e testar notificações sem dados sensíveis.
8. Executar testes de acesso negado, testes funcionais e revisão dos Supabase Security Advisors.
9. Só depois abrir revisão e integrar em `main`, publicando no GitHub Pages.

## 10. Critérios de aceitação

- Conta comum não descobre nem consulta dados do Campo da Secretaria.
- Assistente não consegue elevar as próprias permissões nem aceder à administração de proprietário.
- Assistente consegue publicar livros/conteúdos autorizados.
- Operações reservadas não são executadas antes da aprovação.
- Proprietário recebe aviso interno e e-mail de pedido de aprovação.
- Todas as acções administrativas e decisões ficam auditadas.
- Remover/suspender a assistente corta o acesso sem afectar a conta do proprietário.
- Nenhuma chave secreta é incluída no frontend ou no Git.


## 11. Progresso de implementação — 20/11/2026

Foi criada na branch `feature/campo-secretaria` uma primeira versão de trabalho:
- `secretaria.html`: interface privada com autenticação individual, verificação de membro activo no servidor/base de dados e módulos iniciais de aprovações, tarefas, notificações e histórico.
- `supabase/migrations/20261120160000_campo_secretaria_core.sql`: estrutura aditiva para membros, permissões, pedidos de aprovação, notificações, mensagens, tarefas, auditoria e políticas RLS. A migração regista como proprietário o administrador legado existente.
- `supabase/functions/secretary-review/index.ts`: função autenticada para o proprietário aprovar/rejeitar pedidos, com validação no servidor; a decisão é registada com notificação interna e auditoria.
- Os ficheiros permanecem na branch de trabalho. A migração ainda não foi aplicada ao projecto Supabase e a Edge Function ainda não foi publicada. Por isso, a interface ainda não está operacional em produção.
- A aprovação de um pedido regista a decisão, mas não executa automaticamente a operação crítica. Cada tipo de operação terá de ser ligado a um executor seguro e validado antes de ser activado.
- O envio de e-mail continua por configurar e testar. As notificações internas também dependem da migração.
- A assistente ainda não foi convidada, criada ou autorizada. O acesso só será preparado depois da aprovação expressa do proprietário.


### Chat privado estilo SMS
- A página `secretaria.html` inclui um único separador de chat privado, com balões distintos para mensagens enviadas e recebidas, data/hora, estado de leitura e caixa de composição.
- O envio utiliza a Edge Function autenticada `secretary-message`, que valida o membro activo e entrega a mensagem apenas ao outro membro activo.
- A interface subscreve eventos Realtime da tabela `secretary_messages` e actualiza a conversa quando há novas mensagens.
- A tabela mantém RLS: apenas remetente e destinatário podem ler; o envio exige que o remetente seja a própria conta autenticada e que o destinatário seja membro activo.
- O chat está preparado no código da branch. Só ficará disponível depois da migração de base de dados, publicação da função e configuração/activação do Realtime no projecto.


## Estado da aplicação em produção — 20/11/2026
- Aplicadas as migrações de núcleo, permissões de módulos, fila privada de e-mail, auditoria append-only e reforço de privilégios.
- A conta existente em `site_admins` foi registada como proprietário em `site_members`; não foi criada nenhuma conta de assistente.
- A tabela `secretary_messages` foi adicionada à publicação `supabase_realtime`.
- Edge Functions activas com JWT obrigatório: `secretary-message`, `secretary-review`, `secretary-request-approval`, `secretary-task-update` e `secretary-members`.
- A auditoria não permite inserções/alterações directas por utilizadores autenticados; os registos são escritos por serviços confiáveis.
- Acesso anónimo ao chat não tem privilégios; utilizadores autenticados só têm leitura e actualização restrita de `read_at`; a inserção de mensagens ocorre no servidor.
- O teste SQL em transacção foi revertido e confirmou a sintaxe das migrações antes da aplicação.
- Testes de privilégios confirmaram: sem SELECT para anon; sem INSERT para authenticated em mensagens; sem INSERT em auditoria; leitura e marcação de leitura limitadas por RLS.
- Os avisos existentes relativos às tabelas OAuth Gmail sem políticas, funções SECURITY DEFINER antigas e protecção de passwords comprometidas continuam por rever; a fila de e-mail sem políticas é intencional e só é acessível por service_role.
- O envio de e-mail não está configurado nem foi testado; não prometer notificações por e-mail até definir remetente/domínio e segredos do serviço.
- O chat ainda não pode ser testado com duas pessoas porque não existe assistente activa. A pessoa será convidada/aprovada apenas depois da escolha explícita do proprietário.
- A interface permanece na branch `feature/campo-secretaria`; não foi integrada em `main` nem publicada no GitHub Pages. A publicação aguarda revisão e autorização específica.
