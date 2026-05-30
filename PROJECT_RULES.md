# PROJECT_RULES.md — Regras de Negócio RH Chez Pitu

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