var config = {
    betPercentage: { label: 'percentage of total coins to bet', value: 0.125, type: 'number' },
    payout: { label: 'payout', value: 1.9, type: 'number' },
    onLoseTitle: { label: 'On Lose', type: 'title' },
    onLoss: { label: '', value: 'increase', type: 'radio', options: [{ value: 'reset', label: 'Return to base bet' }, { value: 'increase', label: 'Increase bet by (loss multiplier)' }] },
    lossMultiplier: { label: 'loss multiplier', value: 2, type: 'number' },
    onWinTitle: { label: 'On Win', type: 'title' },
    onWin: { label: '', value: 'reset', type: 'radio', options: [{ value: 'reset', label: 'Return to base bet' }, { value: 'increase', label: 'Increase bet by (win multiplier)' }] },
    winMultiplier: { label: 'win multiplier', value: 1, type: 'number' },
    pauseTitle: { label: 'Auto Pause Settings', type: 'title' },
    gamesBeforePause: { label: 'Pause every X games', value: 100, type: 'number' },
    roundsToSkip: { label: 'Rounds to skip (60 ≈ 10 min)', value: 60, type: 'number' },
    otherConditionsTitle: { label: 'Other Stopping Conditions', type: 'title' },
    winGoalAmount: { label: 'Stop once you have made this much', value: currency.amount / 2, type: 'number' },
    lossStopAmount: { label: 'Stop betting after losing this much without a win.', value: currency.amount / 10, type: 'number' },
    loggingLevel: { label: 'logging level', value: 'compact', type: 'radio', options: [{ value: 'info', label: 'info' }, { value: 'compact', label: 'compact' }, { value: 'verbose', label: 'verbose' }] }
};

var totalWagers = 0, netProfit = 0, totalWins = 0, totalLoses = 0, longestWinStreak = 0, longestLoseStreak = 0, currentStreak = 0, loseStreak = 0, numberOfRoundsToSkip = 0, totalNumberOfGames = 0, originalbalance = currency.amount, runningbalance = currency.amount, consequetiveLostBets = 0, currentBet = GetNewBaseBet();

// Contador para las rondas de recuperación
var waitingSuccessCount = 0;

function main() {
    game.onBet = function () {
        if (numberOfRoundsToSkip > 0) {
            numberOfRoundsToSkip--;
            log.info('System Pause: ' + numberOfRoundsToSkip + ' rounds left.');
            return;
        }

        if (totalNumberOfGames == 0) currentBet = GetNewBaseBet();
        
        var isWaiting = (loseStreak >= 3);
        var targetPayout = isWaiting ? 1.01 : config.payout.value;
        var betToPlace = isWaiting ? currency.minAmount : currentBet;

        if (isWaiting) log.info('Safe Betting. Progress: ' + waitingSuccessCount + '/2 crashes > 2.0x');
        else log.info('Normal Bet: ' + betToPlace.toFixed(8));

        game.bet(betToPlace, targetPayout).then(function (payout) {
            var lastCrash = game.history[0].crash; 
            
            if (isWaiting) {
                if (lastCrash > 200) {
                    waitingSuccessCount++;
                    log.success('Crash was ' + (lastCrash/100).toFixed(2) + '! (' + waitingSuccessCount + '/2)');
                    
                    if (waitingSuccessCount >= 2) {
                        log.success('Double crash detected. Resuming strategy.');
                        loseStreak = 0; // Reseteamos racha para volver a normal
                        waitingSuccessCount = 0; // Reseteamos contador de espera
                    }
                } else {
                    // Si sale un crash menor a 2.0x, reiniciamos el contador de 2 rondas seguidas
                    if (waitingSuccessCount > 0) {
                        log.error('Crash below 2.0x. Resetting wait counter.');
                        waitingSuccessCount = 0;
                    }
                }
                return;
            }

            runningbalance -= betToPlace; 
            totalWagers += betToPlace; 
            totalNumberOfGames++;

            if (payout > 1) {
                var netwin = betToPlace * config.payout.value - betToPlace;
                consequetiveLostBets = 0; netProfit += netwin; runningbalance += netwin + betToPlace;
                loseStreak = 0; currentStreak++; totalWins++;
                LogSummary('true', betToPlace);
                currentBet = (config.onWin.value === 'reset') ? GetNewBaseBet() : currentBet * config.winMultiplier.value;
            } else {
                netProfit -= betToPlace; loseStreak++; currentStreak = 0; totalLoses++; 
                consequetiveLostBets += betToPlace;
                LogSummary('false', betToPlace);
                currentBet = (config.onLoss.value == 'reset') ? GetNewBaseBet() : currentBet * config.lossMultiplier.value;
            }

            if (totalNumberOfGames % config.gamesBeforePause.value === 0) {
                log.success('Reached ' + totalNumberOfGames + ' games. Pausing...');
                numberOfRoundsToSkip = config.roundsToSkip.value;
            }

            if (currentStreak > longestWinStreak) longestWinStreak = currentStreak;
            if (loseStreak > longestLoseStreak) longestLoseStreak = loseStreak;
            recordStats();
            
            if (config.winGoalAmount.value != 0 && netProfit > config.winGoalAmount.value) game.stop();
            if (config.lossStopAmount.value != 0 && consequetiveLostBets > config.lossStopAmount.value) game.stop();
            if (config.lossStopAmount.value != 0 && runningbalance < originalbalance * 0.9) game.stop();
        });
    };
}

function recordStats() {
    if (config.loggingLevel.value != 'compact') {
        LogMessage('Net: ' + netProfit.toFixed(8) + ' | Wins: ' + totalWins + ' | Loses: ' + totalLoses, 'info');
    }
}

function GetNewBaseBet() {
    var r = runningbalance * (config.betPercentage.value / 100);
    return r < currency.minAmount ? currency.minAmount : r;
}

function LogSummary(w, b) {
    if (config.loggingLevel.value == 'compact') {
        var net = runningbalance - originalbalance;
        w == 'true' ? log.success('WIN | Profit: ' + net.toFixed(8)) : log.error('LOSS | Profit: ' + net.toFixed(8));
    }
}

function LogMessage(m, l) {
    var v = config.loggingLevel.value;
    if (v == 'verbose') { l == 'success' ? log.success(m) : log.info(m); }
    else if (v == 'info' && (l == 'success' || l == 'failure')) { l == 'success' ? log.success(m) : log.error(m); }
}
