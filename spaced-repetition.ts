export interface CardReviewData {
    cardId: string;
    easeFactor: number;      // Ease factor (starts at 2.5)
    interval: number;        // Days until next review
    repetitions: number;     // Number of successful repetitions
    nextReview: Date;        // When this card should be reviewed next
    lastReviewed: Date;      // When this card was last reviewed
    totalReviews: number;    // Total number of times reviewed
    correctStreak: number;   // Current streak of correct answers
    difficulty: 'new' | 'learning' | 'review'; // Card learning stage
}

export interface ReviewResult {
    quality: number; // 0-5 scale (0=complete blackout, 5=perfect)
    timeSpent?: number; // Time spent on the card in seconds
}

export class SpacedRepetitionSystem {
    private reviewData: Map<string, CardReviewData> = new Map();

    constructor(savedData?: Record<string, CardReviewData>) {
        if (savedData) {
            for (const [cardId, data] of Object.entries(savedData)) {
                // Convert date strings back to Date objects
                this.reviewData.set(cardId, {
                    ...data,
                    nextReview: new Date(data.nextReview),
                    lastReviewed: new Date(data.lastReviewed)
                });
            }
        }
    }

    /**
     * Get or initialize review data for a card
     */
    getCardData(cardId: string): CardReviewData {
        if (!this.reviewData.has(cardId)) {
            this.reviewData.set(cardId, {
                cardId,
                easeFactor: 2.5,
                interval: 1,
                repetitions: 0,
                nextReview: new Date(),
                lastReviewed: new Date(0),
                totalReviews: 0,
                correctStreak: 0,
                difficulty: 'new'
            });
        }
        return this.reviewData.get(cardId)!;
    }

    /**
     * Update card data after a review session (simplified SM-2 algorithm)
     */
    reviewCard(cardId: string, result: ReviewResult): CardReviewData {
        const data = this.getCardData(cardId);
        const now = new Date();

        data.lastReviewed = now;
        data.totalReviews++;

        // Convert quality to 0-5 scale if needed
        const quality = Math.max(0, Math.min(5, result.quality));

        if (quality >= 3) {
            // Correct answer
            data.correctStreak++;
            data.repetitions++;

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

            // Update ease factor (SM-2)
            data.easeFactor = Math.max(1.3, data.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

        } else {
            // Incorrect answer - reset the card
            data.correctStreak = 0;
            data.repetitions = 0;
            data.difficulty = 'learning';
            data.interval = 1;
            data.easeFactor = Math.max(1.3, data.easeFactor - 0.2);
        }

        // Set next review date
        data.nextReview = new Date(now.getTime() + data.interval * 24 * 60 * 60 * 1000);

        return data;
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
     * Get cards sorted by priority (due cards first, then by difficulty)
     */
    getSortedCards(cardIds: string[]): string[] {
        const now = new Date();
        
        return cardIds.sort((a, b) => {
            const dataA = this.getCardData(a);
            const dataB = this.getCardData(b);

            // Due cards come first
            const aDue = dataA.nextReview <= now;
            const bDue = dataB.nextReview <= now;

            if (aDue && !bDue) return -1;
            if (!aDue && bDue) return 1;

            // Among due cards, prioritize by how overdue they are
            if (aDue && bDue) {
                const aOverdue = now.getTime() - dataA.nextReview.getTime();
                const bOverdue = now.getTime() - dataB.nextReview.getTime();
                return bOverdue - aOverdue; // Most overdue first
            }

            // Among non-due cards, prioritize new cards and difficult cards
            const difficultyOrder = { 'new': 0, 'learning': 1, 'review': 2 };
            const aDiffOrder = difficultyOrder[dataA.difficulty];
            const bDiffOrder = difficultyOrder[dataB.difficulty];

            if (aDiffOrder !== bDiffOrder) {
                return aDiffOrder - bDiffOrder;
            }

            // Finally, sort by ease factor (lower = more difficult)
            return dataA.easeFactor - dataB.easeFactor;
        });
    }

    /**
     * Get study statistics
     */
    getStats(cardIds: string[]): {
        total: number;
        new: number;
        learning: number;
        review: number;
        due: number;
        averageEase: number;
    } {
        const now = new Date();
        let newCards = 0, learningCards = 0, reviewCards = 0, dueCards = 0;
        let totalEase = 0;

        for (const cardId of cardIds) {
            const data = this.getCardData(cardId);
            
            switch (data.difficulty) {
                case 'new': newCards++; break;
                case 'learning': learningCards++; break;
                case 'review': reviewCards++; break;
            }

            if (data.nextReview <= now) {
                dueCards++;
            }

            totalEase += data.easeFactor;
        }

        return {
            total: cardIds.length,
            new: newCards,
            learning: learningCards,
            review: reviewCards,
            due: dueCards,
            averageEase: cardIds.length > 0 ? totalEase / cardIds.length : 2.5
        };
    }

    /**
     * Export data for persistence
     */
    exportData(): Record<string, CardReviewData> {
        const exported: Record<string, CardReviewData> = {};
        for (const [cardId, data] of this.reviewData) {
            exported[cardId] = { ...data };
        }
        return exported;
    }

    /**
     * Generate a unique card ID from a KindleClipping
     * Uses a simple hash function to avoid Unicode issues with btoa()
     */
    static generateCardId(title: string, author: string, content: string): string {
        const combined = `${title}|${author}|${content.substring(0, 100)}`;
        
        // Simple hash function that works with Unicode
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        // Convert to positive hex string
        const hashStr = Math.abs(hash).toString(16);
        
        // Pad with zeros and truncate to 32 characters
        return hashStr.padStart(8, '0').substring(0, 32);
    }
}
