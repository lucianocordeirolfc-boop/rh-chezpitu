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

    <p><strong>O selo de sincronização</strong> (ao lado da versão) mostra se os seus dados já
       estão na nuvem:</p>
    <table class="manual-table">
      <thead><tr><th>O que aparece</th><th>O que significa</th></tr></thead>
      <tbody>
        <tr><td>Sincronizado</td><td>Tudo salvo na nuvem e visível nos outros computadores.</td></tr>
        <tr><td>Sincronizando…</td><td>Enviando agora. Some em segundos.</td></tr>
        <tr><td>Offline — cache local</td><td>Sem internet. Pode continuar trabalhando: o sistema guarda no computador e envia sozinho quando a conexão voltar.</td></tr>
        <tr><td>Erro de sincronização</td><td>O envio falhou. Passe o mouse no selo para ver o motivo. Se não resolver sozinho, avise o suporte.</td></tr>
        <tr><td>⚠ relógio … atrasado/adiantado</td><td>A data/hora <strong>deste computador</strong> está errada em relação ao servidor. Seus dados continuam corretos (o sistema usa a hora do servidor), mas vale acertar a data/hora do Windows.</td></tr>
      </tbody>
    </table>

    <h3>2. Trocar de empresa</h3>
    <p>Clique na aba <strong>Chez Pitu</strong> ou <strong>Pengold</strong> no topo. Todo o sistema passa a
       mostrar os dados daquela empresa. Nada é apagado ao trocar de aba.</p>

    <h3>3. Menu de módulos</h3>
    <table class="manual-table">
      <thead><tr><th>Módulo</th><th>Para que serve</th></tr></thead>
      <tbody>
        <tr><td>Dashboard</td><td>Visão geral: total de funcionários, pendências e alertas.</td></tr>
        <tr><td>Cadastro de Funcionários</td><td>Incluir, editar e consultar funcionários.</td></tr>
        <tr><td>Cargos e Salários</td><td>Funções da empresa com salário, CBO e comissões.</td></tr>
        <tr><td>Quadro de Vagas</td><td>Vagas em aberto, painel, recrutamento e admissões.</td></tr>
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
    <p><strong>Alterar folga não mexe no passado:</strong> mudanças na folga fixa, nos domingos de folga ou na 2ª folga valem a partir da data em que você salva; os dias anteriores ficam como estavam.</p>
    <p>O <strong>Cargo</strong> é escolhido em lista suspensa com as funções de <strong>Cargos e Salários</strong> da empresa. Ao escolher a função, o <strong>CBO</strong>, o <strong>salário</strong>, a <strong>gratificação</strong> e a <strong>insalubridade</strong> aparecem preenchidos e não podem ser alterados no cadastro — mudam só em Cargos e Salários. Cargo antigo que ainda não está em Cargos e Salários continua salvo e aparece com o aviso "não cadastrada em Cargos e Salários". Enquanto a empresa não tiver nenhuma função cadastrada, vale a lista antiga com <strong>➕ Cadastrar novo cargo</strong>.</p>
    <p><strong>Exportar Excel:</strong> na Lista de funcionários, baixa uma planilha <code>.xlsx</code> com todos os funcionários da empresa da aba ativa (ativos e inativos, sem os filtros da tela) — uma linha por funcionário, uma coluna por campo do cadastro. CPF e CTPS saem como texto; datas e VT como data e valor reais. Só lê os dados, nada é alterado.</p>

    <h3>4.1 Cargos e Salários</h3>
    <p>Cada empresa tem as suas funções. Duas sub-abas:</p>
    <ul>
      <li><strong>Funções e Salários:</strong> função, CBO (0000-00), salário e comissões. Uma função tem um único salário (não existem duas funções com o mesmo nome, mesmo com maiúsculas/acentos diferentes) Se o CBO já estiver em outra função, o sistema avisa e pede confirmação (níveis da mesma função, como Cozinheiro I e II, não geram aviso). <strong>Gratificação:</strong> valor em R$, no formato do salário. Mudança de salário fica no histórico da função. <strong>Insalubridade:</strong> em Editar, escolha um grau da CLT (10%, 20% ou 40%) ou "Outro percentual" (CCT/laudo) e informe ao lado o <strong>salário base para cálculo</strong> — o valor (base × %) é calculado automaticamente.</li>
      <li><strong>Comissões:</strong> Taxa de Serviço Bar, Taxa de Serviço Frigobar, Comissão Ocupação, Walk-in, Extensão de Diária e PL Anual, cada uma com um campo para explicar como funciona. Em <em>Funções e Salários</em> você marca quais funções recebem cada comissão. Comissões e explicações são por empresa; o Relatório PDF mostra só as comissões que alguma função da empresa recebe.</li>
    </ul>
    <p><strong>Padronizar e importar do cadastro:</strong> traz os cargos já usados no Cadastro de Funcionários com a grafia padrão sugerida (ex.: "GARÇON" → "Garçom", "Enc. De Manutenção" → "Encarregado de Manutenção"). Você pode ajustar cada nome; nada é gravado antes da confirmação. A grafia antiga fica guardada no histórico do funcionário. Depois, preencha CBO e salário em <strong>Editar</strong>.</p>
    <p><strong>Relatório PDF:</strong> em Cargos e Salários e no Quadro de Vagas, o botão <strong>Relatório PDF</strong> permite escolher as seções; na janela de impressão, escolha <strong>Salvar como PDF</strong>.</p>
    <p>Excluir função só é possível sem funcionários vinculados (ativos ou inativos) e sem vaga em andamento; a função excluída sai da lista na hora.</p>

    <h3>4.2 Quadro de Vagas</h3>
    <p>Separado por empresa, com quatro sub-abas: <strong>Vagas em aberto</strong> (função de Cargos e Salários, setor, quantidade, contrato, motivo, abertura, prioridade/prazo, status, gestor, escolaridade, atribuições do cargo, requisitos obrigatórios, desejáveis e diferenciais, e observações — cada vaga em um cartão; vaga nova sugere o perfil da última vaga da mesma função), <strong>Painel RH</strong> (indicadores calculados), <strong>Recrutamento e Seleção</strong> (candidatos por vaga, situação, data e horário, parecer e feedback — candidato "Agendado" aparece como etiqueta de entrevista no cartão da vaga) e <strong>Admissões</strong> (etapas com data: documentos, ASO agendado, ASO liberado, contabilidade e início; concluídas todas, "Cadastrar funcionário" abre o cadastro completo já preenchido). A admissão com situação "Iniciou" conta como admitido da vaga. Exclusões vão para a <strong>Lixeira</strong>.</p>

    <h3>5. Escala de Folga</h3>
    <ol>
      <li>Abra <strong>Escala de Folga</strong> e selecione o <strong>mês/ano</strong>. A grade abre só para consulta.</li>
      <li>Clique em <strong>✎ Editar escala</strong> e escolha os códigos (trabalho, F, D, CO etc.). A célula alterada fica com contorno tracejado: ainda não foi gravada.</li>
      <li>Clique em <strong>Salvar escala</strong> (ou <strong>Cancelar</strong> para descartar). Copiar anterior e Limpar mês também só valem depois de salvar.</li>
    </ol>
    <p><strong>Escala 5x2 (EC 141/2026):</strong> a partir da semana de 21/12/2026 cada funcionário precisa de
       <strong>2 folgas por semana</strong> (segunda a domingo; F e D contam, CO não). A escala só é salva se todos
       cumprirem — senão abre um aviso com o nome do funcionário e a semana em que falta folga. Semanas com férias,
       atestado, licença, suspensão, admissão ou desligamento não são cobradas.</p>
    <p><strong>Alertas de cobertura:</strong> retirados (Catherina, André e Rosana). TR, TM e MR são turnos comuns.</p>
    <p><strong>2ª folga semanal (5x2):</strong> no Cadastro, clique em <strong>Sugerir 2ª folga (5x2)</strong>. A sugestão é por setor
       (no máximo 2 de folga no dia, evitando sexta e sábado). A 2ª folga pode ser no <strong>domingo</strong> (todos os domingos) —
       sugerida para quem folga no sábado, formando o fim de semana. Marque <strong>Regime feminino</strong> para as funcionárias
       (2 domingos quinzenais, CLT art. 386) e clique em <strong>Aplicar ao cadastro</strong>. A escala lança a 2ª folga sozinha nas
       semanas sem domingo de folga, a partir de 21/12/2026 — meses passados não mudam.</p>
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
    <p><strong>Cadastrar um feriado:</strong> clique em <strong>+ Cadastrar feriado</strong>, informe nome, data, tipo e <strong>Vale para</strong>, e salve. Feriado de lei ou de convenção coletiva (tipo <strong>Categoria (CCT)</strong>) vale para as duas empresas (padrão); "Interno" só para a empresa da aba. Os vínculos de funcionários continuam separados por empresa. Se faltar um feriado na outra empresa, use o botão <strong>+ Pengold</strong> / <strong>+ Chez Pitu</strong> em Gerenciar feriados (só acrescenta, sem vínculos).</p>
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
    <p><strong>Feriado cadastrado não pode ser excluído.</strong> Para corrigir nome ou data, use <strong>Editar</strong>.
       Para tirar um funcionário de um feriado, use <strong>Excluir vínculo</strong> na linha dele: a confirmação mostra
       o funcionário, o feriado e a situação. O vínculo excluído vai para a <strong>Lixeira</strong> (botão
       <strong>Lixeira (N)</strong>, no topo da tela), de onde pode ser <strong>restaurado</strong> com status e compensação.</p>
    <p><strong>Troca de folga no feriado:</strong> o vínculo automático nasce quando a escala marca o dia do feriado como
       trabalhado. Se depois a escala desse dia passar a marcar folga (FOLGA, DOM, FÉRIAS, atestado...), o vínculo
       automático <strong>sem compensação</strong> deixa de aparecer sozinho na relação de feriados — e volta se a escala
       voltar a marcar trabalho. Nada é apagado.</p>
    <p><strong>Escala indica folga:</strong> quando o vínculo é manual ou já tem compensação (CO lançado), ele continua
       aparecendo com a etiqueta vermelha <strong>Escala: …</strong> e entra no indicador <strong>Escala indica folga</strong>.
       Confira: se o funcionário não trabalhou no feriado, use <strong>Excluir vínculo</strong> (e reveja o CO); se trabalhou,
       corrija a escala.</p>
    <p><strong>Incluir um feriado anterior ao Corpus Christi (retroativo):</strong> para datas do início do ano
       (Ano Novo, Carnaval, Quarta-feira de Cinzas, Tiradentes, São Jorge), use <strong>+ Cadastrar feriado</strong>
       informando a data (ex.: <code>01/01</code>, <code>18/02</code>) e depois <strong>+ Vincular funcionário a feriado</strong>.</p>
    <p class="manual-note">Meses sem escala preenchida (jan/fev/mar) não vinculam ninguém automaticamente; se houver
       vínculo automático antigo, ao salvar o manual o sistema confirma e converte para Manual, sem duplicar nem apagar.
       Ano Novo, Quarta-feira de Cinzas, Semana Santa, Tiradentes e São Jorge de 2026 já vêm pré-cadastrados.</p>
    <p>A tabela "Histórico de feriados" mostra status (Pendente, Agendado, Compensado, Vencido), a barra de
       prazo (120 dias para compensar) e a data prevista. Use os filtros e as abas para localizar rapidamente.</p>
    <p><strong>Imprimir / PDF:</strong> aplique os filtros (ex.: Funcionário = Cristiane) e clique no botão azul, à direita do título
       "Histórico de feriados",
       <strong>Imprimir / PDF</strong>. Escolha o <strong>Conteúdo</strong> (Ambos, Somente feriados trabalhados ou Somente
       projeção) e, com mais de um funcionário, o <strong>Formato</strong> (Arquivo único, uma página por funcionário ou
       <strong>Um PDF por funcionário</strong> — neste, clique em Gerar PDF em cada nome ou em Gerar próximo). Na janela de
       impressão escolha <strong>Salvar como PDF</strong>. O relatório traz os <strong>feriados trabalhados</strong> (prazo,
       compensação e status) e/ou a <strong>projeção dos próximos feriados</strong> lida da escala (Trabalha, Provável
       trabalho, Não trabalha ou Lançado), com o <strong>saldo a compensar</strong>; folga tirada antes do feriado aparece como <strong>antecipada</strong>.</p>
    <p class="manual-note">Status, prazo e compensação filtram só os feriados trabalhados; a projeção segue os filtros de
       funcionário, setor, feriado e busca por nome. Gerar o relatório não altera nenhum dado.</p>

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
