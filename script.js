const consumoInput = document.getElementById("consumoInput");
const addBtn = document.getElementById("addConsumo");
const totalCard = document.getElementById("totalCard");
const mediaCard = document.getElementById("mediaCard");
const variacaoCard = document.getElementById("variacaoCard");

let consumos = [];
let grafico;

// Função para atualizar o gráfico e os valores
function atualizarDados() {
  const total = consumos.reduce((a, b) => a + b, 0);
  const media = consumos.length > 0 ? total / consumos.length : 0;

  // Cálculo da variação
  let variacao = 0;
  if (consumos.length > 1) {
    const ultimo = consumos[consumos.length - 1];
    const anterior = consumos[consumos.length - 2];
    variacao = ((ultimo - anterior) / anterior) * 100;
  }

  // Atualiza textos
  totalCard.textContent = `Consumo Total: ${total.toFixed(1)} kWh`;
  mediaCard.textContent = `Gasto Médio: ${media.toFixed(1)} kWh`;
  variacaoCard.textContent = `Variação: ${variacao.toFixed(1)}%`;

  atualizarGrafico();
}

// Cria gráfico com Chart.js
function criarGrafico() {
  const ctx = document.getElementById("grafico").getContext("2d");
  grafico = new Chart(ctx, {
    type: "line",
    data: {
      labels: consumos.map((_, i) => `Dia ${i + 1}`),
      datasets: [{
        label: "Consumo (kWh)",
        data: consumos,
        borderColor: "#4c63ff",
        backgroundColor: "rgba(76,99,255,0.2)",
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

// Atualiza o gráfico existente
function atualizarGrafico() {
  if (!grafico) {
    criarGrafico();
  } else {
    grafico.data.labels = consumos.map((_, i) => `Dia ${i + 1}`);
    grafico.data.datasets[0].data = consumos;
    grafico.update();
  }
}

// Evento de clique no botão
addBtn.addEventListener("click", () => {
  const valor = parseFloat(consumoInput.value);
  if (isNaN(valor) || valor <= 0) {
    alert("Digite um valor válido de consumo (kWh).");
    return;
  }

  consumos.push(valor);
  consumoInput.value = "";
  atualizarDados();
});
