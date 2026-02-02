var config = {
    betPercentage: { label: 'Porcentaje de apuesta base', value: 0.125, type: 'number' },
    payout: { label: 'Payout normal', value: 1.9, type: 'number' },
    lossMultiplier: { label: 'Multiplicador de pérdida', value: 2, type: 'number' },
    protectedPercentage: { label: '% de saldo a proteger (ej: 90)', value: 90, type: 'number' },
    winGoalLimit: { label: 'Meta de ganancia (% del saldo)', value: 50, type: 'number' },
    lossStopLimit: { label: 'Stop Loss (Saldo / X)', value: 10, type: 'number' },
    pauseTitle: { label: 'Configuración de Pausa', type: 'title' },
    gamesBeforePause: { label: 'Pausar cada X juegos', value: 100, type: 'number' },
    roundsToSkip: { label: 'Rondas de pausa (10 min ≈ 60)', value: 60, type: 'number' },
    loggingLevel: { label: 'logging level', value: 'compact', type: 'radio', options: [{ value: 'info', label: 'info' }, { value: 'compact', label: 'compact' }] }
};

var totalWagers = 0, netProfit = 0, totalWins = 0, totalLoses = 0, loseStreak = 0, numberOfRoundsToSkip = 0, totalNumberOfGames = 0;
var originalBalance = currency.amount;
var runningBalance = currency.amount;
var peakBalance = currency.amount;
var consequetiveLostBets = 0;
var currentBet = GetNewBaseBet();
var waitingSuccessCount = 0;
var safeBetPayout = 1.01; // Payout inicial del Safe Bet

function main() {
    game.onBet = function () {
        if (numberOfRoundsToSkip > 0) {
            numberOfRoundsToSkip--;
            log.info('En pausa: quedan ' + numberOfRoundsToSkip + ' rondas.');
            return;
        }

        if (totalNumberOfGames == 0) currentBet = GetNewBaseBet();

        // 1. PROTECCIÓN DE SALDO (Respecto al inicial)
        var hardLimit = originalBalance * (config.protectedPercentage.value / 100);
        if (runningBalance < hardLimit) {
            log.error('STOP: Protección alcanzada. Saldo actual: ' + runningBalance.toFixed(8));
            game.stop();
            return;
        }

        // 2. MAX DRAWDOWN (Respecto al punto más alto)
        var currentDrawdown = (peakBalance - runningBalance) / peakBalance;
        if (currentDrawdown >= 0.10) { // Si cae 10% desde el pico
            log.error('MAX DRAWDOWN: Caída del 10% desde el máximo. Parando...');
            game.stop();
            return;
        }

        var isWaiting = (loseStreak >= 3);
        var targetPayout = isWaiting ? safeBetPayout : config.payout.value;
        var betToPlace = isWaiting ? currency.minAmount : currentBet;

        if (isWaiting) {
            log.info('Safe Bet: ' + betToPlace.toFixed(8) + ' a ' + targetPayout.toFixed(2) + 'x (Crashes: ' + waitingSuccessCount + '/2)');
        } else {
            log.info('Apuesta Normal: ' + betToPlace.toFixed(8));
        }

        game.bet(betToPlace, targetPayout).then(function (payout) {
            var lastCrashRaw = game.history[0].crash;
            var lastCrash = lastCrashRaw > 100 ? lastCrashRaw / 100 : lastCrashRaw;

            if (isWaiting) {
                if (lastCrash >= 2.0) {
                    waitingSuccessCount++;
                    log.success('Crash > 2.0x detectado! (' + waitingSuccessCount + '/2)');
                    safeBetPayout = 1.01; // Resetear multiplicador de safe bet al haber éxito
                    
                    if (waitingSuccessCount >= 2) {
                        log.success('Doble confirmación. Reanudando estrategia.');
                        loseStreak = 0;
                        waitingSuccessCount = 0;
                    }
                } else {
                    waitingSuccessCount = 0;
                    safeBetPayout *= 2; // AUMENTA x2 el multiplicador del safe bet si falla
                    log.error('Crash bajo. Siguiente Safe Payout: ' + safeBetPayout.toFixed(2) + 'x');
                }
                return;
            }

            runningBalance -= betToPlace;
            totalNumberOfGames++;

            if (payout > 1) {
                var netWin = (betToPlace * config.payout.value) - betToPlace;
                runningBalance += (netWin + betToPlace);
                netProfit += netWin;
                consequetiveLostBets = 0;
                loseStreak = 0;
                LogSummary('true', betToPlace);
                currentBet = GetNewBaseBet();
            } else {
                netProfit -= betToPlace;
                loseStreak++;
                consequetiveLostBets += betToPlace;
                LogSummary('false', betToPlace);
                currentBet = currentBet * config.lossMultiplier.value;
            }

            // Actualizar Pico de Saldo
            if (runningBalance > peakBalance) peakBalance = runningBalance;

            // Pausa programada
            if (totalNumberOfGames % config.gamesBeforePause.value === 0) {
                numberOfRoundsToSkip = config.roundsToSkip.value;
            }

            // Metas de parada
            var winGoal = originalBalance * (config.winGoalLimit.value / 100);
            if (netProfit >= winGoal) {
                log.success('META ALCANZADA: +' + netProfit.toFixed(8));
                game.stop();
            }

            var lossStop = originalBalance / config.lossStopLimit.value;
            if (consequetiveLostBets >= lossStop) {
                log.error('STOP LOSS: Límite de racha alcanzado.');
                game.stop();
            }
        });
    };
}

function GetNewBaseBet() {
    var r = runningBalance * (config.betPercentage.value / 100);
    return r < currency.minAmount ? currency.minAmount : r;
}

function LogSummary(w, b) {
    if (config.loggingLevel.value == 'compact') {
        var net = runningBalance - originalBalance;
        var msg = (w == 'true' ? 'WIN' : 'LOSS') + ' | Profit Sesión: ' + net.toFixed(8);
        w == 'true' ? log.success(msg) : log.error(msg);
    }
}
