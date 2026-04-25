const BET_STORAGE_KEY = "premier_ml_bets_v1";

const state = {
  data: null,
  shotFilter: "all",
  teamFilter: "",
  xgFilter: 0,
  selectedMatchKey: "",
  charts: {},
  currentPrediction: null,
  selectedBetOutcome: "H",
  bets: [],
  lastSimulation: null,
};

const ALIASES = {
  "man utd": "man united",
  "man united": "man united",
  "nottm forest": "nott'm forest",
  "nott'm forest": "nott'm forest",
};

document.addEventListener("DOMContentLoaded", async () => {
  bindTabs();
  try {
    const data = await loadDashboardData();
    state.data = hydrateData(data);
    state.bets = loadStoredBets();
    populateOverview();
    initPredictor();
    initShotMap();
    initPerformance();
    initEDA();
    renderBetTracking();
  } catch (error) {
    console.error("No se pudo cargar el dashboard:", error);
    const badge = document.getElementById("runtimeBadge");
    badge.textContent = "Error Data";
    badge.classList.remove("badge-live");
  }
});

async function loadDashboardData() {
  const isFileProtocol = window.location.protocol === "file:";
  if (!isFileProtocol) {
    try {
      const response = await fetch("./data/dashboard-data.json", { cache: "no-store" });
      if (response.ok) {
        setText("runtimeBadge", "Server Fetch");
        return await response.json();
      }
    } catch (error) {
      console.warn("Fetch falló, usando datos embebidos.", error);
    }
  }

  if (window.DASHBOARD_FALLBACK_DATA) {
    setText("runtimeBadge", isFileProtocol ? "Local Embed" : "Embed Fallback");
    return window.DASHBOARD_FALLBACK_DATA;
  }

  throw new Error("No hay datos disponibles para el dashboard.");
}

function hydrateData(data) {
  const predictions = Array.isArray(data.predictions) ? data.predictions : [];
  const shots = Array.isArray(data.shots) ? data.shots : [];
  const teamStats = Array.isArray(data.eda?.team_stats) ? data.eda.team_stats : [];
  const teams = [...new Set(predictions.flatMap((item) => [item.home_team, item.away_team]))].sort((a, b) =>
    a.localeCompare(b),
  );

  const teamProfiles = new Map();
  const teamStatsMap = new Map();

  teamStats.forEach((item, index) => {
    teamStatsMap.set(item.team, { ...item, rank: index + 1 });
  });

  teams.forEach((team) => {
    teamProfiles.set(team, {
      team,
      home: { h: [], d: [], a: [] },
      away: { h: [], d: [], a: [] },
      overall: { h: [], d: [], a: [] },
    });
  });

  predictions.forEach((item) => {
    ensureTeamProfile(teamProfiles, item.home_team);
    ensureTeamProfile(teamProfiles, item.away_team);

    const homeProfile = teamProfiles.get(item.home_team);
    const awayProfile = teamProfiles.get(item.away_team);

    homeProfile.home.h.push(item.home_win_prob);
    homeProfile.home.d.push(item.draw_prob);
    homeProfile.home.a.push(item.away_win_prob);
    homeProfile.overall.h.push(item.home_win_prob);
    homeProfile.overall.d.push(item.draw_prob);
    homeProfile.overall.a.push(item.away_win_prob);

    awayProfile.away.h.push(item.home_win_prob);
    awayProfile.away.d.push(item.draw_prob);
    awayProfile.away.a.push(item.away_win_prob);
    awayProfile.overall.h.push(item.home_win_prob);
    awayProfile.overall.d.push(item.draw_prob);
    awayProfile.overall.a.push(item.away_win_prob);
  });

  return {
    ...data,
    predictions,
    shots,
    teams,
    teamStats,
    teamStatsMap,
    teamProfiles,
  };
}

function ensureTeamProfile(map, team) {
  if (!map.has(team)) {
    map.set(team, {
      team,
      home: { h: [], d: [], a: [] },
      away: { h: [], d: [], a: [] },
      overall: { h: [], d: [], a: [] },
    });
  }
}

function populateOverview() {
  const { meta, performance } = state.data;
  const goalCount = state.data.shots.filter((shot) => shot.is_goal).length;
  const avgXg = average(state.data.shots.map((shot) => shot.xg_prob));
  const topZone = [...state.data.eda.zone_conversion].sort((a, b) => b.shots_n - a.shots_n)[0];

  setText("seasonBadge", meta.season);
  setText("matchCountBadge", `${formatNumber(meta.match_count)} partidos`);
  setText("heroTeams", formatNumber(meta.team_count));
  setText("heroShots", formatNumber(meta.shot_count));
  setText("heroAccuracy", `${performance.match_predictor.accuracy.toFixed(1)}%`);
  setText("shotCountValue", formatNumber(meta.shot_count));
  setText("goalCountValue", formatNumber(goalCount));
  setText("goalRateValue", `${percent(goalCount / meta.shot_count)} conversión`);
  setText("avgXgValue", avgXg.toFixed(3));
  setText("topZoneValue", topZone?.zone || "N/A");
}

function initPredictor() {
  const homeSelect = document.getElementById("homeSelect");
  const awaySelect = document.getElementById("awaySelect");

  state.data.teams.forEach((team) => {
    homeSelect.add(new Option(team, team));
    awaySelect.add(new Option(team, team));
  });

  homeSelect.value = "Liverpool";
  awaySelect.value = "Bournemouth";

  homeSelect.addEventListener("change", updatePredictor);
  awaySelect.addEventListener("change", updatePredictor);
  document.getElementById("matchSearch").addEventListener("input", (event) => renderMatchList(event.target.value));
  document.getElementById("stakeInput").addEventListener("input", renderBetSlip);
  document.getElementById("placeBetBtn").addEventListener("click", placeBet);
  document.getElementById("simulateBtn").addEventListener("click", simulateMatch);
  document.getElementById("clearBetsBtn").addEventListener("click", clearBetsHistory);

  document.querySelectorAll("[data-bet-outcome]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedBetOutcome = button.dataset.betOutcome;
      renderBetSlip();
    });
  });

  renderMatchList("");
  updatePredictor();
}

function updatePredictor() {
  const homeTeam = document.getElementById("homeSelect").value;
  const awayTeam = document.getElementById("awaySelect").value;
  const prediction = findPrediction(homeTeam, awayTeam);

  state.currentPrediction = prediction;
  state.lastSimulation = null;

  setText("homeTeamLabel", homeTeam || "Local");
  setText("awayTeamLabel", awayTeam || "Visitante");
  setText("simHomeName", homeTeam || "Local");
  setText("simAwayName", awayTeam || "Visitante");

  const h = sanitizeProb(prediction.home_win_prob);
  const d = sanitizeProb(prediction.draw_prob);
  const a = sanitizeProb(prediction.away_win_prob);
  const maxProb = Math.max(h, d, a);
  const minProb = Math.min(h, d, a);

  setText("homeProb", percent(h));
  setText("drawProb", percent(d));
  setText("awayProb", percent(a));
  setText("outcomeHomeValue", percent(h));
  setText("outcomeDrawValue", percent(d));
  setText("outcomeAwayValue", percent(a));
  setText("homeOdds", `Odds ${formatOdd(toOdds(h))}`);
  setText("drawOdds", `Odds ${formatOdd(toOdds(d))}`);
  setText("awayOdds", `Odds ${formatOdd(toOdds(a))}`);
  setText("predictionMode", prediction.modeLabel);
  setText("predMatchDate", prediction.date || "Estimado");
  setText(
    "predActualScore",
    prediction.actual_result ? `${prediction.home_goals}-${prediction.away_goals}` : "Sin histórico directo",
  );
  setText("predConfidence", `${(maxProb * 100).toFixed(1)}%`);

  setBarState("homeBar", h, h, maxProb, minProb);
  setBarState("drawBar", d, d, maxProb, minProb);
  setBarState("awayBar", a, a, maxProb, minProb);
  setOutcomeState("outcomeHome", h, maxProb, minProb);
  setOutcomeState("outcomeDraw", d, maxProb, minProb);
  setOutcomeState("outcomeAway", a, maxProb, minProb);

  const winnerKey = h >= d && h >= a ? "H" : a >= h && a >= d ? "A" : "D";
  const resultText =
    winnerKey === "H" ? `Victoria ${homeTeam}` : winnerKey === "A" ? `Victoria ${awayTeam}` : "Empate";
  setText("predResultVal", resultText);
  setText("predResultSub", prediction.context);
  setText("simModeTag", prediction.modeLabel);

  updateTeamCards(homeTeam, awayTeam);
  renderInsights(prediction);
  renderProjectedTable();
  resetSimulationPanel();
  renderBetSlip();

  state.selectedMatchKey = `${normalizeTeam(homeTeam)}__${normalizeTeam(awayTeam)}`;
  highlightMatchRow();
}

function findPrediction(homeTeam, awayTeam) {
  const predictions = state.data.predictions;
  const exact = predictions.find(
    (item) => normalizeTeam(item.home_team) === normalizeTeam(homeTeam) && normalizeTeam(item.away_team) === normalizeTeam(awayTeam),
  );
  if (exact) {
    return {
      ...exact,
      source: "exact",
      modeLabel: "Exact match",
      context: "Partido encontrado en la base histórica con orientación local y visitante original.",
    };
  }

  const inverted = predictions.find(
    (item) => normalizeTeam(item.home_team) === normalizeTeam(awayTeam) && normalizeTeam(item.away_team) === normalizeTeam(homeTeam),
  );
  if (inverted) {
    return {
      ...inverted,
      home_team: homeTeam,
      away_team: awayTeam,
      home_win_prob: inverted.away_win_prob,
      draw_prob: inverted.draw_prob,
      away_win_prob: inverted.home_win_prob,
      source: "inverted",
      modeLabel: "Inverted match",
      context: "No existía el cruce exacto en ese orden. Se reutilizó el partido inverso ajustando la localía.",
    };
  }

  return {
    ...estimateFallbackPrediction(homeTeam, awayTeam),
    source: "fallback",
    modeLabel: "Smart fallback",
    context: "Partido estimado con perfiles promedio de fortaleza local, visita y sesgo de empate. Nunca queda vacío.",
  };
}

function estimateFallbackPrediction(homeTeam, awayTeam) {
  if (normalizeTeam(homeTeam) === normalizeTeam(awayTeam)) {
    return {
      home_team: homeTeam,
      away_team: awayTeam,
      home_win_prob: 0.34,
      draw_prob: 0.32,
      away_win_prob: 0.34,
      home_goals: null,
      away_goals: null,
      date: "",
      actual_result: "",
    };
  }

  const homeProfile = getTeamProfile(homeTeam);
  const awayProfile = getTeamProfile(awayTeam);
  const homeStrength = average(homeProfile.home.h) || average(homeProfile.overall.h) || 0.45;
  const awayStrength = average(awayProfile.away.a) || average(awayProfile.overall.a) || 0.28;
  const drawBase = average([...homeProfile.home.d, ...awayProfile.away.d]) || 0.26;

  let homeProb = homeStrength * 0.55 + (1 - awayStrength) * 0.25 + 0.11;
  let awayProb = awayStrength * 0.52 + (1 - homeStrength) * 0.18 + 0.06;
  let drawProb = drawBase * 0.82 + 0.06;

  const total = homeProb + awayProb + drawProb;
  homeProb /= total;
  awayProb /= total;
  drawProb /= total;

  return {
    home_team: homeTeam,
    away_team: awayTeam,
    home_win_prob: homeProb,
    draw_prob: drawProb,
    away_win_prob: awayProb,
    home_goals: null,
    away_goals: null,
    date: "",
    actual_result: "",
  };
}

function getTeamProfile(teamName) {
  const exact = state.data.teamProfiles.get(teamName);
  if (exact) {
    return exact;
  }

  const normalized = normalizeTeam(teamName);
  for (const [team, profile] of state.data.teamProfiles.entries()) {
    if (normalizeTeam(team) === normalized) {
      return profile;
    }
  }

  return {
    home: { h: [0.45], d: [0.27], a: [0.28] },
    away: { h: [0.45], d: [0.27], a: [0.28] },
    overall: { h: [0.45], d: [0.27], a: [0.28] },
  };
}

function updateTeamCards(homeTeam, awayTeam) {
  const homeStats = getTeamStats(homeTeam);
  const awayStats = getTeamStats(awayTeam);

  setText(
    "homeTeamMeta",
    homeStats ? `Ataque ${homeStats.goals} goles · #${homeStats.rank}` : "Perfil calculado por fallback",
  );
  setText(
    "awayTeamMeta",
    awayStats ? `Defensa ${awayStats.conceded} GC · #${awayStats.rank}` : "Perfil calculado por fallback",
  );

  document.getElementById("homeTeamCard").classList.add("active");
  document.getElementById("awayTeamCard").classList.add("active");
}

function getTeamStats(teamName) {
  const exact = state.data.teamStatsMap.get(teamName);
  if (exact) {
    return exact;
  }
  const normalized = normalizeTeam(teamName);
  for (const [team, stats] of state.data.teamStatsMap.entries()) {
    if (normalizeTeam(team) === normalized) {
      return stats;
    }
  }
  return null;
}

function renderBetSlip() {
  const prediction = state.currentPrediction;
  if (!prediction) {
    return;
  }

  const odds = {
    H: toOdds(prediction.home_win_prob),
    D: toOdds(prediction.draw_prob),
    A: toOdds(prediction.away_win_prob),
  };

  setText("betHomeOdd", formatOdd(odds.H));
  setText("betDrawOdd", formatOdd(odds.D));
  setText("betAwayOdd", formatOdd(odds.A));

  document.querySelectorAll("[data-bet-outcome]").forEach((button) => {
    button.classList.toggle("active", button.dataset.betOutcome === state.selectedBetOutcome);
  });

  const selectionLabel =
    state.selectedBetOutcome === "H" ? prediction.home_team : state.selectedBetOutcome === "A" ? prediction.away_team : "Empate";
  const stake = sanitizeStake(document.getElementById("stakeInput").value);
  const selectedOdds = odds[state.selectedBetOutcome];
  const payout = stake * selectedOdds;

  setText("betSelectionLabel", selectionLabel);
  setText("betOddsValue", formatOdd(selectedOdds));
  setText("potentialPayout", currency(payout));
  setText("betStatusTag", prediction.source === "fallback" ? "Model Odds" : "Market Ready");
}

function placeBet() {
  const prediction = state.currentPrediction;
  if (!prediction) {
    return;
  }

  const stake = sanitizeStake(document.getElementById("stakeInput").value);
  if (stake <= 0) {
    setText("betHelperText", "Ingresa un stake válido para registrar la apuesta.");
    return;
  }
  const oddsMap = {
    H: toOdds(prediction.home_win_prob),
    D: toOdds(prediction.draw_prob),
    A: toOdds(prediction.away_win_prob),
  };
  const selectedOdds = oddsMap[state.selectedBetOutcome];
  const bet = {
    id: `bet_${Date.now()}`,
    created_at: new Date().toISOString(),
    home_team: prediction.home_team,
    away_team: prediction.away_team,
    mode: prediction.modeLabel,
    source: prediction.source,
    selected_outcome: state.selectedBetOutcome,
    selected_label:
      state.selectedBetOutcome === "H"
        ? prediction.home_team
        : state.selectedBetOutcome === "A"
          ? prediction.away_team
          : "Empate",
    stake,
    odds: Number(selectedOdds.toFixed(2)),
    payout: Number((stake * selectedOdds).toFixed(2)),
    actual_result: prediction.actual_result || "",
    settled: Boolean(prediction.actual_result),
    won: prediction.actual_result ? prediction.actual_result === state.selectedBetOutcome : null,
  };

  state.bets.unshift(bet);
  persistBets();
  renderBetTracking();
  setText("betHelperText", `Bet guardada: ${bet.selected_label} · ${currency(bet.stake)} a cuota ${formatOdd(bet.odds)}`);
}

function renderBetTracking() {
  const totalBets = state.bets.length;
  const settled = state.bets.filter((bet) => bet.settled);
  const open = state.bets.filter((bet) => !bet.settled);
  const wins = settled.filter((bet) => bet.won);
  const hitRate = settled.length ? wins.length / settled.length : 0;
  const pnl = settled.reduce((sum, bet) => sum + (bet.won ? bet.payout - bet.stake : -bet.stake), 0);

  setText("betCount", formatNumber(totalBets));
  setText("betHitRate", percent(hitRate));
  setText("betPnL", currency(pnl));
  setText("openBetsCount", formatNumber(open.length));

  const history = document.getElementById("betsHistory");
  if (!state.bets.length) {
    history.innerHTML = `<div class="sim-placeholder">Todavía no hay apuestas guardadas.</div>`;
    return;
  }

  history.innerHTML = state.bets.slice(0, 8).map((bet) => {
    const statusClass = !bet.settled ? "pending" : bet.won ? "won" : "lost";
    const statusLabel = !bet.settled ? "Open" : bet.won ? "Ganada" : "Perdida";
    return `
      <article class="bet-history-item ${statusClass}">
        <strong>${escapeHtml(bet.home_team)} vs ${escapeHtml(bet.away_team)}</strong><br>
        Selección: ${escapeHtml(bet.selected_label)} · Stake: ${currency(bet.stake)} · Cuota: ${formatOdd(bet.odds)}<br>
        Estado: ${statusLabel} ${bet.settled ? `· Resultado real: ${escapeHtml(bet.actual_result)}` : ""}
      </article>
    `;
  }).join("");
}

function loadStoredBets() {
  try {
    const raw = window.localStorage.getItem(BET_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("No se pudieron leer las apuestas guardadas.", error);
    return [];
  }
}

function persistBets() {
  try {
    window.localStorage.setItem(BET_STORAGE_KEY, JSON.stringify(state.bets));
  } catch (error) {
    console.warn("No se pudieron guardar las apuestas.", error);
  }
}

function clearBetsHistory() {
  state.bets = [];
  persistBets();
  renderBetTracking();
  setText("betHelperText", "Historial de apuestas borrado.");
}

function simulateMatch() {
  const prediction = state.currentPrediction;
  if (!prediction) {
    return;
  }

  const outcome = pickOutcome(prediction);
  const homeStats = getTeamStats(prediction.home_team);
  const awayStats = getTeamStats(prediction.away_team);

  const expectedHomeGoals = expectedGoals(prediction.home_win_prob, homeStats?.goals_per_match || 1.4, true);
  const expectedAwayGoals = expectedGoals(prediction.away_win_prob, awayStats?.goals_per_match || 1.2, false);

  let homeGoals = sampleGoals(expectedHomeGoals);
  let awayGoals = sampleGoals(expectedAwayGoals);

  if (outcome === "H" && homeGoals <= awayGoals) {
    homeGoals = awayGoals + 1;
  } else if (outcome === "A" && awayGoals <= homeGoals) {
    awayGoals = homeGoals + 1;
  } else if (outcome === "D") {
    const drawGoals = Math.round((homeGoals + awayGoals) / 2);
    homeGoals = drawGoals;
    awayGoals = drawGoals;
  }

  const events = generateSimulationEvents(prediction.home_team, prediction.away_team, homeGoals, awayGoals);
  state.lastSimulation = {
    outcome,
    homeGoals,
    awayGoals,
    events,
  };

  setText("simHomeScore", String(homeGoals));
  setText("simAwayScore", String(awayGoals));
  setText("projectedLabel", outcome === "H" ? `+3 ${prediction.home_team}` : outcome === "A" ? `+3 ${prediction.away_team}` : "Empate simulado");

  const eventsContainer = document.getElementById("simEvents");
  eventsContainer.innerHTML = events.map((event) => `
    <div class="sim-event"><strong>${event.minute}'</strong> ${escapeHtml(event.text)}</div>
  `).join("");

  renderProjectedTable();
}

function resetSimulationPanel() {
  setText("simHomeScore", "0");
  setText("simAwayScore", "0");
  setText("projectedLabel", "Sin simulación");
  document.getElementById("simEvents").innerHTML =
    `<div class="sim-placeholder">Ejecuta una simulación para ver goles y eventos del partido.</div>`;
}

function pickOutcome(prediction) {
  const r = Math.random();
  const h = sanitizeProb(prediction.home_win_prob);
  const d = sanitizeProb(prediction.draw_prob);
  if (r < h) {
    return "H";
  }
  if (r < h + d) {
    return "D";
  }
  return "A";
}

function expectedGoals(prob, goalsPerMatch, isHome) {
  const homeBoost = isHome ? 0.24 : 0;
  return 0.45 + prob * 2.2 + goalsPerMatch * 0.35 + homeBoost;
}

function sampleGoals(lambda) {
  const capped = Math.max(0.2, Math.min(3.8, lambda));
  const rand = Math.random();
  if (rand < 0.16 / capped) return 0;
  if (rand < 0.42) return 1;
  if (rand < 0.71) return 2;
  if (rand < 0.88) return 3;
  if (rand < 0.96) return 4;
  return 5;
}

function generateSimulationEvents(homeTeam, awayTeam, homeGoals, awayGoals) {
  const homeScorers = buildScorerPool(homeTeam);
  const awayScorers = buildScorerPool(awayTeam);
  const events = [];

  for (let index = 0; index < homeGoals; index += 1) {
    events.push({
      minute: randomMinute(index, homeGoals),
      text: `${pickRandom(homeScorers)} marca para ${homeTeam}.`,
    });
  }

  for (let index = 0; index < awayGoals; index += 1) {
    events.push({
      minute: randomMinute(index, awayGoals),
      text: `${pickRandom(awayScorers)} marca para ${awayTeam}.`,
    });
  }

  if (!events.length) {
    return [{ minute: 90, text: "Partido muy táctico. El modelo simula un duelo sin goles." }];
  }

  return events.sort((a, b) => a.minute - b.minute);
}

function buildScorerPool(teamName) {
  const shots = state.data.shots
    .filter((shot) => normalizeTeam(shot.team_name) === normalizeTeam(teamName))
    .sort((a, b) => b.xg_prob - a.xg_prob)
    .slice(0, 12)
    .map((shot) => shot.player_name)
    .filter(Boolean);

  return shots.length ? shots : [teamName];
}

function randomMinute(index, total) {
  const base = Math.round(((index + 1) * 90) / Math.max(1, total + 1));
  return Math.max(1, Math.min(90, base + Math.floor(Math.random() * 18) - 9));
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function renderInsights(prediction) {
  const homeStats = getTeamStats(prediction.home_team);
  const awayStats = getTeamStats(prediction.away_team);
  const insights = [];

  insights.push({
    title: "Favoritismo base",
    text:
      prediction.home_win_prob >= prediction.away_win_prob
        ? `${prediction.home_team} parte arriba por probabilidad local y sesgo de localía.`
        : `${prediction.away_team} resiste incluso fuera de casa por su probabilidad de victoria visitante.`,
  });

  if (homeStats && awayStats) {
    const attackDiff = homeStats.goals - awayStats.goals;
    const defenseDiff = awayStats.conceded - homeStats.conceded;

    insights.push({
      title: "Ataque",
      text:
        attackDiff >= 0
          ? `${prediction.home_team} llega con mejor producción ofensiva: ${homeStats.goals} goles contra ${awayStats.goals}.`
          : `${prediction.away_team} tiene más gol acumulado: ${awayStats.goals} contra ${homeStats.goals}.`,
    });

    insights.push({
      title: "Defensa",
      text:
        defenseDiff >= 0
          ? `${prediction.home_team} concede menos y eso mejora la proyección del modelo.`
          : `${prediction.away_team} ha protegido mejor su arco y eso reduce el edge local.`,
    });

    insights.push({
      title: "Momentum",
      text: `Ranking ofensivo actual: ${prediction.home_team} #${homeStats.rank}, ${prediction.away_team} #${awayStats.rank}.`,
    });
  } else {
    insights.push({
      title: "Fallback",
      text: "El partido no existe exacto en la base y se estimó usando promedios del comportamiento de ambos equipos.",
    });
  }

  const container = document.getElementById("insightsList");
  container.innerHTML = insights.map((item) => `
    <div class="insight-item"><strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(item.text)}</div>
  `).join("");
}

function renderProjectedTable() {
  const homeTeam = state.currentPrediction?.home_team;
  const awayTeam = state.currentPrediction?.away_team;
  const rows = state.data.teamStats
    .map((item) => ({ ...item }))
    .sort((a, b) => b.points - a.points || b.goal_diff - a.goal_diff || b.goals - a.goals);

  if (state.lastSimulation && homeTeam && awayTeam) {
    const homeRow = rows.find((row) => normalizeTeam(row.team) === normalizeTeam(homeTeam));
    const awayRow = rows.find((row) => normalizeTeam(row.team) === normalizeTeam(awayTeam));
    if (homeRow && awayRow) {
      homeRow.goal_diff += state.lastSimulation.homeGoals - state.lastSimulation.awayGoals;
      awayRow.goal_diff += state.lastSimulation.awayGoals - state.lastSimulation.homeGoals;
      if (state.lastSimulation.outcome === "H") {
        homeRow.points += 3;
      } else if (state.lastSimulation.outcome === "A") {
        awayRow.points += 3;
      } else {
        homeRow.points += 1;
        awayRow.points += 1;
      }
    }
    rows.sort((a, b) => b.points - a.points || b.goal_diff - a.goal_diff || b.goals - a.goals);
  }

  const focus = rows.filter((row) =>
    state.currentPrediction
      ? [state.currentPrediction.home_team, state.currentPrediction.away_team].some(
          (team) => normalizeTeam(team) === normalizeTeam(row.team),
        )
      : false,
  );
  const topRows = [...focus, ...rows.slice(0, 4)].filter(
    (row, index, array) => array.findIndex((item) => normalizeTeam(item.team) === normalizeTeam(row.team)) === index,
  ).slice(0, 4);

  document.getElementById("projectedTableBody").innerHTML = topRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.team)}</td>
      <td>${row.points}</td>
      <td>${row.goal_diff}</td>
    </tr>
  `).join("");
}

function renderMatchList(searchTerm) {
  const container = document.getElementById("matchesList");
  const query = (searchTerm || "").trim().toLowerCase();
  const filtered = state.data.predictions.filter((item) => {
    if (!query) return true;
    return item.home_team.toLowerCase().includes(query) || item.away_team.toLowerCase().includes(query);
  });

  setText("listCountTag", `${filtered.length} registros`);
  container.innerHTML = filtered.slice(0, 120).map((item) => {
    const key = `${normalizeTeam(item.home_team)}__${normalizeTeam(item.away_team)}`;
    return `
      <button type="button" class="match-item" data-key="${key}" data-home="${escapeAttribute(item.home_team)}" data-away="${escapeAttribute(item.away_team)}">
        <div class="match-head">
          <strong>${escapeHtml(item.home_team)} vs ${escapeHtml(item.away_team)}</strong>
          <span class="card-tag">${item.predicted_result}</span>
        </div>
        <div class="match-meta">
          <span>${escapeHtml(item.date)}</span>
          <span>Real: ${item.home_goals}-${item.away_goals}</span>
        </div>
        <div class="match-probs">
          <span class="prob-chip h">H ${percent(item.home_win_prob)}</span>
          <span class="prob-chip d">D ${percent(item.draw_prob)}</span>
          <span class="prob-chip a">A ${percent(item.away_win_prob)}</span>
        </div>
      </button>
    `;
  }).join("");

  container.querySelectorAll(".match-item").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("homeSelect").value = button.dataset.home;
      document.getElementById("awaySelect").value = button.dataset.away;
      updatePredictor();
    });
  });

  highlightMatchRow();
}

function highlightMatchRow() {
  document.querySelectorAll(".match-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.key === state.selectedMatchKey);
  });
}

function initShotMap() {
  const teamSelect = document.getElementById("teamFilter");
  const teams = [...new Set(state.data.shots.map((shot) => shot.team_name))].sort((a, b) => a.localeCompare(b));
  teamSelect.add(new Option("Todos los equipos", ""));
  teams.forEach((team) => teamSelect.add(new Option(team, team)));

  document.querySelectorAll("[data-shot-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-shot-filter]").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      state.shotFilter = button.dataset.shotFilter;
      renderShots();
    });
  });

  teamSelect.addEventListener("change", (event) => {
    state.teamFilter = event.target.value;
    renderShots();
  });

  document.getElementById("xgFilter").addEventListener("change", (event) => {
    state.xgFilter = Number(event.target.value) || 0;
    renderShots();
  });

  renderShots();
}

function renderShots() {
  const layer = document.getElementById("shotsLayer");
  const tooltip = document.getElementById("shotTooltip");
  layer.innerHTML = "";

  let shots = state.data.shots.filter((shot) => {
    if (state.shotFilter === "goal" && !shot.is_goal) return false;
    if (state.shotFilter === "nogol" && shot.is_goal) return false;
    if (state.teamFilter && shot.team_name !== state.teamFilter) return false;
    if (shot.xg_prob < state.xgFilter) return false;
    return true;
  });

  shots = shots.slice(0, 850);
  setText("visibleShotsCount", `${formatNumber(shots.length)} tiros visibles`);

  shots.forEach((shot) => {
    const { svgX, svgY } = coordToSvg(shot.x, shot.y);
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", svgX);
    circle.setAttribute("cy", svgY);
    circle.setAttribute("r", Math.max(3, Math.min(10, 2.8 + shot.xg_prob * 16)));
    circle.setAttribute("fill", shotColor(shot));
    circle.setAttribute("fill-opacity", shot.is_goal ? "0.92" : "0.62");
    circle.setAttribute("stroke", shot.is_goal ? "#bfffd4" : "rgba(255,255,255,0.14)");
    circle.setAttribute("stroke-width", shot.is_goal ? "1.5" : "0.7");
    if (shot.is_goal) {
      circle.setAttribute("filter", "url(#shotGlow)");
    }
    circle.style.cursor = "pointer";

    circle.addEventListener("mouseenter", () => {
      tooltip.innerHTML = `<strong>${escapeHtml(shot.player_name || "Jugador")}</strong>${escapeHtml(
        shot.team_name,
      )}<br>xG: ${shot.xg_prob.toFixed(3)}<br>Min: ${shot.minute}<br>Zona: ${escapeHtml(shot.shot_zone)}<br>${
        shot.is_goal ? "Gol" : "No gol"
      }`;
      tooltip.classList.add("show");
    });
    circle.addEventListener("mousemove", (event) => {
      tooltip.style.left = `${event.clientX + 12}px`;
      tooltip.style.top = `${event.clientY - 16}px`;
    });
    circle.addEventListener("mouseleave", () => tooltip.classList.remove("show"));

    layer.appendChild(circle);
  });
}

function initPerformance() {
  const xg = state.data.performance.xg;
  const match = state.data.performance.match_predictor;

  renderMetricList("xgMetricList", [
    { label: "Accuracy", value: `${xg.accuracy.toFixed(1)}%`, tone: "good" },
    { label: "Precision", value: `${xg.precision.toFixed(2)}%`, tone: "good" },
    { label: "Recall", value: `${xg.recall.toFixed(2)}%`, tone: "warn" },
    { label: "F1 Score", value: `${xg.f1.toFixed(2)}%`, tone: "warn" },
    { label: "Baseline", value: `${xg.baseline.toFixed(2)}%`, tone: "neutral" },
  ]);

  renderMetricList("matchMetricList", [
    { label: "Accuracy CV", value: `${match.accuracy.toFixed(1)}%`, tone: "good" },
    { label: "Dispersión", value: `± ${match.dispersion.toFixed(1)}%`, tone: "neutral" },
    { label: "RMSE goles", value: match.rmse_goals.toFixed(3), tone: "neutral" },
    { label: "Benchmark", value: `${match.benchmark.toFixed(1)}%`, tone: "warn" },
    { label: "Observed accuracy", value: `${match.observed_accuracy.toFixed(1)}%`, tone: "neutral" },
  ]);

  setText("xgAucTag", `AUC ${xg.auc.toFixed(1)}%`);
  setText("edgeTag", `${match.edge >= 0 ? "+" : ""}${match.edge.toFixed(1)} pts`);
  setText("ourBenchmarkValue", `${match.accuracy.toFixed(1)}%`);
  setText("benchmarkValue", `${match.benchmark.toFixed(1)}%`);
  setWidth("ourBenchmarkBar", match.accuracy);
  setWidth("benchmarkBar", match.benchmark);
  createRocChart(xg.auc);
}

function initEDA() {
  const results = state.data.eda.results;
  const teamStats = state.data.teamStats;
  const totalGoals = teamStats.reduce((sum, item) => sum + item.goals, 0);
  const topAttack = teamStats[0];

  setText("edaMatches", formatNumber(state.data.meta.match_count));
  setText("edaGoals", formatNumber(totalGoals));
  setText("edaGoalsRate", `${(totalGoals / state.data.meta.match_count).toFixed(2)} por partido`);
  setText("edaHomeWins", percent(results.home_wins / state.data.meta.match_count));
  setText("edaTopAttack", topAttack?.team || "N/A");

  const awayWinsPct = percent(results.away_wins / state.data.meta.match_count);
  const drawsPct = percent(results.draws / state.data.meta.match_count);
  setText("resultsTag", `H ${percent(results.home_wins / state.data.meta.match_count)} / D ${drawsPct} / A ${awayWinsPct}`);

  createResultsChart(results);
  createGoalsChart(state.data.eda.goals_distribution);
  createZoneChart(state.data.eda.zone_conversion);
  createTeamsChart(teamStats.slice(0, 10));
  renderTeamTable(teamStats.slice(0, 8));
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((node) => node.classList.remove("active"));
      document.querySelectorAll(".section").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(`${button.dataset.tab}-section`).classList.add("active");
    });
  });
}

function renderMetricList(targetId, rows) {
  document.getElementById(targetId).innerHTML = rows
    .map(
      (row) => `
        <div class="metric-row">
          <span>${row.label}</span>
          <strong class="metric-${row.tone}">${row.value}</strong>
        </div>
      `,
    )
    .join("");
}

function renderTeamTable(rows) {
  document.getElementById("teamTableBody").innerHTML = rows
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.team)}</td>
          <td>${item.goals}</td>
          <td>${item.conceded}</td>
          <td>${item.goal_diff}</td>
          <td>${item.points}</td>
          <td>${item.goals_per_match.toFixed(2)}</td>
        </tr>
      `,
    )
    .join("");
}

function createRocChart(auc) {
  const fpr = [0, 0.05, 0.1, 0.16, 0.24, 0.35, 0.5, 0.65, 0.8, 1];
  const tpr = [0, 0.21, 0.38, 0.54, 0.67, 0.76, 0.85, 0.91, 0.96, 1];
  createChart("rocChart", {
    type: "line",
    data: {
      datasets: [
        {
          label: `Modelo xG (AUC ${auc.toFixed(1)}%)`,
          data: tpr.map((y, index) => ({ x: fpr[index], y })),
          borderColor: "#59ff9a",
          backgroundColor: "rgba(89,255,154,0.12)",
          fill: true,
          pointRadius: 0,
          tension: 0.35,
          borderWidth: 2,
        },
        {
          label: "Azar",
          data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
          borderColor: "rgba(255,255,255,0.26)",
          borderDash: [6, 5],
          pointRadius: 0,
          borderWidth: 1,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
      scales: { x: chartAxis("FPR", 0, 1), y: chartAxis("TPR", 0, 1) },
    },
  });
}

function createResultsChart(results) {
  createChart("resultsChart", {
    type: "doughnut",
    data: {
      labels: ["Victoria local", "Empate", "Victoria visitante"],
      datasets: [
        {
          data: [results.home_wins, results.draws, results.away_wins],
          backgroundColor: ["rgba(82,182,255,0.82)", "rgba(201,201,201,0.6)", "rgba(255,202,82,0.82)"],
          borderColor: ["#52b6ff", "#c9c9c9", "#ffca52"],
          borderWidth: 2,
        },
      ],
    },
    options: { ...baseChartOptions(), cutout: "62%" },
  });
}

function createGoalsChart(distribution) {
  createChart("goalsChart", {
    type: "bar",
    data: {
      labels: distribution.map((item) => `${item.goals}`),
      datasets: [
        {
          label: "Partidos",
          data: distribution.map((item) => item.count),
          backgroundColor: distribution.map((item) =>
            item.goals <= 2 ? "rgba(89,255,154,0.8)" : item.goals <= 4 ? "rgba(89,255,154,0.55)" : "rgba(89,255,154,0.28)",
          ),
          borderRadius: 8,
        },
      ],
    },
    options: { ...baseChartOptions(), scales: { x: chartAxis("Goles"), y: chartAxis("Partidos", 0) } },
  });
}

function createZoneChart(zoneConversion) {
  const topZones = zoneConversion.filter((item) => item.zone !== "Other").slice(0, 6);
  createChart("zoneChart", {
    type: "bar",
    data: {
      labels: topZones.map((item) => item.zone),
      datasets: [
        {
          label: "Shots",
          data: topZones.map((item) => item.shots_n),
          backgroundColor: "rgba(82,182,255,0.44)",
          borderColor: "#52b6ff",
          borderWidth: 1,
          yAxisID: "y",
          borderRadius: 8,
        },
        {
          label: "Conversión %",
          data: topZones.map((item) => item.conversion),
          type: "line",
          borderColor: "#59ff9a",
          backgroundColor: "#59ff9a",
          yAxisID: "y1",
          tension: 0.35,
          pointRadius: 4,
          borderWidth: 2,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
      scales: {
        x: chartAxis("Zona"),
        y: chartAxis("Shots", 0),
        y1: {
          position: "right",
          min: 0,
          grid: { drawOnChartArea: false, color: "rgba(255,255,255,0.04)" },
          ticks: { color: "#59ff9a" },
          title: { display: true, text: "Conversión %", color: "#59ff9a" },
        },
      },
    },
  });
}

function createTeamsChart(teamStats) {
  createChart("teamsChart", {
    type: "bar",
    data: {
      labels: teamStats.map((item) => item.team),
      datasets: [
        {
          label: "Goles",
          data: teamStats.map((item) => item.goals),
          backgroundColor: teamStats.map((_, index) =>
            index < 2 ? "rgba(255,202,82,0.82)" : "rgba(89,255,154,0.55)",
          ),
          borderRadius: 8,
        },
      ],
    },
    options: {
      ...baseChartOptions(),
      indexAxis: "y",
      scales: { x: chartAxis("Goles", 0), y: chartAxis("Equipo") },
    },
  });
}

function createChart(canvasId, config) {
  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
  }
  const context = document.getElementById(canvasId).getContext("2d");
  state.charts[canvasId] = new Chart(context, config);
}

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#8fb49a", font: { family: "Barlow", size: 11 } } },
      tooltip: {
        backgroundColor: "rgba(9,17,13,0.96)",
        borderColor: "rgba(89,255,154,0.2)",
        borderWidth: 1,
        titleColor: "#59ff9a",
        bodyColor: "#edf8ef",
      },
    },
  };
}

function chartAxis(label, min, max) {
  const axis = {
    grid: { color: "rgba(255,255,255,0.05)" },
    ticks: { color: "#8fb49a", font: { family: "Barlow", size: 10 } },
    title: { display: true, text: label, color: "#8fb49a" },
  };
  if (typeof min === "number") axis.min = min;
  if (typeof max === "number") axis.max = max;
  return axis;
}

function coordToSvg(x, y) {
  return { svgX: 10 + (x / 100) * 760, svgY: 10 + (y / 100) * 500 };
}

function shotColor(shot) {
  if (shot.is_goal) return "#59ff9a";
  if (shot.xg_prob >= 0.35) return "#ff6b64";
  if (shot.xg_prob >= 0.1) return "#ffca52";
  return "rgba(255,255,255,0.34)";
}

function normalizeTeam(name) {
  const raw = String(name || "").trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  return ALIASES[raw] || raw;
}

function sanitizeProb(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return number;
}

function sanitizeStake(value) {
  const stake = Number(value);
  if (!Number.isFinite(stake) || stake <= 0) return 0;
  return stake;
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function percent(value) {
  return `${(sanitizeProb(value) * 100).toFixed(1)}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-CO").format(value);
}

function currency(value) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

function toOdds(probability) {
  const safe = Math.max(0.03, sanitizeProb(probability));
  return 1 / safe;
}

function formatOdd(value) {
  return Number(value).toFixed(2);
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function setWidth(id, value) {
  const node = document.getElementById(id);
  if (node) node.style.width = `${Math.max(0, Math.min(100, value))}%`;
}

function setBarState(id, probability, value, maxProb, minProb) {
  const node = document.getElementById(id);
  if (!node) return;
  node.classList.remove("favorite-bar", "mid-bar", "low-bar");
  const tone = probability === maxProb ? "favorite-bar" : probability === minProb ? "low-bar" : "mid-bar";
  node.classList.add(tone);
  setWidth(id, value * 100);
}

function setOutcomeState(id, probability, maxProb, minProb) {
  const node = document.getElementById(id);
  if (!node) return;
  node.classList.remove("favorite", "underdog");
  if (probability === maxProb) node.classList.add("favorite");
  if (probability === minProb) node.classList.add("underdog");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
