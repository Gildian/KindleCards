import { CardReviewData, ReviewResult, SpacedRepetitionStats } from './types';

/**
 * Spaced Repetition System using SM-2 Algorithm
 *
 * This implementation provides intelligent scheduling of flashcard reviews
 * based on user performance to optimize long-term retention.
 */
export class SpacedRepetitionSystem {
    private reviewData: Map<string, CardReviewData> = new Map();

    constructor(savedData?: Record<string, CardReviewData>) {
        this.loadData(savedData);
    }

    /**
     * Load saved review data, converting date strings back to Date objects
     */
    private loadData(savedData?: Record<string, CardReviewData>): void {
        if (!savedData) return;

        for (const [cardId, data] of Object.entries(savedData)) {
            try {
                this.reviewData.set(cardId, {
                    ...data,
                    nextReview: new Date(data.nextReview),
                    lastReviewed: new Date(data.lastReviewed)
                });
            } catch (error) {
                console.warn(`Failed to load review data for card ${cardId}:`, error);
            }
        }
    }

    /**
     * Get or initialize review data for a card
     */
    getCardData(cardId: string): CardReviewData {
        if (!this.reviewData.has(cardId)) {
            this.reviewData.set(cardId, this.createNewCardData(cardId));
        }
        return this.reviewData.get(cardId)!;
    }

    /**
     * Create initial data structure for a new card
     */
    private createNewCardData(cardId: string): CardReviewData {
        return {
            cardId,
            easeFactor: 2.5,
            interval: 1,
            repetitions: 0,
            nextReview: new Date(),
            lastReviewed: new Date(0),
            totalReviews: 0,
            correctStreak: 0,
            difficulty: 'new'
        };
    }

    /**
     * Update card data after a review session using simplified SM-2 algorithm
     */
    reviewCard(cardId: string, result: ReviewResult): CardReviewData {
        const data = this.getCardData(cardId);
        const now = new Date();

        // Update basic tracking data
        data.lastReviewed = now;
        data.totalReviews++;

        // Ensure quality is within valid range (0-5)
        const quality = Math.max(0, Math.min(5, result.quality));

        if (quality >= 3) {
            this.handleCorrectAnswer(data, quality);
        } else {
            this.handleIncorrectAnswer(data);
        }

        // Set next review date
        this.scheduleNextReview(data, now);

        return data;
    }

    /**
     * Handle correct answer and update intervals/ease factor
     */
    private handleCorrectAnswer(data: CardReviewData, quality: number): void {
        data.correctStreak++;
        data.repetitions++;

        // Update difficulty stage
        if (data.difficulty === 'new') {
            data.difficulty = 'learning';
            data.interval = 1;
        } else if (data.difficulty === 'learning' && data.repetitions >= 2) {
            data.difficulty = 'review';
            data.interval = 6;
        } else if (data.difficulty === 'review') {
            // SM-2 algorithm for mature cards
            data.interval = Math.ceil(data.interval * data.easeFactor);
        } else {
            // Still in learning phase
            data.interval = Math.min(data.interval + 1, 6);
        }

        // Update ease factor using SM-2 formula
        data.easeFactor = Math.max(1.3,
            data.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        );
    }

    /**
     * Handle incorrect answer and reset the card
     */
    private handleIncorrectAnswer(data: CardReviewData): void {
        data.correctStreak = 0;
        data.repetitions = 0;
        data.difficulty = 'learning';
        data.interval = 1;
        data.easeFactor = Math.max(1.3, data.easeFactor - 0.2);
    }

    /**
     * Schedule the next review date based on interval
     */
    private scheduleNextReview(data: CardReviewData, now: Date): void {
        const millisecondsPerDay = 24 * 60 * 60 * 1000;
        data.nextReview = new Date(now.getTime() + data.interval * millisecondsPerDay);
    }

    /**
     * Get cards that are due for review
     */
    getDueCards(cardIds: string[]): string[] {
        const now = new Date();
        return cardIds.filter(cardId => {
            const data = this.getCardData(cardId);
            return data.nextReview <= now;
        });
    }

    /**
     * Get cards sorted by review priority
     * Priority order: Overdue → Due → New → Future
     */
    getSortedCards(cardIds: string[]): string[] {
        const now = new Date();

        return cardIds.sort((a, b) => {
            const dataA = this.getCardData(a);
            const dataB = this.getCardData(b);

            return this.comparePriority(dataA, dataB, now);
        });
    }

    /**
     * Compare two cards for priority sorting
     */
    private comparePriority(dataA: CardReviewData, dataB: CardReviewData, now: Date): number {
        const aDue = dataA.nextReview <= now;
        const bDue = dataB.nextReview <= now;

        // Due cards always come before non-due cards
        if (aDue && !bDue) return -1;
        if (!aDue && bDue) return 1;

        // Among due cards, most overdue first
        if (aDue && bDue) {
            const aOverdue = now.getTime() - dataA.nextReview.getTime();
            const bOverdue = now.getTime() - dataB.nextReview.getTime();
            return bOverdue - aOverdue;
        }

        // Among non-due cards, prioritize by difficulty stage
        const difficultyOrder = { 'new': 0, 'learning': 1, 'review': 2 };
        const aDiffOrder = difficultyOrder[dataA.difficulty];
        const bDiffOrder = difficultyOrder[dataB.difficulty];

        if (aDiffOrder !== bDiffOrder) {
            return aDiffOrder - bDiffOrder;
        }

        // Finally, sort by ease factor (lower = more difficult)
        return dataA.easeFactor - dataB.easeFactor;
    }

    /**
     * Get comprehensive study statistics
     */
    getStats(cardIds: string[]): SpacedRepetitionStats {
        const now = new Date();
        const stats = {
            total: cardIds.length,
            new: 0,
            learning: 0,
            review: 0,
            due: 0,
            averageEase: 0
        };

        let totalEase = 0;

        for (const cardId of cardIds) {
            const data = this.getCardData(cardId);

            // Count by difficulty
            stats[data.difficulty]++;

            // Count due cards
            if (data.nextReview <= now) {
                stats.due++;
            }

            totalEase += data.easeFactor;
        }

        stats.averageEase = cardIds.length > 0 ? totalEase / cardIds.length : 2.5;
        return stats;
    }

    /**
     * Export data for persistence (converts Dates to strings)
     */
    exportData(): Record<string, CardReviewData> {
        const exported: Record<string, CardReviewData> = {};
        for (const [cardId, data] of this.reviewData) {
            exported[cardId] = { ...data };
        }
        return exported;
    }

    /**
     * Generate a unique, stable card ID from clipping data
     * Uses Unicode-safe hash function to avoid btoa() issues
     */
    static generateCardId(title: string, author: string, content: string): string {
        if (!title || !author || !content) {
            throw new Error('Card ID generation requires title, author, and content');
        }

        const combined = `${title.trim()}|${author.trim()}|${content.substring(0, 100).trim()}`;
        return this.hashString(combined);
    }

    /**
     * Simple hash function that works with Unicode characters
     */
    private static hashString(str: string): string {
        let hash = 0;

        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        // Convert to positive hex string and ensure consistent length
        const hashStr = Math.abs(hash).toString(16);
        return hashStr.padStart(8, '0').substring(0, 32);
    }
}
