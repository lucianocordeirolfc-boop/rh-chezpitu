# Manual do Usuário — Sistema RH Chez Pitu

Guia rápido e objetivo para o uso diário do sistema de Gestão de Pessoal.

Acesso: **https://chez-pitu-rh.web.app**

---

## 1. Primeiros passos

1. Abra o endereço do sistema no navegador.
2. Faça login com seu usuário e senha.
3. No topo da tela você verá:
   - **Abas de empresa:** `Chez Pitu` e `Pengold`.
   - **Status de sincronização:** "Sincronizado" (dados salvos na nuvem).
   - **Versão:** ex. `v2026.06.10.02 | PRODUÇÃO` (clique para ver detalhes).

> **Importante:** tudo o que você vê e edita pertence à **empresa selecionada na aba**. Antes de lançar qualquer informação, confirme se a aba correta está ativa.

---

## 2. Trocar de empresa

Clique na aba **Chez Pitu** ou **Pengold** no topo.
Todo o sistema (escala, feriados, vale-transporte, etc.) passa a mostrar os dados daquela empresa. Nada é apagado ao trocar de aba.

---

## 3. Menu de módulos

Logo abaixo das abas, use o menu horizontal para navegar:

| Módulo | Para que serve |
|---|---|
| **Dashboard** | Visão geral: total de funcionários, pendências e alertas. |
| **Cadastro de Funcionários** | Incluir, editar e consultar funcionários. |
| **Escala de Folga** | Montar a escala mensal de trabalho e folgas. |
| **Ausências** | Registrar férias, atestados e faltas. |
| **Recibo de Vale Transporte** | Gerar o recibo mensal de VT. |
| **Controle de Feriados** | Controlar feriados trabalhados e compensações. |
| **Informações do Contador** | Lançamentos e relatórios para o contador. |

---

## 4. Cadastro de Funcionários

1. Abra **Cadastro de Funcionários**.
2. Clique em **+ Novo funcionário**.
3. Preencha nome, setor, cargo, data de admissão e demais dados.
4. **Salvar**.

O funcionário é cadastrado na **empresa da aba ativa**. O cadastro é a fonte oficial de empresa, setor e cargo.

---

## 5. Escala de Folga

1. Abra **Escala de Folga**.
2. Selecione o **mês/ano** desejado.
3. Para cada dia, escolha o código do funcionário (trabalho, FOLGA, FÉRIAS, CO, etc.).
4. As alterações são salvas automaticamente.

### Compensar feriado trabalhado (CO)
1. No dia em que o funcionário vai compensar, lance o código **CO**.
2. Abre um quadro para escolher **qual feriado** está sendo compensado.
3. Selecione o feriado e confirme.

> Só aparecem no quadro os feriados em que **aquele funcionário** está vinculado como tendo trabalhado (ver seção 7). Após vincular o CO, o feriado sai da lista.

---

## 6. Ausências (Férias, Atestados, Faltas)

1. Abra **Ausências**.
2. Clique em **+ Nova ausência** (ou no botão correspondente ao tipo).
3. Escolha o funcionário, o tipo e o período.
4. **Salvar**.

A ausência reflete automaticamente na Escala e no cálculo do Vale Transporte.
Para alterar, use o botão **Editar** na linha do registro.

---

## 7. Controle de Feriados

Tela para registrar **quem trabalhou em um feriado** e acompanhar a compensação.

### Cadastrar um feriado
1. Clique em **+ Cadastrar feriado**.
2. Informe nome, data e tipo.
3. **Salvar feriado**.

### Vincular um funcionário a um feriado (manual)
Use quando o funcionário trabalhou em um feriado e precisa compensar.

1. Clique em **+ Vincular funcionário a feriado** (no topo da tela, ao lado de "+ Cadastrar feriado").
2. No modal, escolha:
   - **Feriado** (entre os cadastrados da empresa);
   - **Funcionário** (entre os ativos da empresa).
3. A **data trabalhada** é preenchida automaticamente pela data do feriado.
4. Clique em **Salvar vínculo**.

O vínculo nasce com status **Pendente** e origem **Manual**.
A partir daí, o feriado fica disponível para compensação (código CO) na Escala daquele funcionário.

> **Regras de segurança:** vincula apenas o funcionário escolhido (nunca todos). Se o funcionário já estiver vinculado àquele feriado, o sistema avisa e não cria duplicado.

### Acompanhar a compensação
A tabela "Histórico de feriados" mostra cada vínculo com:
- status (Pendente, Agendado, Compensado, Vencido);
- barra de prazo (120 dias para compensar);
- data de compensação prevista.

Use os filtros e as abas (Pendentes, Vencidos, Alertas) para localizar rapidamente.

---

## 8. Recibo de Vale Transporte

1. Abra **Recibo de Vale Transporte**.
2. Selecione o mês/ano.
3. O sistema calcula os dias trabalhados (descontando folgas, férias, atestados e dias de CO).
4. Ajuste descontos manuais se necessário.
5. Imprima ou gere o PDF.

---

## 9. Informações do Contador

Tela com os lançamentos e o resumo para envio ao contador, sempre referente à **empresa da aba ativa**. Use o botão de impressão/PDF para gerar o relatório.

---

## 10. Versão do sistema

No canto superior direito aparece a versão atual, ex.: `v2026.06.10.02 | PRODUÇÃO`.

- **PRODUÇÃO** = site oficial na internet.
- **LOCAL** = arquivo aberto direto no computador (uso de teste).

Clique na versão para ver detalhes (data da publicação, ambiente, último commit).

> Se algo parecer desatualizado após uma novidade, atualize a página com **Ctrl + F5** para carregar a versão mais nova.

---

## 11. Boas práticas

- ✅ Confirme sempre a **aba da empresa** antes de lançar dados.
- ✅ Aguarde o status **"Sincronizado"** antes de fechar o sistema.
- ✅ Use **Editar** para corrigir registros (não recadastre).
- ❌ Não há necessidade de "salvar tudo": o sistema salva automaticamente.
- ❌ Nenhum dado é apagado ao trocar de empresa, mês ou módulo.

---

*Dúvidas ou problemas: anote a versão exibida no cabeçalho e descreva o passo onde ocorreu.*
