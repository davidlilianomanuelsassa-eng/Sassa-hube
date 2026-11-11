# Sassa Hube — Plano de expansão

Lema: **Aprender a conhecer para transformar** — (2026, David Sassa).

Este plano orienta a expansão sem substituir nem apagar os ficheiros, as publicações ou a configuração Supabase existentes. O trabalho decorre na branch `feature/expansao-plataforma`; a branch `main` permanece intacta até à revisão e aprovação.

## Princípios de preservação
- Manter a tabela `public.works`, o bucket `work-files`, a autenticação e a configuração Supabase já existentes.
- Não expor chaves secretas no navegador; usar apenas a chave pública já destinada ao cliente.
- Não tornar privadas ou apagar publicações existentes durante a migração.
- Criar novas tabelas e políticas RLS de forma incremental, com scripts SQL separados e reversíveis sempre que possível.
- Testar cada etapa antes de integrar na página inicial e publicar.

## Etapa 1 — Biblioteca Digital, pesquisa e partilha
- Criar uma página de Biblioteca Digital que consulta a tabela `works` já existente.
- Pesquisa por título, descrição e categoria; filtros por categoria.
- Acesso aos ficheiros publicados e partilha individual por WhatsApp.
- Manter consulta pública sem exigir respostas, registo ou início de sessão.
- Verificar compatibilidade com a estrutura atual do Supabase.

## Etapa 2 — Academia Sassa Hube e certificados
- Criar catálogo de cursos, módulos e aulas.
- Criar inscrições e acompanhamento de progresso.
- Emitir certificados verificáveis apenas após conclusão definida pelo administrador.
- Preparar tabelas próprias e políticas RLS para cursos, matrículas, progresso e certificados.

## Etapa 3 — Perfis, fórum, comentários, avaliações e notificações
- Perfis públicos com dados mínimos e controlados pelo próprio utilizador.
- Fórum com tópicos, respostas e moderação.
- Comentários e avaliações associados às publicações.
- Notificações internas para respostas e actualizações relevantes.
- Controlos contra spam, abuso e acesso indevido.

## Etapa 4 — Centro de Investigação
- Áreas temáticas, autores, resumos, palavras-chave e referências.
- Submissão e revisão editorial de artigos.
- Pesquisa e consulta pública dos trabalhos aprovados.

## Etapa 5 — Administração, estatísticas e assistente inteligente
- Painel de administração ligado a dados reais, com permissões por função.
- Estatísticas de publicações, consultas e participação, com recolha proporcional e respeito pela privacidade.
- Assistente para localizar e explicar conteúdos publicados; não inventar fontes nem substituir aconselhamento especializado.
- Registo de actividades administrativas relevantes.

## Etapa 6 — Qualidade e lançamento
- Testes funcionais, de segurança, acessibilidade e responsividade.
- Verificação das políticas RLS, regras de armazenamento e permissões.
- Teste de fluxos de registo, recuperação de conta, publicação e consulta.
- Revisão final e integração na branch principal apenas após validação.

## Estado
- [x] Plano e branch de trabalho criados.
- [ ] Etapa 1: Biblioteca Digital, pesquisa e partilha.
- [ ] Etapa 2: Academia e certificados.
- [ ] Etapa 3: Comunidade e notificações.
- [ ] Etapa 4: Centro de Investigação.
- [ ] Etapa 5: Administração, estatísticas e assistente.
- [ ] Etapa 6: Testes e lançamento.
