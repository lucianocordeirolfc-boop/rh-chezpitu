# CLAUDE.md — Projeto RH Chez Pitu

Este arquivo orienta o agente a trabalhar corretamente no projeto RH Chez Pitu.

## Contexto

Sistema web de Gestão de Pessoal do Grupo Chez Pitu.

Módulos principais:
- Dashboard
- Cadastro de Funcionários
- Escala de Folga
- Ausências
- Recibo de Vale-transporte
- Controle de Feriados
- Informações Contador

## Regras obrigatórias

Antes de qualquer alteração:
1. Ler este arquivo.
2. Ler PROJECT_RULES.md.
3. Ler PROJECT_HISTORY.md.
4. Verificar impacto em todos os módulos integrados.
5. Não alterar código sem entender a causa raiz.

## Empresas

Existem duas empresas:
- Chez Pitu
- Pengold

A empresa oficial de cada funcionário vem sempre do Cadastro de Funcionários.

Não usar empresa ativa global como fonte principal.

Cada página deve ter seu próprio filtro de empresa quando necessário.

## Fonte de verdade

Sempre usar employeeId como vínculo principal.

Nome do funcionário só pode ser fallback para migração de dados antigos.

## Imutabilidade dos dados registrados (REGRA FIXA)

Melhorias, correções, refatorações e **testes** NUNCA podem alterar dados já
registrados pelo usuário: feriados lançados e seus vínculos, escala, recibos de
vale-transporte, ausências/férias, lançamentos do Contador e cadastro.

- Teste e homologação usam **fixtures** / `scripts/verify-*.mjs`, nunca a base
  de produção (localStorage real ou Firebase).
- Validação ao vivo em produção é **somente leitura**: não acionar recompute de
  escala (`runScaleIntegrations`), seeds, dedup ou migrações como parte do teste.
- Corrigir dado em produção só com **autorização explícita do usuário**,
  descrevendo antes o que será alterado.

Detalhamento completo: PROJECT_RULES.md → "Imutabilidade dos dados já registrados".

## Persistência

Nunca apagar dados existentes.

Nunca resetar localStorage ou Firebase.

Nunca sobrescrever dados remotos sem merge seguro.

Filtros não podem salvar base filtrada.

Sempre salvar base completa.

## Git

Não criar commit sem autorização.

Não fazer push sem autorização.

Não executar deploy sem autorização.

Antes de commit:
- rodar npm test
- rodar npm run validate
- informar arquivos alterados
- informar riscos restantes
- registrar a alteração em PROJECT_HISTORY.md (obrigatório e automático —
  ver PROJECT_RULES.md → "Registro obrigatório no histórico")

## Deploy

Deploy oficial:
- GitHub main (versionamento)
- Firebase Hosting (produção: chez-pitu-rh.web.app e chez-pitu-rh.firebaseapp.com)

Publicação: `npm run deploy` (roda bump-cache + `firebase deploy --only hosting`).
Config em `firebase.json` / `.firebaserc` (projeto chez-pitu-rh).
Não usamos mais Netlify (arquivos netlify.* mantidos apenas como histórico/obsoleto).

Antes de deploy:
- testar localmente
- validar regras críticas
- confirmar que não há conflito Git
- confirmar que Git está limpo após commit

## Conduta do agente

Sempre responder com:
- problema identificado
- causa provável
- arquivos alterados
- testes executados
- pendências
- recomendação final