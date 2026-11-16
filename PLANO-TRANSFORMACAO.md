# Transformação Sassa Hube — implementação inicial

## Princípios de segurança
- Trabalho desenvolvido numa branch separada: feature/transformacao-premium-2026.
- A branch main e as funções existentes de biblioteca, livraria, encomendas e download-book não são alteradas.
- A página nova usa a chave pública Supabase já existente; nunca inclui service_role.
- Novas tabelas têm RLS e cada utilizador só gere os seus próprios dados.
- Certificados não são emitidos automaticamente: dependem de revisão administrativa.
- A comunidade precisa de moderação e regras claras; a página inicial publica conversas com estado published.

## Entregas desta versão
- Nova página experiencia.html com identidade visual premium, adaptada a telemóveis.
- Área pessoal com autenticação Supabase, perfil público opcional e painel de favoritos/progresso.
- Directório de autores baseado em perfis que optaram por apresentação pública.
- Academia com três módulos de exercícios e gravação de resultados.
- Comunidade com publicação autenticada e listagem de conversas publicadas.
- Estrutura de certificados com pedido, validação e emissão administrativa.
- Migração incremental supabase-expansao.sql.

## Activação necessária
1. Rever e executar supabase-expansao.sql no SQL Editor do projecto Supabase.
2. Confirmar o fluxo de confirmação de e-mail em Authentication > URL Configuration.
3. Rever quem deve ter app_metadata.role = admin antes de gerir tópicos ou certificados.
4. Testar registo, login, perfil, favoritos, exercícios, publicação e políticas RLS.
5. Só depois da revisão, abrir pull request para integrar na main.

## Ainda não incluído nesta entrega
- Leitor PDF incorporado com protecção de direitos e permissões por livro.
- Emissão automática de certificados em PDF.
- Respostas encadeadas/moderação avançada do fórum.
- Métricas de tráfego; devem ser adicionadas com política de privacidade e retenção definidas.
- Notificações por e-mail/push.
