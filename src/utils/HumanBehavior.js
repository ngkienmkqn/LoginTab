/**
 * Human Behavior Simulator
 * Adds realistic mouse movements, typing delays, and scroll patterns
 */
class HumanBehavior {
    /**
     * Type text with human-like delays and occasional typos
     */
    static async humanType(page, selector, text, options = {}) {
        const element = await page.$(selector);
        if (!element) throw new Error(`Element not found: ${selector}`);

        await element.click();
        await this.randomDelay(100, 300);

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // Random typing speed (50-150ms per character)
            const delay = this.randomInt(50, 150);

            // 2% chance of typo (then backspace)
            if (Math.random() < 0.02 && i > 0) {
                const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
                await page.keyboard.type(wrongChar, { delay: delay });
                await this.randomDelay(100, 200);
                await page.keyboard.press('Backspace');
                await this.randomDelay(50, 100);
            }

            await page.keyboard.type(char, { delay: delay });

            // Occasional pause (thinking)
            if (Math.random() < 0.1) {
                await this.randomDelay(200, 500);
            }
        }
    }

    /**
     * Move mouse in human-like curve to element
     */
    static async humanMouseMove(page, selector) {
        const element = await page.$(selector);
        if (!element) return;

        const box = await element.boundingBox();
        if (!box) return;

        // Target: random point within element
        const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
        const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

        // Get current mouse position (approximate)
        const currentX = Math.random() * 1920;
        const currentY = Math.random() * 1080;

        // Generate bezier curve points
        const steps = this.randomInt(20, 40);
        const points = this.generateBezierCurve(
            currentX, currentY,
            targetX, targetY,
            steps
        );

        // Move along curve
        for (const point of points) {
            await page.mouse.move(point.x, point.y);
            await this.randomDelay(5, 15);
        }
    }

    /**
     * Click with human-like behavior
     */
    static async humanClick(page, selector, options = {}) {
        await this.humanMouseMove(page, selector);
        await this.randomDelay(50, 150);

        // Mouse down
        await page.mouse.down();
        await this.randomDelay(50, 100); // Hold duration
        await page.mouse.up();

        await this.randomDelay(100, 300);
    }

    /**
     * Scroll with human-like behavior
     */
    static async humanScroll(page, distance) {
        const steps = Math.abs(distance) / this.randomInt(50, 150);
        const direction = distance > 0 ? 1 : -1;

        for (let i = 0; i < steps; i++) {
            const scrollAmount = direction * this.randomInt(30, 100);
            await page.evaluate((amount) => {
                window.scrollBy(0, amount);
            }, scrollAmount);

            await this.randomDelay(50, 150);

            // Occasional pause while scrolling
            if (Math.random() < 0.2) {
                await this.randomDelay(200, 500);
            }
        }
    }

    /**
     * Random delay between min and max ms
     */
    static async randomDelay(min, max) {
        const delay = this.randomInt(min, max);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Random integer between min and max (inclusive)
     */
    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Generate bezier curve points for mouse movement
     */
    static generateBezierCurve(x1, y1, x2, y2, steps) {
        const points = [];

        // Control points for curve
        const cx1 = x1 + (x2 - x1) * (0.3 + Math.random() * 0.2);
        const cy1 = y1 + (y2 - y1) * (0.1 + Math.random() * 0.3);
        const cx2 = x1 + (x2 - x1) * (0.6 + Math.random() * 0.2);
        const cy2 = y1 + (y2 - y1) * (0.7 + Math.random() * 0.2);

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const t1 = 1 - t;

            // Cubic bezier formula
            const x = Math.pow(t1, 3) * x1 +
                3 * Math.pow(t1, 2) * t * cx1 +
                3 * t1 * Math.pow(t, 2) * cx2 +
                Math.pow(t, 3) * x2;

            const y = Math.pow(t1, 3) * y1 +
                3 * Math.pow(t1, 2) * t * cy1 +
                3 * t1 * Math.pow(t, 2) * cy2 +
                Math.pow(t, 3) * y2;

            points.push({ x, y });
        }

        return points;
    }

    /**
     * Simulate reading page (random pauses and scrolls)
     */
    static async simulateReading(page, duration = 3000) {
        const endTime = Date.now() + duration;

        while (Date.now() < endTime) {
            // Random scroll
            if (Math.random() < 0.3) {
                const scrollDistance = this.randomInt(-200, 400);
                await this.humanScroll(page, scrollDistance);
            }

            // Random mouse movement
            if (Math.random() < 0.4) {
                const x = this.randomInt(100, 1800);
                const y = this.randomInt(100, 900);
                await page.mouse.move(x, y);
            }

            await this.randomDelay(500, 1500);
        }
    }
}

module.exports = HumanBehavior;
