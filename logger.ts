/**
 * Simple debug logger for KindleCards plugin
 */
export class DebugLogger {
    private static isDebugEnabled = false;

    static enableDebug(): void {
        this.isDebugEnabled = true;
    }

    static disableDebug(): void {
        this.isDebugEnabled = false;
    }

    static log(message: string, ...args: any[]): void {
        if (this.isDebugEnabled) {
            console.log(`[KindleCards] ${message}`, ...args);
        }
    }

    static warn(message: string, ...args: any[]): void {
        if (this.isDebugEnabled) {
            console.warn(`[KindleCards] ${message}`, ...args);
        }
    }

    static error(message: string, ...args: any[]): void {
        // Always log errors
        console.error(`[KindleCards] ${message}`, ...args);
    }
}
