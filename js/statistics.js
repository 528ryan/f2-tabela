// Statistics and analytics module
export class StatisticsController {
    constructor(state) {
        this.state = state;
        this.charts = new Map();
    }

    // Calculate driver statistics
    calculateDriverStats(driverId) {
        const results = this.state.results;
        const races = this.state.races;
        
        let stats = {
            totalPoints: 0,
            wins: 0,
            podiums: 0,
            poles: 0,
            fastestLaps: 0,
            dnfs: 0,
            averagePosition: 0,
            bestFinish: null,
            worstFinish: null,
            raceResults: []
        };

        let totalPositions = 0;
        let finishedRaces = 0;

        races.forEach(race => {
            const raceResult = results[race.id]?.[driverId];
            if (!raceResult) return;

            // Calculate points for this race
            const racePoints = this.calculateRacePoints(raceResult, race.pointsSystem);
            stats.totalPoints += racePoints;

            // Feature race statistics
            if (raceResult.feature) {
                const position = parseInt(raceResult.feature);
                
                if (!isNaN(position)) {
                    if (position === 1) stats.wins++;
                    if (position <= 3) stats.podiums++;
                    
                    totalPositions += position;
                    finishedRaces++;
                    
                    if (stats.bestFinish === null || position < stats.bestFinish) {
                        stats.bestFinish = position;
                    }
                    if (stats.worstFinish === null || position > stats.worstFinish) {
                        stats.worstFinish = position;
                    }
                } else if (['DNF', 'DSQ', 'DNS'].includes(raceResult.feature)) {
                    stats.dnfs++;
                }
            }

            // Qualifying statistics
            if (raceResult.qualifying === 1) stats.poles++;

            // Fastest lap statistics
            if (raceResult.featureFL || raceResult.sprintFL) stats.fastestLaps++;

            // Store race result
            stats.raceResults.push({
                race: race.name,
                points: racePoints,
                qualifying: raceResult.qualifying,
                sprint: raceResult.sprint,
                feature: raceResult.feature,
                fastestLap: raceResult.featureFL || raceResult.sprintFL
            });
        });

        // Calculate average position
        if (finishedRaces > 0) {
            stats.averagePosition = (totalPositions / finishedRaces).toFixed(1);
        }

        return stats;
    }

    calculateRacePoints(result, pointsSystem) {
        let points = 0;

        // Qualifying points (pole position)
        if (result.qualifying === 1) {
            points += pointsSystem.pole || 0;
        }

        // Sprint race points
        if (result.sprint && !isNaN(parseInt(result.sprint))) {
            const sprintPos = parseInt(result.sprint);
            if (sprintPos > 0 && sprintPos <= pointsSystem.sprint.length) {
                points += pointsSystem.sprint[sprintPos - 1];
            }
        }

        // Sprint fastest lap
        if (result.sprintFL && result.sprint && parseInt(result.sprint) <= 10) {
            points += pointsSystem.fastestLap || 0;
        }

        // Feature race points
        if (result.feature && !isNaN(parseInt(result.feature))) {
            const featurePos = parseInt(result.feature);
            if (featurePos > 0 && featurePos <= pointsSystem.feature.length) {
                points += pointsSystem.feature[featurePos - 1];
            }
        }

        // Feature fastest lap
        if (result.featureFL && result.feature && parseInt(result.feature) <= 10) {
            points += pointsSystem.fastestLap || 0;
        }

        return points;
    }

    // Generate championship standings
    generateStandings() {
        if (!this.state.currentChampionship?.drivers) return [];

        const standings = this.state.currentChampionship.drivers.map(driver => {
            const stats = this.calculateDriverStats(driver.id);
            return {
                ...driver,
                ...stats,
                position: 0 // Will be set after sorting
            };
        });

        // Sort by points (descending), then by wins, then by podiums
        standings.sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (b.podiums !== a.podiums) return b.podiums - a.podiums;
            return parseFloat(a.averagePosition) - parseFloat(b.averagePosition);
        });

        // Set positions
        standings.forEach((driver, index) => {
            driver.position = index + 1;
        });

        return standings;
    }

    // Create championship evolution chart
    createChampionshipChart(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        // Destroy existing chart
        if (this.charts.has(canvasId)) {
            this.charts.get(canvasId).destroy();
        }

        const standings = this.generateStandings();
        const races = this.state.currentChampionship?.races || [];
        
        // Get top 5 drivers
        const topDrivers = standings.slice(0, 5);
        
        // Calculate cumulative points for each race
        const datasets = topDrivers.map((driver, index) => {
            const colors = ['#0d6efd', '#dc3545', '#ffc107', '#198754', '#6f42c1'];
            let cumulativePoints = 0;
            
            const data = races.map(race => {
                const raceResult = this.state.results[race.id]?.[driver.id];
                if (raceResult) {
                    cumulativePoints += this.calculateRacePoints(raceResult, race.pointsSystem);
                }
                return cumulativePoints;
            });

            return {
                label: driver.name,
                data: data,
                borderColor: colors[index],
                backgroundColor: colors[index] + '20',
                fill: false,
                tension: 0.1
            };
        });

        const chart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: races.map(race => race.name.split('(')[0].trim()),
                datasets: datasets
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Championship Evolution'
                    },
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Points'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Races'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });

        this.charts.set(canvasId, chart);
        return chart;
    }

    // Create driver performance radar chart
    createDriverRadarChart(canvasId, driverId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const stats = this.calculateDriverStats(driverId);
        const driver = this.state.currentChampionship?.drivers.find(d => d.id === driverId);
        
        if (!driver) return;

        // Normalize stats to 0-100 scale
        const maxValues = {
            points: Math.max(...this.generateStandings().map(d => d.totalPoints)),
            wins: Math.max(...this.generateStandings().map(d => d.wins)),
            podiums: Math.max(...this.generateStandings().map(d => d.podiums)),
            poles: Math.max(...this.generateStandings().map(d => d.poles)),
            fastestLaps: Math.max(...this.generateStandings().map(d => d.fastestLaps))
        };

        const normalizedStats = {
            points: maxValues.points > 0 ? (stats.totalPoints / maxValues.points) * 100 : 0,
            wins: maxValues.wins > 0 ? (stats.wins / maxValues.wins) * 100 : 0,
            podiums: maxValues.podiums > 0 ? (stats.podiums / maxValues.podiums) * 100 : 0,
            poles: maxValues.poles > 0 ? (stats.poles / maxValues.poles) * 100 : 0,
            fastestLaps: maxValues.fastestLaps > 0 ? (stats.fastestLaps / maxValues.fastestLaps) * 100 : 0,
            consistency: stats.dnfs === 0 ? 100 : Math.max(0, 100 - (stats.dnfs * 20))
        };

        const chart = new Chart(canvas, {
            type: 'radar',
            data: {
                labels: ['Points', 'Wins', 'Podiums', 'Poles', 'Fastest Laps', 'Consistency'],
                datasets: [{
                    label: driver.name,
                    data: Object.values(normalizedStats),
                    borderColor: '#0d6efd',
                    backgroundColor: 'rgba(13, 110, 253, 0.2)',
                    pointBackgroundColor: '#0d6efd',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#0d6efd'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `${driver.name} - Performance Radar`
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 20
                        }
                    }
                }
            }
        });

        this.charts.set(canvasId, chart);
        return chart;
    }

    // Generate race analysis
    analyzeRace(raceId) {
        const race = this.state.races.find(r => r.id === raceId);
        const results = this.state.results[raceId];
        
        if (!race || !results) return null;

        const analysis = {
            winner: null,
            polePosition: null,
            fastestLap: null,
            bestRecovery: { driver: null, positions: 0 },
            biggestLoser: { driver: null, positions: 0 },
            dnfs: [],
            perfectWeekend: null // Pole + Win + Fastest Lap
        };

        Object.entries(results).forEach(([driverId, result]) => {
            const driver = this.state.currentChampionship?.drivers.find(d => d.id === driverId);
            if (!driver) return;

            // Winner
            if (result.feature === 1) {
                analysis.winner = driver;
            }

            // Pole position
            if (result.qualifying === 1) {
                analysis.polePosition = driver;
            }

            // Fastest lap
            if (result.featureFL) {
                analysis.fastestLap = driver;
            }

            // Position changes
            const qualiPos = parseInt(result.qualifying);
            const featurePos = parseInt(result.feature);
            
            if (!isNaN(qualiPos) && !isNaN(featurePos)) {
                const positionChange = qualiPos - featurePos;
                
                if (positionChange > analysis.bestRecovery.positions) {
                    analysis.bestRecovery = { driver, positions: positionChange };
                }
                
                if (positionChange < analysis.biggestLoser.positions) {
                    analysis.biggestLoser = { driver, positions: Math.abs(positionChange) };
                }
            }

            // DNFs
            if (['DNF', 'DSQ', 'DNS'].includes(result.feature)) {
                analysis.dnfs.push(driver);
            }
        });

        // Perfect weekend (Pole + Win + Fastest Lap)
        if (analysis.polePosition && analysis.winner && analysis.fastestLap &&
            analysis.polePosition.id === analysis.winner.id && 
            analysis.winner.id === analysis.fastestLap.id) {
            analysis.perfectWeekend = analysis.winner;
        }

        return analysis;
    }

    // Export statistics to CSV
    exportStandings() {
        const standings = this.generateStandings();
        
        const headers = ['Position', 'Driver', 'Points', 'Wins', 'Podiums', 'Poles', 'Fastest Laps', 'DNFs', 'Average Position'];
        const rows = standings.map(driver => [
            driver.position,
            driver.name,
            driver.totalPoints,
            driver.wins,
            driver.podiums,
            driver.poles,
            driver.fastestLaps,
            driver.dnfs,
            driver.averagePosition
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.state.currentChampionship?.name || 'championship'}_standings.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    // Cleanup charts
    destroyAllCharts() {
        this.charts.forEach(chart => chart.destroy());
        this.charts.clear();
    }
}