# PROJECT_RULES.md — Regras de Negócio RH Chez Pitu

## Padrão visual / Cores (REGRA FIXA)

O sistema segue o **padrão de cores oficial do Grupo Chez Pitu**: **navy + pêssego**.
Fonte de verdade do padrão: `C:\Users\conta\projetos\chezpitu-firebase\hosting\rh`.
Nunca reverter para a paleta antiga (verde-mar + dourado).

Tokens oficiais (em `css/style.css`, bloco `:root` da Fase 2):
- `--sea-900: #0e2148`
- `--sea-800: #133169`  (navy principal da marca)
- `--sea-700: #1d3f73`
- `--sea-500: #2a5d8f`
- `--sea-200: #c9d6ea`
- `--sea-100: #eef2f8`
- `--gold: #FFBC7D`     (pêssego — cor de destaque da marca)
- `--soft-blue: #4FA8FF`
- `--shadow: 0 16px 40px rgba(19, 49, 105, 0.12)`

Chrome institucional (sempre escuro navy + destaque pêssego): `.topbar`, `.company-tab`,
`.module-ribbon`, `.ribbon-item` usam navy `#102346`/`#15294F` com realce `#FFBC7D`.
Conteúdo dos módulos e folhas de impressão permanecem claros.

Proibido:
- Substituir esses tokens por outras cores sem autorização.
- Deixar `css/style.css` divergir do padrão de `chezpitu-firebase/hosting/rh`
  (após qualquer deploy, conferir se as cores continuam navy + pêssego).

## Empresas

Empresas do sistema:
- Chez Pitu
- Pengold

A empresa do funcionário deve vir do Cadastro de Funcionários.

Funcionário não pode aparecer em empresa diferente da cadastrada.

## Cadastro de Funcionários

Cada funcionário deve ter:
- employeeId
- nome
- empresa
- setor
- cargo
- horário
- status ativo/inativo

employeeId é o vínculo principal do sistema.

## Escala de Folga

A escala deve respeitar:
- empresa
- mês
- ano
- setor
- funcionário

A escala não pode misturar funcionários de empresas diferentes.

Trocar empresa não pode apagar dados.

Trocar mês não pode apagar dados.

## Códigos da Escala

Códigos importantes:
- F = Folga
- D = Domingo
- FÉRIAS = Férias
- CO = Folga compensatória
- TR = cobertura Catherina
- TM = cobertura André
- MR = cobertura Rosana

## Regras de cobertura

Catherina Victoria de Azeredo:
- Sempre que estiver de folga ou ausência, deve haver outro funcionário com código TR.

André Justo de Barros:
- Sempre que estiver de folga ou ausência, deve haver outro funcionário com código TM.

Rosana Santos de Freitas:
- Sempre que estiver de folga ou ausência, deve haver outro funcionário com código MR.

Férias e atestados também devem respeitar regras de cobertura quando aplicável.

## Vale-transporte

Para cálculo de VT, contam apenas dias realmente trabalhados.

Não contam como dia trabalhado:
- F
- D, se for folga/domingo não trabalhado
- FÉRIAS
- ATESTADO
- LICENÇA
- CO
- ausência cadastrada

CO deve obrigatoriamente abater VT.

Férias devem abater VT.

Atestado deve abater VT.

Licença deve abater VT.

Ausência cadastrada deve prevalecer para cálculo de VT, mesmo que exista lançamento manual conflitante na escala.

## Controle de Feriados

Todo feriado trabalhado gera direito à compensação.

Prazo máximo:
- 120 dias corridos a partir da data trabalhada.

Status possíveis:
- Pendente
- Agendado
- Compensado
- Vencido

Regra:
- Pendente: sem data de compensação.
- Agendado: com data futura de compensação.
- Compensado: já compensado.
- Vencido: passou de 120 dias e não compensou.

## CO e Feriados

O código CO deve se vincular somente a feriados pendentes do próprio funcionário.

O modal CO deve filtrar por:
- employeeId
- empresa
- status Pendente ou Vencido
- não compensado
- não vinculado a outro CO

Nunca mostrar feriados pendentes de outro funcionário.

## Feriados específicos

Padroeira de Búzios:
- data correta: 26/07

Nunca usar 21/05 para Padroeira de Búzios.

Se aparecer 21/05, corrigir:
- seeds
- defaults
- localStorage
- Firebase
- migrações
- geração automática

## Ausências

Ausências incluem:
- férias
- atestado
- licença
- outros afastamentos

Ausência deve refletir:
- Escala de Folga
- Vale-transporte
- Dashboard
- Informações Contador

## Informações Contador

Deve respeitar:
- empresa selecionada
- mês
- ano
- funcionários da empresa
- ausências
- férias
- VT
- feriados quando aplicável

PDF e impressão devem usar os mesmos filtros exibidos na tela.

### Lançamentos do Contador

Campos de horas (Hora Extra e Ad. Noturno) usam digitação livre no formato
`HH:MM`, aceitando de `00:00` até `200:00`. Não usar mais lista suspensa
(`input type="time"`), que limitava a 23:59.

## Proteção de lançamentos existentes (REGRA FIXA)

Qualquer alteração de melhoria, refatoração, migração ou correção:

- NUNCA pode apagar, excluir ou alterar um lançamento já efetuado.
- NUNCA pode resetar, limpar ou sobrescrever a base de lançamentos existente.
- Deve preservar integralmente o histórico já salvo (localStorage e Firebase).
- Mudanças de formato/validação (ex.: campos de horas) aplicam-se apenas a
  novos lançamentos e edições feitas pelo próprio usuário, mantendo os valores
  antigos legíveis e válidos.

Exceção única: exclusão ou edição explícita feita pelo próprio usuário na
interface (botões de editar/excluir), sempre com confirmação. Nenhuma rotina
automática pode descartar dados sem ação direta do usuário.

## Registro obrigatório no histórico (REGRA FIXA)

Toda alteração de melhoria, correção, refatoração ou nova funcionalidade que
chegar a commit DEVE ser registrada em `PROJECT_HISTORY.md`, automaticamente,
como parte do fluxo de trabalho — sem depender de pedido do usuário.

Procedimento padrão a cada entrega:

1. Adicionar uma entrada datada (`## AAAA-MM-DD — <título>`) no topo do
   `PROJECT_HISTORY.md`, logo abaixo do cabeçalho.
2. Descrever: o que mudou, arquivos afetados, motivo/causa raiz, testes
   executados e commits relacionados.
3. Fazer esse registro ANTES ou no MESMO commit das alterações (nunca deixar
   o histórico defasado em relação ao código já commitado).
4. Nunca apagar nem reescrever entradas antigas do histórico — apenas
   acrescentar novas (o histórico é append-only).

Esta regra vale para todas as sessões e para qualquer agente que trabalhe no
projeto.

## Dashboard

Dashboard deve usar a mesma base oficial dos módulos.

Cards não podem divergir das tabelas.

## Persistência

Nunca salvar apenas dados filtrados.

Sempre salvar base completa.

Ao carregar dados padrão, verificar antes se já existem dados salvos.

Migrações devem preservar dados antigos.

## Firebase / localStorage

Firebase e localStorage devem fazer merge seguro.

Nunca sobrescrever dados recentes com dados antigos.

Nunca recriar dados incorretos já corrigidos.