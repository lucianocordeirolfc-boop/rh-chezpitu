/**
 * Manual do Usuário acessível dentro do sistema.
 * Conteúdo embutido (sem fetch) para funcionar em file:// e em produção.
 * Espelha MANUAL_USUARIO.md. Abre via window.UserManual.open().
 */
(function () {
  const MANUAL_HTML = `
    <h3>1. Primeiros passos</h3>
    <ol>
      <li>Abra o sistema no navegador e faça login.</li>
      <li>No topo da tela você verá as <strong>abas de empresa</strong> (Chez Pitu / Pengold),
          o <strong>status de sincronização</strong> e a <strong>versão</strong>.</li>
    </ol>
    <p class="manual-note">Tudo o que você vê e edita pertence à <strong>empresa selecionada na aba</strong>.
       Confirme a aba correta antes de lançar qualquer informação.</p>

    <h3>2. Trocar de empresa</h3>
    <p>Clique na aba <strong>Chez Pitu</strong> ou <strong>Pengold</strong> no topo. Todo o sistema passa a
       mostrar os dados daquela empresa. Nada é apagado ao trocar de aba.</p>

    <h3>3. Menu de módulos</h3>
    <table class="manual-table">
      <thead><tr><th>Módulo</th><th>Para que serve</th></tr></thead>
      <tbody>
        <tr><td>Dashboard</td><td>Visão geral: total de funcionários, pendências e alertas.</td></tr>
        <tr><td>Cadastro de Funcionários</td><td>Incluir, editar e consultar funcionários.</td></tr>
        <tr><td>Escala de Folga</td><td>Montar a escala mensal de trabalho e folgas.</td></tr>
        <tr><td>Ausências</td><td>Registrar férias, atestados e faltas.</td></tr>
        <tr><td>Recibo de Vale Transporte</td><td>Gerar o recibo mensal de VT.</td></tr>
        <tr><td>Controle de Feriados</td><td>Controlar feriados trabalhados e compensações.</td></tr>
        <tr><td>Informações do Contador</td><td>Lançamentos e relatórios para o contador.</td></tr>
      </tbody>
    </table>

    <h3>4. Cadastro de Funcionários</h3>
    <ol>
      <li>Abra <strong>Cadastro de Funcionários</strong> e clique em <strong>+ Novo funcionário</strong>.</li>
      <li>Preencha nome, setor, cargo, data de admissão e demais dados.</li>
      <li><strong>Salvar</strong>.</li>
    </ol>
    <p>O funcionário é cadastrado na empresa da aba ativa. O cadastro é a fonte oficial de empresa, setor e cargo.</p>

    <h3>5. Escala de Folga</h3>
    <ol>
      <li>Abra <strong>Escala de Folga</strong> e selecione o <strong>mês/ano</strong>.</li>
      <li>Para cada dia, escolha o código do funcionário (trabalho, FOLGA, FÉRIAS, CO, etc.).</li>
      <li>As alterações são salvas automaticamente.</li>
    </ol>
    <p><strong>Compensar feriado trabalhado (CO):</strong> lance o código <strong>CO</strong> no dia da compensação,
       escolha <strong>qual feriado</strong> está sendo compensado e confirme. Só aparecem os feriados em que
       aquele funcionário está vinculado como tendo trabalhado (ver seção 7). Após vincular, o feriado sai da lista.</p>

    <h3>6. Ausências (Férias, Atestados, Faltas)</h3>
    <ol>
      <li>Abra <strong>Ausências</strong> e clique em <strong>+ Nova ausência</strong>.</li>
      <li>Escolha o funcionário, o tipo e o período. <strong>Salvar</strong>.</li>
    </ol>
    <p>A ausência reflete automaticamente na Escala e no cálculo do Vale Transporte.
       Para alterar, use o botão <strong>Editar</strong> na linha do registro.</p>

    <h3>7. Controle de Feriados</h3>
    <p><strong>Cadastrar um feriado:</strong> clique em <strong>+ Cadastrar feriado</strong>, informe nome, data e tipo, e salve.</p>
    <p><strong>Vincular um funcionário a um feriado (manual):</strong></p>
    <ol>
      <li>Clique em <strong>+ Vincular funcionário a feriado</strong> (topo da tela, ao lado de "+ Cadastrar feriado").</li>
      <li>Escolha o <strong>Feriado</strong> e o <strong>Funcionário</strong> (ativos da empresa).</li>
      <li>A <strong>data trabalhada</strong> é preenchida automaticamente pela data do feriado.</li>
      <li>Clique em <strong>Salvar vínculo</strong>.</li>
    </ol>
    <p>O vínculo nasce <strong>Pendente</strong>, origem <strong>Manual</strong>, e o feriado fica disponível para
       compensação (CO) na Escala daquele funcionário.</p>
    <p class="manual-note">Vincula apenas o funcionário escolhido (nunca todos). Se já existir vínculo,
       o sistema avisa e não cria duplicado.</p>
    <p>A tabela "Histórico de feriados" mostra status (Pendente, Agendado, Compensado, Vencido), a barra de
       prazo (120 dias para compensar) e a data prevista. Use os filtros e as abas para localizar rapidamente.</p>

    <h3>8. Recibo de Vale Transporte</h3>
    <ol>
      <li>Abra <strong>Recibo de Vale Transporte</strong> e selecione o mês/ano.</li>
      <li>O sistema calcula os dias trabalhados (descontando folgas, férias, atestados e dias de CO).</li>
      <li>Ajuste descontos manuais se necessário e imprima ou gere o PDF.</li>
    </ol>

    <h3>9. Informações do Contador</h3>
    <p>Lançamentos e resumo para envio ao contador, sempre referente à empresa da aba ativa.
       Use o botão de impressão/PDF para gerar o relatório.</p>

    <h3>10. Versão do sistema</h3>
    <p>No canto superior direito aparece a versão atual (ex.: <code>v2026.06.10.03 | PRODUÇÃO</code>).
       <strong>PRODUÇÃO</strong> = site oficial; <strong>LOCAL</strong> = arquivo aberto no computador.
       Clique na versão para ver detalhes. Se algo parecer desatualizado, atualize com <strong>Ctrl + F5</strong>.</p>

    <h3>11. Boas práticas</h3>
    <ul>
      <li>Confirme sempre a <strong>aba da empresa</strong> antes de lançar dados.</li>
      <li>Aguarde o status <strong>"Sincronizado"</strong> antes de fechar o sistema.</li>
      <li>Use <strong>Editar</strong> para corrigir registros (não recadastre).</li>
      <li>O sistema salva automaticamente — não é preciso "salvar tudo".</li>
      <li>Nenhum dado é apagado ao trocar de empresa, mês ou módulo.</li>
    </ul>
  `;

  function close() {
    document.getElementById("userManualBackdrop")?.remove();
    document.removeEventListener("keydown", onKey);
  }

  function onKey(event) {
    if (event.key === "Escape") close();
  }

  function open() {
    close();

    const backdrop = document.createElement("div");
    backdrop.id = "userManualBackdrop";
    backdrop.className = "modal-backdrop";

    const card = document.createElement("div");
    card.className = "manual-modal-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", "Manual do Usuário");
    card.innerHTML = `
      <div class="manual-modal-header">
        <h2>Manual do Usuário</h2>
        <button class="popup-close" type="button" data-close-manual aria-label="Fechar">✕</button>
      </div>
      <div class="manual-modal-body">${MANUAL_HTML}</div>
      <div class="manual-modal-footer">
        <button class="primary btn-sm" type="button" data-close-manual>Fechar</button>
      </div>
    `;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close();
    });
    card.querySelectorAll("[data-close-manual]").forEach((btn) => btn.addEventListener("click", close));
    document.addEventListener("keydown", onKey);
  }

  window.UserManual = { open };
})();
