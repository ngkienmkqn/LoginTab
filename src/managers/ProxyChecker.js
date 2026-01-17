const net = require('net');

class ProxyChecker {
    /**
     * Check proxy health by testing TCP connectivity and response time
     * @param {Object} proxy - {type, host, port, user, pass}
     * @returns {Promise<number>} Health score: 0=offline, 1=very slow, 2=slow, 3=good, 4=excellent
     */
    async checkProxyHealth(proxy) {
        if (!proxy || !proxy.host || !proxy.port) {
            return 0;
        }

        const startTime = Date.now();

        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(8000); // 8 second timeout

            socket.on('connect', () => {
                const responseTime = Date.now() - startTime;
                socket.destroy();

                // Score based on response time
                if (responseTime < 1000) {
                    resolve(4); // Excellent <1s
                } else if (responseTime < 3000) {
                    resolve(3); // Good 1-3s
                } else if (responseTime < 5000) {
                    resolve(2); // Slow 3-5s
                } else {
                    resolve(1); // Very slow >5s
                }
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve(0); // Offline/unreachable
            });

            socket.on('error', () => {
                socket.destroy();
                resolve(0); // Offline/unreachable
            });

            try {
                socket.connect(proxy.port, proxy.host);
            } catch (err) {
                resolve(0);
            }
        });
    }

    /**
     * Get health label from score
     */
    getHealthLabel(score) {
        const labels = ['Offline', 'Very Slow', 'Slow', 'Good', 'Excellent'];
        return labels[score] || 'Unknown';
    }

    /**
     * Get health color from score
     */
    getHealthColor(score) {
        const colors = ['#e74c3c', '#e67e22', '#f39c12', '#2ecc71', '#27ae60'];
        return colors[score] || '#95a5a6';
    }
}

module.exports = new ProxyChecker();
